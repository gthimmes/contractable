// Minimal dependency-free SMTP client (node:net + node:tls).
//
// Like the template, diff, and PDF engines, this is hand-rolled to keep the
// runtime dependency-free. It speaks just enough RFC 5321 to deliver mail
// through a real relay:
//   - EHLO, multi-line reply parsing;
//   - STARTTLS upgrade when the server advertises it (port 587 style), or
//     implicit TLS from the first byte (port 465 style, `secure: true`);
//   - AUTH PLAIN (preferred) or AUTH LOGIN;
//   - MAIL FROM / RCPT TO / DATA with dot-stuffing and CRLF normalization.
//
// It is deliberately small: one message per connection, no pipelining, no
// retries (the caller decides what a failure means). See smtp.test.ts, which
// exercises the full conversation against an in-process mock server.

import { createConnection, type Socket } from "net";
import { connect as tlsConnect, type TLSSocket } from "tls";

export interface SmtpConfig {
  host: string;
  port: number;
  /** TLS from the first byte (port 465). Otherwise STARTTLS is used when advertised. */
  secure?: boolean;
  user?: string;
  pass?: string;
  /** Envelope + From header, e.g. "Contractable <no-reply@example.com>". */
  from: string;
  timeoutMs?: number;
}

export interface SmtpMessage {
  to: string;
  toName?: string | null;
  subject: string;
  /** Plain-text body. */
  body: string;
}

interface Reply {
  code: number;
  lines: string[];
}

/** Read config from SMTP_* environment variables; null when not configured. */
export function smtpConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SmtpConfig | null {
  if (!env.SMTP_HOST) return null;
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ? Number(env.SMTP_PORT) : 587,
    secure: env.SMTP_SECURE === "true" || env.SMTP_PORT === "465",
    user: env.SMTP_USER || undefined,
    pass: env.SMTP_PASS || undefined,
    from: env.SMTP_FROM || `Contractable <no-reply@${env.SMTP_HOST}>`,
  };
}

/** Extract the bare address from "Name <addr>" or return the input as-is. */
function bareAddress(s: string): string {
  const m = s.match(/<([^>]+)>/);
  return m ? m[1] : s.trim();
}

/** RFC 5321 §4.5.2 dot-stuffing + CRLF line endings for the DATA section. */
export function encodeBody(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => (line.startsWith(".") ? "." + line : line))
    .join("\r\n");
}

/** Encode a header value as RFC 2047 base64 if it contains non-ASCII. */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Build the RFC 5322 message (headers + body) for DATA. */
export function buildMime(from: string, msg: SmtpMessage, date: Date): string {
  const to = msg.toName ? `${encodeHeader(msg.toName)} <${msg.to}>` : msg.to;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(msg.subject)}`,
    `Date: ${date.toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
  ];
  return headers.join("\r\n") + "\r\n\r\n" + encodeBody(msg.body);
}

/**
 * A tiny promise-based line protocol wrapper around a socket. SMTP replies are
 * one or more "NNN-text" lines terminated by a "NNN text" line.
 */
class SmtpConnection {
  private buffer = "";
  private waiter: ((r: Reply) => void) | null = null;
  private failure: ((e: Error) => void) | null = null;

  constructor(private socket: Socket | TLSSocket, private timeoutMs: number) {
    this.attach(socket);
  }

