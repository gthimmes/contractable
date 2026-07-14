"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getCurrentUser, currentUserCookieName } from "@/lib/session";
import {
  createContract,
  addVersion,
  updateContract,
  deleteContract,
} from "@/lib/contracts";
import { startWorkflow, submitDecision } from "@/lib/workflow";
import {
  createSignatureRequests,
  signDocument,
  declineSignature,
} from "@/lib/signing";
import { addObligation, setObligationStatus } from "@/lib/obligations";
import { proposeRedline, acceptRedline, rejectRedline } from "@/lib/redline";
import { generateVersionFromTemplate } from "@/lib/generation";
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

  const counterpartyId = optStr(formData.get("counterpartyId"));
  let counterpartyName = optStr(formData.get("counterparty"));
  if (counterpartyId) {
    const cp = await prisma.counterparty.findUnique({ where: { id: counterpartyId } });
    if (cp) counterpartyName = cp.name;
  }

  const contract = await createContract(
    {
      title,
      description: optStr(formData.get("description")),
      counterparty: counterpartyName,
      counterpartyId,
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

// ===========================================================================
// Contract metadata CRUD
// ===========================================================================

export async function updateContractAction(formData: FormData) {
  const me = await getCurrentUser();
  const contractId = str(formData.get("contractId"));
  const counterpartyId = optStr(formData.get("counterpartyId"));
  let counterpartyName = optStr(formData.get("counterparty"));
  if (counterpartyId) {
    const cp = await prisma.counterparty.findUnique({
      where: { id: counterpartyId },
    });
    if (cp) counterpartyName = cp.name;
  }
  await updateContract(
    contractId,
    {
      title: str(formData.get("title")) || undefined,
      description: optStr(formData.get("description")),
      counterparty: counterpartyName,
      counterpartyId,
      category: optStr(formData.get("category")),
      value: optNum(formData.get("value")),
      currency: optStr(formData.get("currency")) ?? "USD",
      effectiveDate: optDate(formData.get("effectiveDate")),
      expirationDate: optDate(formData.get("expirationDate")),
      ownerId: optStr(formData.get("ownerId")),
    },
    { id: me.id, name: me.name }
  );
  redirect(`/contracts/${contractId}`);
}

export async function deleteContractAction(formData: FormData) {
  await deleteContract(str(formData.get("contractId")));
  revalidatePath("/contracts");
  redirect("/contracts");
}

// ===========================================================================
// Document generation & redlining
// ===========================================================================

export async function generateDocumentAction(formData: FormData) {
  const me = await getCurrentUser();
  const contractId = str(formData.get("contractId"));
  const templateId = str(formData.get("templateId"));
  let data: Record<string, unknown> = {};
  const raw = str(formData.get("data"));
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }
  }
  await generateVersionFromTemplate(contractId, templateId, data, {
    id: me.id,
    name: me.name,
  });
  revalidatePath(`/contracts/${contractId}`);
}

export async function proposeRedlineAction(formData: FormData) {
  const me = await getCurrentUser();
  const contractId = str(formData.get("contractId"));
  await proposeRedline(
    contractId,
    str(formData.get("body")),
    optStr(formData.get("note")),
    { id: me.id, name: me.name }
  );
  revalidatePath(`/contracts/${contractId}`);
}

export async function acceptRedlineAction(formData: FormData) {
  const me = await getCurrentUser();
  const contractId = str(formData.get("contractId"));
  await acceptRedline(str(formData.get("versionId")), { id: me.id, name: me.name });
  revalidatePath(`/contracts/${contractId}`);
}

export async function rejectRedlineAction(formData: FormData) {
  const me = await getCurrentUser();
  const contractId = str(formData.get("contractId"));
  await rejectRedline(
    str(formData.get("versionId")),
    optStr(formData.get("reason")),
    { id: me.id, name: me.name }
  );
  revalidatePath(`/contracts/${contractId}`);
}

// ===========================================================================
// Signatures, obligations, comments — edit/delete
// ===========================================================================

export async function removeSignatureAction(formData: FormData) {
  const contractId = str(formData.get("contractId"));
  await prisma.signature.delete({
    where: { id: str(formData.get("signatureId")) },
  });
  revalidatePath(`/contracts/${contractId}`);
}

export async function updateObligationAction(formData: FormData) {
  const contractId = str(formData.get("contractId"));
  await prisma.obligation.update({
    where: { id: str(formData.get("obligationId")) },
    data: {
      title: str(formData.get("title")),
      description: optStr(formData.get("description")),
      type: str(formData.get("type")),
      dueDate: optDate(formData.get("dueDate")),
      ownerId: optStr(formData.get("ownerId")),
    },
  });
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/obligations");
}

export async function deleteObligationAction(formData: FormData) {
  const contractId = str(formData.get("contractId"));
  await prisma.obligation.delete({
    where: { id: str(formData.get("obligationId")) },
  });
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/obligations");
}

export async function deleteCommentAction(formData: FormData) {
  const me = await getCurrentUser();
  const contractId = str(formData.get("contractId"));
  const comment = await prisma.comment.findUnique({
    where: { id: str(formData.get("commentId")) },
  });
  if (comment && comment.authorId === me.id) {
    await prisma.comment.delete({ where: { id: comment.id } });
  }
  revalidatePath(`/contracts/${contractId}`);
}

// ===========================================================================
// Counterparties CRUD
// ===========================================================================

function counterpartyData(formData: FormData) {
  return {
    name: str(formData.get("name")),
    legalName: optStr(formData.get("legalName")),
    address: optStr(formData.get("address")),
    contactName: optStr(formData.get("contactName")),
    contactEmail: optStr(formData.get("contactEmail")),
    jurisdiction: optStr(formData.get("jurisdiction")),
    notes: optStr(formData.get("notes")),
  };
}

