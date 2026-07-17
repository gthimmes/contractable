import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server, type Socket } from "net";
import { sendSmtp, smtpConfigFromEnv, encodeBody, buildMime } from "./smtp";

/**
 * In-process mock SMTP server. Speaks just enough of the protocol to accept a
 * message, records the full client conversation, and lets tests script
 * failures. No TLS (STARTTLS is deliberately not advertised).
 */
function mockServer(opts: { rejectRcpt?: boolean; authRequired?: boolean } = {}) {
  const commands: string[] = [];
  let data = "";
  const server: Server = createServer((socket: Socket) => {
    let inData = false;
    let buffer = "";
    socket.write("220 mock ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      // In DATA mode, wait for the terminating <CRLF>.<CRLF>.
      if (inData) {
        const end = buffer.indexOf("\r\n.\r\n");
        if (end === -1) return;
        data = buffer.slice(0, end);
        buffer = buffer.slice(end + 5);
        inData = false;
        socket.write("250 OK queued\r\n");
        return;
      }
      let idx;
      while (!inData && (idx = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        commands.push(line);
        if (line.startsWith("EHLO")) {
          socket.write("250-mock greets you\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 1000000\r\n");
        } else if (line.startsWith("AUTH PLAIN")) {
          const token = Buffer.from(line.split(" ")[2], "base64").toString("utf8");
          socket.write(token === "\0user\0secret" ? "235 ok\r\n" : "535 bad credentials\r\n");
        } else if (line.startsWith("MAIL FROM")) {
          socket.write("250 ok\r\n");
        } else if (line.startsWith("RCPT TO")) {
          socket.write(opts.rejectRcpt ? "550 no such user\r\n" : "250 ok\r\n");
        } else if (line === "DATA") {
          inData = true;
          socket.write("354 go ahead\r\n");
        } else if (line === "QUIT") {
          socket.write("221 bye\r\n");
          socket.end();
        } else {
          socket.write("250 ok\r\n");
        }
      }
    });
  });
  const listening = new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve((server.address() as { port: number }).port);
    });
  });
  return {
    port: () => listening,
    commands,
    getData: () => data,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

let servers: { close: () => Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(servers.map((s) => s.close()));
  servers = [];
});

const MSG = {
  to: "larry@acme.example",
  toName: "Larry Legal",
  subject: "Approval requested: CTR-0002",
  body: "Please review.\n.hidden dot line\nThanks.",
};

describe("sendSmtp", () => {
  it("delivers a message through the full EHLO/AUTH/MAIL/RCPT/DATA conversation", async () => {
    const mock = mockServer();
    servers.push(mock);
    const port = await mock.port();

    await sendSmtp(
      { host: "127.0.0.1", port, from: "Contractable <no-reply@acme.example>", user: "user", pass: "secret" },
      MSG
    );

    expect(mock.commands[0]).toMatch(/^EHLO /);
    expect(mock.commands).toContainEqual(expect.stringMatching(/^AUTH PLAIN /));
    expect(mock.commands).toContain("MAIL FROM:<no-reply@acme.example>");
    expect(mock.commands).toContain("RCPT TO:<larry@acme.example>");
    expect(mock.commands).toContain("DATA");
    expect(mock.commands).toContain("QUIT");

    const data = mock.getData();
    expect(data).toContain("From: Contractable <no-reply@acme.example>");
    expect(data).toContain("To: Larry Legal <larry@acme.example>");
    expect(data).toContain("Subject: Approval requested: CTR-0002");
    // Dot-stuffed body line survives the transport encoding.
    expect(data).toContain("\r\n..hidden dot line");
  });

  it("works unauthenticated when no credentials are configured", async () => {
    const mock = mockServer();
    servers.push(mock);
    const port = await mock.port();
    await sendSmtp({ host: "127.0.0.1", port, from: "no-reply@acme.example" }, MSG);
    expect(mock.commands.some((c) => c.startsWith("AUTH"))).toBe(false);
    expect(mock.getData()).toContain("Subject: Approval requested: CTR-0002");
  });

  it("rejects with the server's error when a recipient is refused", async () => {
    const mock = mockServer({ rejectRcpt: true });
    servers.push(mock);
    const port = await mock.port();
    await expect(
      sendSmtp({ host: "127.0.0.1", port, from: "no-reply@acme.example" }, MSG)
    ).rejects.toThrow(/550/);
  });

  it("rejects on bad credentials without leaking them in the error", async () => {
    const mock = mockServer();
    servers.push(mock);
    const port = await mock.port();
    await expect(
      sendSmtp(
        { host: "127.0.0.1", port, from: "no-reply@acme.example", user: "user", pass: "WRONG" },
        MSG
      )
    ).rejects.toSatisfy((e: Error) => /535/.test(e.message) && !/WRONG/.test(e.message));
  });
});

describe("encodeBody", () => {
  it("dot-stuffs leading dots and normalizes newlines to CRLF", () => {
    expect(encodeBody("a\n.b\r\nc")).toBe("a\r\n..b\r\nc");
  });
});

describe("buildMime", () => {
  it("encodes non-ASCII subjects per RFC 2047", () => {
    const mime = buildMime(
      "no-reply@acme.example",
      { to: "x@y.example", subject: "Vertrag genehmigt — Prüfung", body: "b" },
      new Date("2026-07-17T00:00:00Z")
    );
    expect(mime).toContain("Subject: =?UTF-8?B?");
    expect(mime).not.toContain("Subject: Vertrag");
  });
});

describe("smtpConfigFromEnv", () => {
  it("returns null when SMTP_HOST is unset", () => {
    expect(smtpConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("builds a config with sensible defaults", () => {
    const c = smtpConfigFromEnv({
      SMTP_HOST: "smtp.example.com",
      SMTP_USER: "u",
      SMTP_PASS: "p",
    } as NodeJS.ProcessEnv);
    expect(c).toMatchObject({ host: "smtp.example.com", port: 587, secure: false });
  });

  it("treats port 465 as implicit TLS", () => {
    const c = smtpConfigFromEnv({
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "465",
    } as NodeJS.ProcessEnv);
    expect(c?.secure).toBe(true);
  });
});
