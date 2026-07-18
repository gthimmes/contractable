import { createHash, randomBytes } from "crypto";
import { prisma } from "./db";

// REST API auth: bearer API keys, hashed at rest. The plaintext key
// ("ck_" + 48 hex chars) is shown once at creation; requests present it as
// `Authorization: Bearer ck_…` and are matched by sha256.

export type ApiScope = "READ" | "WRITE";

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Generate a new key. Returns the plaintext once; only the hash is stored. */
export async function createApiKey(name: string, scope: ApiScope) {
  const plaintext = `ck_${randomBytes(24).toString("hex")}`;
  const row = await prisma.apiKey.create({
    data: {
      name,
      keyHash: hashApiKey(plaintext),
      prefix: plaintext.slice(0, 12),
      scope,
    },
  });
  return { plaintext, row };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

/**
 * Resolve the Authorization header to an active key with the required scope.
 * Throws ApiError(401/403) — route handlers convert via `handle`.
 */
export async function requireApiKey(req: Request, scope: ApiScope) {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(ck_[0-9a-f]+)$/i);
  if (!match) throw new ApiError(401, "Missing or malformed Authorization bearer token");
  const key = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(match[1]) } });
  if (!key || !key.active) throw new ApiError(401, "Unknown or revoked API key");
  if (scope === "WRITE" && key.scope !== "WRITE") {
    throw new ApiError(403, "This key is read-only");
  }
  // Best-effort usage stamp; never fails the request.
  prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
  return key;
}

/** Wrap a handler: ApiError → JSON status; anything else → 500. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("[api] unhandled:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

// --- Serializers (stable public shapes, not raw Prisma rows) ---------------

export function serializeContract(c: {
  id: string;
  reference: string;
  title: string;
  status: string;
  category: string | null;
  counterparty: string | null;
  counterpartyRef?: { name: string } | null;
  value: number | null;
  currency: string | null;
  effectiveDate: Date | null;
  expirationDate: Date | null;
  executedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  currentVersion?: { versionNumber: number; contentHash: string } | null;
}) {
  return {
    id: c.id,
    reference: c.reference,
    title: c.title,
    status: c.status,
    category: c.category,
    counterparty: c.counterpartyRef?.name ?? c.counterparty,
    value: c.value,
    currency: c.currency,
    effectiveDate: c.effectiveDate,
    expirationDate: c.expirationDate,
    executedAt: c.executedAt,
    currentVersion: c.currentVersion
      ? { number: c.currentVersion.versionNumber, contentHash: c.currentVersion.contentHash }
      : null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export function serializeCounterparty(p: {
  id: string;
  name: string;
  legalName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  jurisdiction: string | null;
  createdAt: Date;
}) {
  return {
    id: p.id,
    name: p.name,
    legalName: p.legalName,
    contactName: p.contactName,
    contactEmail: p.contactEmail,
    jurisdiction: p.jurisdiction,
    createdAt: p.createdAt,
  };
}

export function serializeObligation(o: {
  id: string;
  contractId: string;
  title: string;
  type: string;
  status: string;
  dueDate: Date | null;
  createdAt: Date;
}) {
  return {
    id: o.id,
    contractId: o.contractId,
    title: o.title,
    type: o.type,
    status: o.status,
    dueDate: o.dueDate,
    createdAt: o.createdAt,
  };
}
