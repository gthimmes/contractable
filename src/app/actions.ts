"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import {
  login,
  logout,
  createSession,
  getImpersonatorId,
  setImpersonator,
} from "@/lib/auth";
import { requestPasswordReset, resetPassword } from "@/lib/reset";
import { loginLimiter, resetRequestLimiter } from "@/lib/ratelimit";
import { importCounterparties } from "@/lib/export";
import { createApiKey } from "@/lib/api";
import { saveAttachment, deleteAttachment } from "@/lib/attachments";
import { cookies } from "next/headers";
import {
  createContract,
  createAmendment,
  addVersion,
  updateContract,
  deleteContract,
} from "@/lib/contracts";
import { startWorkflow, submitDecision } from "@/lib/workflow";
import {
  createSignatureRequests,
  signDocument,
  declineSignature,
  reissueSignature,
} from "@/lib/signing";
import { addObligation, setObligationStatus } from "@/lib/obligations";
import { proposeRedline, acceptRedline, rejectRedline } from "@/lib/redline";
import { generateVersionFromTemplate } from "@/lib/generation";
import { assertCan, type Action, type Actor } from "@/lib/permissions";
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

// --- Authorization guards --------------------------------------------------

async function actor(): Promise<Actor & { name: string }> {
  const me = await getCurrentUser();
  return { id: me.id, role: me.role, name: me.name };
}

/** Assert the current user may perform a non-contract-scoped action. */
async function guard(action: Action) {
  const me = await actor();
  assertCan(me, action);
  return me;
}

/** Assert the current user may act on a specific contract (role or ownership). */
async function guardContract(action: Action, contractId: string) {
  const me = await actor();
  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { ownerId: true, createdById: true },
  });
  assertCan(me, action, c ?? undefined);
  return me;
}

/** Assert the current user may manage an obligation (via its contract). */
async function guardObligation(action: Action, obligationId: string) {
  const me = await actor();
  const ob = await prisma.obligation.findUnique({
    where: { id: obligationId },
    select: { contract: { select: { ownerId: true, createdById: true } } },
  });
  assertCan(me, action, ob?.contract ?? undefined);
  return me;
}

// --- Authentication --------------------------------------------------------

export async function loginAction(formData: FormData) {
  const email = str(formData.get("email")).toLowerCase();
  const password = str(formData.get("password"));
  // Rate-limit per account before touching credentials, so guessing is
  // throttled regardless of whether the account exists.
  if (!loginLimiter.attempt(`login:${email}`).allowed) {
    redirect("/login?error=rate");
  }
  const ok = await login(email, password);
  if (!ok) redirect("/login?error=1");
  loginLimiter.reset(`login:${email}`);
  redirect("/");
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = str(formData.get("email")).toLowerCase();
  // Always land on the same confirmation — whether the account exists, or the
  // request was throttled — so the endpoint can't enumerate users.
  if (email && resetRequestLimiter.attempt(`reset:${email}`).allowed) {
    await requestPasswordReset(email);
  }
  redirect("/forgot?sent=1");
}

