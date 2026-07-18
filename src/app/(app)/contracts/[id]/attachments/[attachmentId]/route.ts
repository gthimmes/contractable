import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { uploadsDir } from "@/lib/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /contracts/:id/attachments/:attachmentId — authenticated download.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id, attachmentId } = await params;
  const att = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!att || att.contractId !== id) return new Response("Not found", { status: 404 });

  let bytes: Buffer;
  try {
    // storedName is server-generated (hex + extension) — no traversal risk.
    bytes = await readFile(path.join(uploadsDir(), att.storedName));
  } catch {
    return new Response("File missing from storage", { status: 404 });
  }

  // Sanitize the original filename for the header.
  const safeName = att.fileName.replace(/[^\w.\- ()]/g, "_");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": att.mimeType,
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Content-Length": String(att.size),
    },
  });
}
