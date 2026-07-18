import { randomBytes } from "crypto";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { prisma } from "./db";
import { recordAudit } from "./audit";

// Supporting files on a contract, stored on local disk under uploads/ (which
// is gitignored). Files are written under a random name — the original
// filename lives only in the database row — so path traversal via a crafted
// name is impossible. For production object storage (S3 etc.), swap the
// read/write/delete calls; the schema and routes don't change.

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "png", "jpg", "jpeg", "gif", "txt", "csv", "md", "eml",
]);

export function uploadsDir(): string {
  return path.join(process.cwd(), "uploads");
}

export function validateAttachment(fileName: string, size: number): string | null {
  if (size === 0) return "The file is empty.";
  if (size > MAX_ATTACHMENT_BYTES) {
    return `File too large (max ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB).`;
  }
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return `File type ".${ext}" is not allowed.`;
  }
  return null;
}

export async function saveAttachment(
  contractId: string,
  file: { name: string; type: string; bytes: Buffer },
  actor: { id: string; name: string }
) {
  const problem = validateAttachment(file.name, file.bytes.length);
  if (problem) throw new Error(problem);

  const ext = file.name.split(".").pop()!.toLowerCase();
  const storedName = `${randomBytes(16).toString("hex")}.${ext}`;
  await mkdir(uploadsDir(), { recursive: true });
  await writeFile(path.join(uploadsDir(), storedName), file.bytes);

  const row = await prisma.attachment.create({
    data: {
      contractId,
      fileName: file.name,
      storedName,
      mimeType: file.type || "application/octet-stream",
      size: file.bytes.length,
      uploadedById: actor.id,
    },
  });
  await recordAudit(prisma, {
    contractId,
    entityType: "CONTRACT",
    entityId: row.id,
    action: "ATTACHMENT_ADDED",
    summary: `Attachment added: "${file.name}" (${Math.ceil(file.bytes.length / 1024)} KB)`,
    actorId: actor.id,
    actorLabel: actor.name,
  });
  return row;
}

export async function deleteAttachment(
  attachmentId: string,
  actor: { id: string; name: string }
) {
  const row = await prisma.attachment.findUniqueOrThrow({ where: { id: attachmentId } });
  await prisma.attachment.delete({ where: { id: attachmentId } });
  await unlink(path.join(uploadsDir(), row.storedName)).catch(() => {});
  await recordAudit(prisma, {
    contractId: row.contractId,
    entityType: "CONTRACT",
    entityId: row.id,
    action: "ATTACHMENT_REMOVED",
    summary: `Attachment removed: "${row.fileName}"`,
    actorId: actor.id,
    actorLabel: actor.name,
  });
}

/** Remove all of a contract's attachment files from disk (rows cascade). */
export async function removeAttachmentFiles(contractId: string) {
  const rows = await prisma.attachment.findMany({ where: { contractId } });
  await Promise.all(
    rows.map((r) => unlink(path.join(uploadsDir(), r.storedName)).catch(() => {}))
  );
}