  /** (Re)attach data/error handlers — used again after the STARTTLS upgrade. */
  attach(socket: Socket | TLSSocket) {
    this.socket = socket;
    this.buffer = "";
    socket.setTimeout(this.timeoutMs, () => {
      this.fail(new Error("SMTP timeout"));
      socket.destroy();
    });
    socket.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf8");
      this.drain();
    });
    socket.on("error", (err: Error) => this.fail(err));
  }

  private fail(err: Error) {
    const f = this.failure;
    this.waiter = null;
    this.failure = null;
    f?.(err);
  }

  private drain() {
    if (!this.waiter) return;
    // A complete reply ends with a line whose 4th char is a space (or a bare
    // 3-digit code) followed by CRLF.
    const lines = this.buffer.split(/\r?\n/);
    const complete: string[] = [];
    for (let i = 0; i < lines.length - 1; i++) {
      complete.push(lines[i]);
      const m = lines[i].match(/^(\d{3})([ -]?)/);
      if (m && m[2] !== "-") {
        this.buffer = lines.slice(i + 1).join("\n");
        const w = this.waiter!;
        this.waiter = null;
        this.failure = null;
        w({ code: Number(m[1]), lines: complete });
        return;
      }
    }
  }

  /** Wait for the next full reply. */
  read(): Promise<Reply> {
    return new Promise((resolve, reject) => {
      this.waiter = resolve;
      this.failure = reject;
      this.drain();
    });
  }

  /** Send a command and wait for its reply, asserting an expected class. */
  async command(line: string, expect: number[]): Promise<Reply> {
    this.socket.write(line + "\r\n");
    const reply = await this.read();
    if (!expect.includes(reply.code)) {
      const shown = line.startsWith("AUTH") ? line.split(" ").slice(0, 2).join(" ") + " ***" : line;
      throw new Error(`SMTP: "${shown}" → ${reply.code} ${reply.lines.join(" / ")}`);
    }
    return reply;
  }

  write(raw: string) {
    this.socket.write(raw);
  }

  end() {
    this.socket.end();
  }

  get raw(): Socket | TLSSocket {
    return this.socket;
  }
}

/** Deliver one message. Resolves on 250 after DATA; rejects on any failure. */
export async function sendSmtp(config: SmtpConfig, msg: SmtpMessage): Promise<void> {
  const timeoutMs = config.timeoutMs ?? 15_000;
  const socket: Socket | TLSSocket = config.secure
    ? tlsConnect({ host: config.host, port: config.port, servername: config.host })
    : createConnection({ host: config.host, port: config.port });
  const conn = new SmtpConnection(socket, timeoutMs);

  try {
    const greeting = await conn.read();
    if (greeting.code !== 220) {
      throw new Error(`SMTP: unexpected greeting ${greeting.code}`);
    }

    let ehlo = await conn.command("EHLO contractable.local", [250]);

    // Opportunistic STARTTLS when we're on a cleartext socket and the server
    // offers it (the standard port-587 submission path).
    const advertisesStartTls = ehlo.lines.some((l) => /STARTTLS/i.test(l));
    if (!config.secure && advertisesStartTls) {
      await conn.command("STARTTLS", [220]);
      const upgraded = tlsConnect({
        socket: conn.raw,
        servername: config.host,
      });
      await new Promise<void>((resolve, reject) => {
        upgraded.once("secureConnect", () => resolve());
        upgraded.once("error", reject);
      });
      conn.attach(upgraded);
      ehlo = await conn.command("EHLO contractable.local", [250]);
    }

    if (config.user && config.pass) {
      const mechanisms = ehlo.lines.find((l) => /^\d{3}[ -]AUTH /i.test(l)) ?? "";
      if (/PLAIN/i.test(mechanisms) || !/LOGIN/i.test(mechanisms)) {
        const token = Buffer.from(`\0${config.user}\0${config.pass}`, "utf8").toString("base64");
        await conn.command(`AUTH PLAIN ${token}`, [235]);
      } else {
        await conn.command("AUTH LOGIN", [334]);
        await conn.command(Buffer.from(config.user, "utf8").toString("base64"), [334]);
        await conn.command(Buffer.from(config.pass, "utf8").toString("base64"), [235]);
      }
    }

    await conn.command(`MAIL FROM:<${bareAddress(config.from)}>`, [250]);
    await conn.command(`RCPT TO:<${bareAddress(msg.to)}>`, [250, 251]);
    await conn.command("DATA", [354]);
    conn.write(buildMime(config.from, msg, new Date()) + "\r\n.\r\n");
    const accepted = await conn.read();
    if (accepted.code !== 250) {
      throw new Error(`SMTP: message rejected ${accepted.code} ${accepted.lines.join(" / ")}`);
    }
    await conn.command("QUIT", [221]).catch(() => {});
  } finally {
    conn.end();
  }
}
