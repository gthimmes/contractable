"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getCurrentUser, currentUserCookieName } from "@/lib/session";
import { createContract, addVersion } from "@/lib/contracts";
import { startWorkflow, submitDecision } from "@/lib/workflow";
import {
  createSignatureRequests,
  signDocument,
  declineSignature,
} from "@/lib/signing";
import { addObligation, setObligationStatus } from "@/lib/obligations";
import type { Decision, ObligationType } from "@/lib/constants";

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function optStr(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s.length ? s : null;
}
function optDate(v: FormDataEntryValue | null): Date | null {
  const s = str(v);
  return s ? new Date(s) : null;
}
function optNum(v: FormDataEntryValue | null): number | null {
  const s = str(v);
  if (!s) return null;
  const n = Number(s.replace(/[,$]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export async function switchUserAction(formData: FormData) {
  const uid = str(formData.get("userId"));
  const store = await cookies();
  store.set(currentUserCookieName(), uid, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/", "layout");
}

export async function createContractAction(formData: FormData) {
  const me = await getCurrentUser();
  const title = str(formData.get("title"));
  if (!title) throw new Error("Title is required.");

  let body = str(formData.get("body"));
  const templateId = optStr(formData.get("templateId"));
  if (!body && templateId) {
    const tpl = await prisma.contractTemplate.findUnique({ where: { id: templateId } });
    body = tpl?.body ?? "";
  }

  const contract = await createContract(
    {
      title,
      description: optStr(formData.get("description")),
      counterparty: optStr(formData.get("counterparty")),
      category: optStr(formData.get("category")),
      value: optNum(formData.get("value")),
      currency: optStr(formData.get("currency")) ?? "USD",
      effectiveDate: optDate(formData.get("effectiveDate")),
      expirationDate: optDate(formData.get("expirationDate")),
      createdById: me.id,
      ownerId: me.id,
      templateId,
      body: body || `${title}\n\n(Contract body to be drafted.)`,
    },
    { id: me.id, name: me.name }
  );

  redirect(`/contracts/${contract.id}`);
}

export async function startWorkflowAction(formData: FormData) {
  const me = await getCurrentUser();
  const contractId = str(formData.get("contractId"));
  const templateId = str(formData.get("templateId"));
  await startWorkflow(contractId, templateId, { id: me.id, name: me.name });
  revalidatePath(`/contracts/${contractId}`);
}

export async function decideAction(formData: FormData) {
  const me = await getCurrentUser();
  const contractId = str(formData.get("contractId"));
  await submitDecision({
    stepId: str(formData.get("stepId")),
    userId: me.id,
    decision: str(formData.get("decision")) as Extract<
      Decision,
      "APPROVED" | "REVIEWED" | "REJECTED"
    >,
    comment: optStr(formData.get("comment")) ?? undefined,
    actor: { id: me.id, name: me.name },
  });
  revalidatePath(`/contracts/${contractId}`);
}

export async function sendForSignatureAction(formData: FormData) {
  const me = await getCurrentUser();
  const contractId = str(formData.get("contractId"));

  const names = formData.getAll("signerName").map((v) => str(v));
  const emails = formData.getAll("signerEmail").map((v) => str(v));
  const signers = names
    .map((name, i) => ({ signerName: name, signerEmail: emails[i] ?? "" }))
    .filter((s) => s.signerName && s.signerEmail);

  if (signers.length === 0) throw new Error("Add at least one signer.");

  await createSignatureRequests(contractId, signers, { id: me.id, name: me.name });
  revalidatePath(`/contracts/${contractId}`);
}

export async function addObligationAction(formData: FormData) {
  const me = await getCurrentUser();
  const contractId = str(formData.get("contractId"));
  await addObligation(
    contractId,
    {
      title: str(formData.get("title")),
      description: optStr(formData.get("description")),
      type: str(formData.get("type")) as ObligationType,
      dueDate: optDate(formData.get("dueDate")),
      ownerId: optStr(formData.get("ownerId")),
    },
    { id: me.id, name: me.name }
  );
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/obligations");
}

export async function setObligationStatusAction(formData: FormData) {
  const me = await getCurrentUser();
  const contractId = str(formData.get("contractId"));
  await setObligationStatus(
    str(formData.get("obligationId")),
    str(formData.get("status")) as "OPEN" | "DONE" | "WAIVED",
    { id: me.id, name: me.name }
  );
  if (contractId) revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/obligations");
}

export async function addCommentAction(formData: FormData) {
  const me = await getCurrentUser();
  const contractId = str(formData.get("contractId"));
  const body = str(formData.get("body"));
  if (body) {
    await prisma.comment.create({
      data: { contractId, authorId: me.id, body },
    });
  }
  revalidatePath(`/contracts/${contractId}`);
}

export async function addVersionAction(formData: FormData) {
  const me = await getCurrentUser();
  const contractId = str(formData.get("contractId"));
  await addVersion(
    contractId,
    str(formData.get("body")),
    optStr(formData.get("note")),
    { id: me.id, name: me.name }
  );
  revalidatePath(`/contracts/${contractId}`);
}

// --- Public signing actions (used from the tokenized signing page) ---------

export async function signAction(formData: FormData) {
  const token = str(formData.get("token"));
  const { headers } = await import("next/headers");
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0].trim() ||
    h.get("x-real-ip") ||
    undefined;
  await signDocument({
    token,
    signatureData: str(formData.get("signatureData")),
    signatureType: (str(formData.get("signatureType")) || "TYPED") as
      | "TYPED"
      | "DRAWN",
    ipAddress: ip,
  });
  revalidatePath(`/sign/${token}`);
}

export async function declineAction(formData: FormData) {
  const token = str(formData.get("token"));
  await declineSignature(token, optStr(formData.get("reason")) ?? undefined);
  revalidatePath(`/sign/${token}`);
}
