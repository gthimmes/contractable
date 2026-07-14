import { randomBytes } from "crypto";
import { prisma } from "./db";
import { recordAudit } from "./audit";
import { completeSignatureStep } from "./workflow";
import { queueEmails, appUrl } from "./email";

function newToken(): string {
  return randomBytes(24).toString("hex");
}

export interface SignerInput {
  signerName: string;
  signerEmail: string;
}

/**
 * Send the current version of a contract out for signature: create a pending,
 * tokenized signing request per signer, in the order provided.
 */
export async function createSignatureRequests(
  contractId: string,
  signers: SignerInput[],
  actor: { id: string; name: string }
) {
  if (signers.length === 0) throw new Error("At least one signer is required.");

  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.findUniqueOrThrow({
      where: { id: contractId },
    });
    if (!contract.currentVersionId) {
      throw new Error("Contract has no current version to sign.");
    }

    // Replace any existing pending requests for a clean re-send.
    await tx.signature.deleteMany({
      where: { contractId, status: "PENDING" },
    });

    const created = [];
    for (let i = 0; i < signers.length; i++) {
      const s = signers[i];
      const sig = await tx.signature.create({
        data: {
          contractId,
          versionId: contract.currentVersionId,
          signerName: s.signerName,
          signerEmail: s.signerEmail,
          order: i,
          token: newToken(),
          status: "PENDING",
        },
      });
      created.push(sig);
    }

    if (contract.status !== "OUT_FOR_SIGNATURE") {
      await tx.contract.update({
        where: { id: contractId },
        data: { status: "OUT_FOR_SIGNATURE" },
      });
    }

    await recordAudit(tx, {
      contractId,
      entityType: "SIGNATURE",
      entityId: contractId,
      action: "SENT_FOR_SIGNATURE",
      summary: `Sent for signature to ${signers.map((s) => s.signerName).join(", ")}`,
      actorId: actor.id,
      actorLabel: actor.name,
      data: { signers: signers.map((s) => s.signerEmail) },
    });

    // Email each signer their unique signing link.
    await queueEmails(
      tx,
      created.map((sig) => ({
        toEmail: sig.signerEmail,
        toName: sig.signerName,
        subject: `Signature requested: ${contract.reference} — ${contract.title}`,
        body: `Hi ${sig.signerName},\n\nYou've been asked to sign "${contract.title}" (${contract.reference}).\n\nReview & sign here: ${appUrl()}/sign/${sig.token}\n\n— Contractable`,
        kind: "SIGNATURE_REQUEST" as const,
        contractId,
      }))
    );

    return created;
  });
}

export async function getSignatureByToken(token: string) {
  return prisma.signature.findUnique({
    where: { token },
    include: {
      contract: true,
      version: true,
    },
  });
}

/**
 * Record a signature against a signing token. Captures a tamper-evident record:
 * the document hash at signing time, timestamp, and IP. When it is the final
 * outstanding signature, the contract's workflow signature step is completed
 * and the contract is executed.
 */
export async function signDocument(params: {
  token: string;
  signatureData: string;
  signatureType: "TYPED" | "DRAWN";
  ipAddress?: string;
}) {
  const { token, signatureData, signatureType, ipAddress } = params;
  return prisma.$transaction(async (tx) => {
    const sig = await tx.signature.findUnique({
      where: { token },
      include: { version: true, contract: true },
    });
    if (!sig) throw new Error("Invalid signing link.");
    if (sig.status !== "PENDING") {
      throw new Error(`This document was already ${sig.status.toLowerCase()}.`);
    }

    // Enforce signing order: all earlier-ordered signers must be done.
    const blocking = await tx.signature.findFirst({
      where: {
        contractId: sig.contractId,
        order: { lt: sig.order },
        status: { not: "SIGNED" },
      },
    });
    if (blocking) {
      throw new Error(
        `Waiting on ${blocking.signerName} to sign before you can sign.`
      );
    }

    await tx.signature.update({
      where: { id: sig.id },
      data: {
        status: "SIGNED",
        signatureData,
        signatureType,
        documentHash: sig.version.contentHash,
        signedAt: new Date(),
        ipAddress: ipAddress ?? null,
      },
    });

    await recordAudit(tx, {
      contractId: sig.contractId,
      entityType: "SIGNATURE",
      entityId: sig.id,
      action: "SIGNED",
      summary: `${sig.signerName} signed (${signatureType.toLowerCase()})`,
      actorLabel: sig.signerName,
      data: {
        documentHash: sig.version.contentHash,
        ipAddress: ipAddress ?? null,
      },
    });

    // If every signer is done, complete the signature step / execute.
    const remaining = await tx.signature.count({
      where: { contractId: sig.contractId, status: { not: "SIGNED" } },
    });
    if (remaining === 0) {
      await completeSignatureStep(tx, sig.contractId, {
        id: sig.contract.createdById,
        name: "System",
      });
    }

    return { done: remaining === 0 };
  });
}

export async function declineSignature(token: string, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const sig = await tx.signature.findUnique({ where: { token } });
    if (!sig) throw new Error("Invalid signing link.");
    if (sig.status !== "PENDING") {
      throw new Error(`This document was already ${sig.status.toLowerCase()}.`);
    }
    await tx.signature.update({
      where: { id: sig.id },
      data: { status: "DECLINED", declinedAt: new Date() },
    });
    await recordAudit(tx, {
      contractId: sig.contractId,
      entityType: "SIGNATURE",
      entityId: sig.id,
      action: "DECLINED",
      summary: `${sig.signerName} declined to sign${reason ? `: ${reason}` : ""}`,
      actorLabel: sig.signerName,
    });
  });
}