export async function createCounterpartyAction(formData: FormData) {
  await prisma.counterparty.create({ data: counterpartyData(formData) });
  revalidatePath("/counterparties");
  redirect("/counterparties");
}

export async function updateCounterpartyAction(formData: FormData) {
  await prisma.counterparty.update({
    where: { id: str(formData.get("id")) },
    data: counterpartyData(formData),
  });
  revalidatePath("/counterparties");
  redirect("/counterparties");
}

export async function deleteCounterpartyAction(formData: FormData) {
  const id = str(formData.get("id"));
  // Detach from any contracts first (optional relation, keep the contracts).
  await prisma.contract.updateMany({
    where: { counterpartyId: id },
    data: { counterpartyId: null },
  });
  await prisma.counterparty.delete({ where: { id } });
  revalidatePath("/counterparties");
}

// ===========================================================================
// Organization settings (singleton)
// ===========================================================================

export async function updateOrganizationAction(formData: FormData) {
  const data = {
    name: str(formData.get("name")) || "Our Company",
    legalName: optStr(formData.get("legalName")),
    address: optStr(formData.get("address")),
    email: optStr(formData.get("email")),
    signatoryName: optStr(formData.get("signatoryName")),
    signatoryTitle: optStr(formData.get("signatoryTitle")),
    jurisdiction: optStr(formData.get("jurisdiction")),
  };
  const existing = await prisma.organization.findFirst();
  if (existing) {
    await prisma.organization.update({ where: { id: existing.id }, data });
  } else {
    await prisma.organization.create({ data });
  }
  revalidatePath("/settings");
}

// ===========================================================================
// Contract templates CRUD
// ===========================================================================

export async function saveTemplateAction(formData: FormData) {
  const id = optStr(formData.get("id"));
  const data = {
    name: str(formData.get("name")),
    category: optStr(formData.get("category")),
    description: optStr(formData.get("description")),
    body: str(formData.get("body")),
  };
  if (id) {
    await prisma.contractTemplate.update({ where: { id }, data });
  } else {
    await prisma.contractTemplate.create({ data });
  }
  revalidatePath("/templates");
  redirect("/templates");
}

export async function deleteTemplateAction(formData: FormData) {
  const id = str(formData.get("id"));
  await prisma.contract.updateMany({
    where: { templateId: id },
    data: { templateId: null },
  });
  await prisma.contractTemplate.delete({ where: { id } });
  revalidatePath("/templates");
}

// ===========================================================================
// Workflow templates CRUD (the visual builder posts steps as JSON)
// ===========================================================================

interface StepDraft {
  name: string;
  type: string;
  assigneeRole?: string | null;
  assigneeUserId?: string | null;
  completionRule?: string;
  allowReject?: boolean;
}

export async function saveWorkflowAction(formData: FormData) {
  const id = optStr(formData.get("id"));
  const name = str(formData.get("name"));
  const description = optStr(formData.get("description"));
  const isDefault = str(formData.get("isDefault")) === "true";

  let steps: StepDraft[] = [];
  try {
    steps = JSON.parse(str(formData.get("steps")) || "[]");
  } catch {
    steps = [];
  }
  const stepCreate = steps.map((s, i) => ({
    order: i + 1,
    name: s.name || `Step ${i + 1}`,
    type: s.type || "APPROVAL",
    assigneeRole: s.assigneeRole || null,
    assigneeUserId: s.assigneeUserId || null,
    completionRule: s.completionRule || "ALL",
    allowReject: s.allowReject !== false,
  }));

  if (isDefault) {
    await prisma.workflowTemplate.updateMany({ data: { isDefault: false } });
  }

  if (id) {
    await prisma.workflowStepTemplate.deleteMany({ where: { templateId: id } });
    await prisma.workflowTemplate.update({
      where: { id },
      data: { name, description, isDefault, steps: { create: stepCreate } },
    });
  } else {
    await prisma.workflowTemplate.create({
      data: { name, description, isDefault, steps: { create: stepCreate } },
    });
  }
  revalidatePath("/workflows");
  redirect("/workflows");
}

export async function deleteWorkflowAction(formData: FormData) {
  const id = str(formData.get("id"));
  const inUse = await prisma.workflowInstance.count({ where: { templateId: id } });
  if (inUse > 0) {
    throw new Error(
      "This workflow has been used by contracts and can't be deleted. It stays for their audit history."
    );
  }
  await prisma.workflowTemplate.delete({ where: { id } });
  revalidatePath("/workflows");
}

// ===========================================================================
// Users admin CRUD
// ===========================================================================

export async function saveUserAction(formData: FormData) {
  const id = optStr(formData.get("id"));
  const data = {
    name: str(formData.get("name")),
    email: str(formData.get("email")),
    role: str(formData.get("role")) || "VIEWER",
    title: optStr(formData.get("title")),
  };
  if (id) {
    await prisma.user.update({ where: { id }, data });
  } else {
    await prisma.user.create({ data });
  }
  revalidatePath("/settings");
  redirect("/settings");
}

export async function deleteUserAction(formData: FormData) {
  const id = str(formData.get("id"));
  const refs = await prisma.contract.count({
    where: { OR: [{ createdById: id }, { ownerId: id }] },
  });
  if (refs > 0) {
    throw new Error(
      "This user is tied to contracts and can't be deleted. Reassign those first."
    );
  }
  await prisma.user.delete({ where: { id } });
  revalidatePath("/settings");
}