export async function resetPasswordAction(formData: FormData) {
  const token = str(formData.get("token"));
  const password = str(formData.get("password"));
  const confirm = str(formData.get("confirm"));
  if (password.length < 8) redirect(`/reset/${token}?error=short`);
  if (password !== confirm) redirect(`/reset/${token}?error=mismatch`);
  const ok = await resetPassword(token, password);
  if (!ok) redirect(`/reset/${token}?error=invalid`);
  redirect("/login?reset=1");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

/**
 * Admin impersonation: act as another user (to demo/verify role behaviour).
 * The real admin id is preserved so they can return. Only an admin — or an
 * already-active impersonation started by one — may do this.
 */
export async function impersonateAction(formData: FormData) {
  const me = await getCurrentUser();
  const impersonatorId = await getImpersonatorId();
  const realAdminId = impersonatorId ?? (me.role === "ADMIN" ? me.id : null);
  if (!realAdminId) throw new Error("Only admins can impersonate.");

  const targetId = str(formData.get("userId"));
  if (targetId === realAdminId) {
    await setImpersonator(null); // returning to self
    await createSession(realAdminId);
  } else {
    // createSession clears any impersonation marker, so set ours after it.
    await createSession(targetId);
    await setImpersonator(realAdminId);
  }
  revalidatePath("/", "layout");
  redirect("/");
}

export async function createContractAction(formData: FormData) {
  const me = await guard("contract:create");
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
  const contractId = str(formData.get("contractId"));
  const me = await guardContract("workflow:start", contractId);
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
  const contractId = str(formData.get("contractId"));
  const me = await guardContract("signature:manage", contractId);

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
  const contractId = str(formData.get("contractId"));
  const me = await guardContract("obligation:manage", contractId);
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
  const contractId = str(formData.get("contractId"));
  const obligationId = str(formData.get("obligationId"));
  const me = await guardObligation("obligation:manage", obligationId);
  await setObligationStatus(
    obligationId,
    str(formData.get("status")) as "OPEN" | "DONE" | "WAIVED",
    { id: me.id, name: me.name }
  );
  if (contractId) revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/obligations");
}

export async function addCommentAction(formData: FormData) {
  const me = await guard("comment:create");
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
  const contractId = str(formData.get("contractId"));
  const me = await guardContract("contract:version", contractId);
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
  const contractId = str(formData.get("contractId"));
  const me = await guardContract("contract:edit", contractId);
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
  const contractId = str(formData.get("contractId"));
  const me = await guardContract("contract:delete", contractId);
  await deleteContract(contractId, { id: me.id, name: me.name });
  revalidatePath("/contracts");
  redirect("/contracts");
}

export async function createAmendmentAction(formData: FormData) {
  const me = await guard("contract:create");
  const parentId = str(formData.get("contractId"));
  const amendment = await createAmendment(parentId, { id: me.id, name: me.name });
  revalidatePath("/contracts");
  redirect(`/contracts/${amendment.id}`);
}

// ===========================================================================
// Document generation & redlining
// ===========================================================================

export async function generateDocumentAction(formData: FormData) {
  const contractId = str(formData.get("contractId"));
  const me = await guardContract("contract:generate", contractId);
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
  const contractId = str(formData.get("contractId"));
  const me = await guardContract("redline:propose", contractId);
  await proposeRedline(
    contractId,
    str(formData.get("body")),
    optStr(formData.get("note")),
    { id: me.id, name: me.name }
  );
  revalidatePath(`/contracts/${contractId}`);
}

export async function acceptRedlineAction(formData: FormData) {
  const contractId = str(formData.get("contractId"));
  const me = await guardContract("redline:resolve", contractId);
  await acceptRedline(str(formData.get("versionId")), { id: me.id, name: me.name });
  revalidatePath(`/contracts/${contractId}`);
}

export async function rejectRedlineAction(formData: FormData) {
  const contractId = str(formData.get("contractId"));
  const me = await guardContract("redline:resolve", contractId);
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
  await guardContract("signature:manage", contractId);
  await prisma.signature.delete({
    where: { id: str(formData.get("signatureId")) },
  });
  revalidatePath(`/contracts/${contractId}`);
}

export async function reissueSignatureAction(formData: FormData) {
  const contractId = str(formData.get("contractId"));
  const me = await guardContract("signature:manage", contractId);
  await reissueSignature(str(formData.get("signatureId")), {
    id: me.id,
    name: me.name,
  });
  revalidatePath(`/contracts/${contractId}`);
}

export async function updateObligationAction(formData: FormData) {
  const contractId = str(formData.get("contractId"));
  const obligationId = str(formData.get("obligationId"));
  await guardObligation("obligation:manage", obligationId);
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
  const obligationId = str(formData.get("obligationId"));
  await guardObligation("obligation:manage", obligationId);
  await prisma.obligation.delete({ where: { id: obligationId } });
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/obligations");
}

export async function deleteCommentAction(formData: FormData) {
  const me = await getCurrentUser();
  const contractId = str(formData.get("contractId"));
  const comment = await prisma.comment.findUnique({
    where: { id: str(formData.get("commentId")) },
  });
  // Authors delete their own comments; admins can delete any.
  if (comment && (comment.authorId === me.id || me.role === "ADMIN")) {
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
  await guard("counterparty:manage");
  await prisma.counterparty.create({ data: counterpartyData(formData) });
  revalidatePath("/counterparties");
  redirect("/counterparties");
}

export async function updateCounterpartyAction(formData: FormData) {
  await guard("counterparty:manage");
  await prisma.counterparty.update({
    where: { id: str(formData.get("id")) },
    data: counterpartyData(formData),
  });
  revalidatePath("/counterparties");
  redirect("/counterparties");
}

export async function deleteCounterpartyAction(formData: FormData) {
  await guard("counterparty:manage");
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
  await guard("org:manage");
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
  await guard("template:manage");
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
  await guard("template:manage");
  const id = str(formData.get("id"));
  await prisma.contract.updateMany({
    where: { templateId: id },
    data: { templateId: null },
  });
  await prisma.contractTemplate.delete({ where: { id } });
  revalidatePath("/templates");
}

// ===========================================================================
// Attachments
// ===========================================================================

export async function uploadAttachmentAction(formData: FormData) {
  const contractId = str(formData.get("contractId"));
  const me = await guardContract("comment:create", contractId);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Pick a file to upload.");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  await saveAttachment(
    contractId,
    { name: file.name, type: file.type, bytes },
    { id: me.id, name: me.name }
  );
  revalidatePath(`/contracts/${contractId}`);
}

export async function deleteAttachmentAction(formData: FormData) {
  const contractId = str(formData.get("contractId"));
  const attachmentId = str(formData.get("attachmentId"));
  const me = await actor();
  const att = await prisma.attachment.findUniqueOrThrow({ where: { id: attachmentId } });
  // The uploader may remove their own file; otherwise contract:edit applies.
  if (att.uploadedById !== me.id) {
    await guardContract("contract:edit", contractId);
  }
  await deleteAttachment(attachmentId, { id: me.id, name: me.name });
  revalidatePath(`/contracts/${contractId}`);
}

// ===========================================================================
// Notifications
// ===========================================================================

export async function markNotificationsReadAction() {
  const me = await actor();
  await prisma.notification.updateMany({
    where: { userId: me.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout");
}

// ===========================================================================
// Import
// ===========================================================================

export async function importCounterpartiesAction(formData: FormData) {
  const me = await guard("counterparty:manage");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/counterparties?import=empty");
  }
  if (file.size > 1_000_000) redirect("/counterparties?import=toolarge");
  const text = await file.text();
  const result = await importCounterparties(text, { id: me.id, name: me.name });
  revalidatePath("/counterparties");
  redirect(
    `/counterparties?import=done&created=${result.created}&updated=${result.updated}&skipped=${result.skipped}`
  );
}

// ===========================================================================
// API keys — admin-managed bearer keys for /api/v1
// ===========================================================================

export async function createApiKeyAction(formData: FormData) {
  await guard("org:manage");
  const name = str(formData.get("name"));
  const scope = str(formData.get("scope")) === "WRITE" ? "WRITE" : "READ";
  if (!name) throw new Error("Key name is required.");
  const { plaintext } = await createApiKey(name, scope);
  // One-time reveal: flash the plaintext via an httpOnly cookie the page
  // reads and clears on the next render — never in a URL.
  const store = await cookies();
  store.set("contractable_new_api_key", plaintext, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60,
  });
  revalidatePath("/settings/api-keys");
  redirect("/settings/api-keys");
}

export async function toggleApiKeyAction(formData: FormData) {
  await guard("org:manage");
  const id = str(formData.get("id"));
  const key = await prisma.apiKey.findUniqueOrThrow({ where: { id } });
  await prisma.apiKey.update({ where: { id }, data: { active: !key.active } });
  revalidatePath("/settings/api-keys");
}

export async function deleteApiKeyAction(formData: FormData) {
  await guard("org:manage");
  const id = str(formData.get("id"));
  await prisma.apiKey.delete({ where: { id } });
  revalidatePath("/settings/api-keys");
}

// ===========================================================================
// Webhooks — admin-managed outbound endpoints
// ===========================================================================

export async function saveWebhookAction(formData: FormData) {
  await guard("org:manage");
  const id = optStr(formData.get("id"));
  const data = {
    url: str(formData.get("url")),
    events: optStr(formData.get("events")) ?? "*",
  };
  if (!/^https?:\/\//.test(data.url)) throw new Error("Webhook URL must be http(s).");
  if (id) {
    await prisma.webhookEndpoint.update({ where: { id }, data });
  } else {
    // Secret is generated server-side and shown once on the page.
    const { randomBytes } = await import("crypto");
    await prisma.webhookEndpoint.create({
      data: { ...data, secret: `whsec_${randomBytes(24).toString("hex")}` },
    });
  }
  revalidatePath("/settings/webhooks");
}

export async function toggleWebhookAction(formData: FormData) {
  await guard("org:manage");
  const id = str(formData.get("id"));
  const endpoint = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id } });
  await prisma.webhookEndpoint.update({
    where: { id },
    data: { active: !endpoint.active },
  });
  revalidatePath("/settings/webhooks");
}

export async function deleteWebhookAction(formData: FormData) {
  await guard("org:manage");
  const id = str(formData.get("id"));
  await prisma.webhookEndpoint.delete({ where: { id } });
  revalidatePath("/settings/webhooks");
}

// ===========================================================================
// Clause library CRUD — pre-approved language, managed like templates
// ===========================================================================

export async function saveClauseAction(formData: FormData) {
  await guard("template:manage");
  const id = optStr(formData.get("id"));
  const data = {
    name: str(formData.get("name")),
    category: optStr(formData.get("category")),
    description: optStr(formData.get("description")),
    body: str(formData.get("body")),
  };
  if (id) {
    await prisma.clause.update({ where: { id }, data });
  } else {
    await prisma.clause.create({ data });
  }
  revalidatePath("/clauses");
  redirect("/clauses");
}

export async function deleteClauseAction(formData: FormData) {
  await guard("template:manage");
  const id = str(formData.get("id"));
  await prisma.clause.delete({ where: { id } });
  revalidatePath("/clauses");
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
  await guard("workflowTemplate:manage");
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
  await guard("workflowTemplate:manage");
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
  await guard("user:manage");
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
  await guard("user:manage");
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
