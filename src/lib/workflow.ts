import type { CompletionRule, Decision, StepType } from "./constants";
import { prisma } from "./db";
import { recordAudit, type Db } from "./audit";
import { queueEmail, queueEmails, appUrl } from "./email";

/** Email the contract owner when the contract reaches a terminal state. */
async function notifyOwner(
  db: Db,
  contractId: string,
  kind: "CONTRACT_EXECUTED" | "CONTRACT_REJECTED"
) {
  const c = await db.contract.findUnique({
    where: { id: contractId },
    include: { owner: true },
  });
  if (!c?.owner) return;
  const url = `${appUrl()}/contracts/${contractId}`;
  const msg =
    kind === "CONTRACT_EXECUTED"
      ? {
          subject: `Executed: ${c.reference} — ${c.title}`,
          body: `Good news — "${c.title}" (${c.reference}) has been fully signed and is now executed.\n\n${url}\n\n— Contractable`,
        }
      : {
          subject: `Rejected: ${c.reference} — ${c.title}`,
          body: `"${c.title}" (${c.reference}) was rejected during review.\n\n${url}\n\n— Contractable`,
        };
  await queueEmail(db, {
    toEmail: c.owner.email,
    toName: c.owner.name,
    subject: msg.subject,
    body: msg.body,
    kind,
    contractId,
  });
}

// ===========================================================================
// PURE DECISION LOGIC  (no database — unit tested in workflow.test.ts)
// ===========================================================================

export type StepOutcome = "ACTIVE" | "COMPLETED" | "REJECTED";

const POSITIVE: Decision[] = ["APPROVED", "REVIEWED", "SIGNED"];

export interface EvalStep {
  completionRule: CompletionRule;
  allowReject: boolean;
  actions: { decision: Decision }[];
}

/**
 * Given a step's completion rule and the decisions recorded by its assignees,
 * determine whether the step is still waiting (ACTIVE), satisfied (COMPLETED),
 * or blocked by a rejection (REJECTED).
 *
 *  - A rejection short-circuits the step when allowReject is set.
 *  - ALL  → every assignee must have recorded a positive decision.
 *  - ANY  → at least one positive decision is enough.
 *  - A step with no assignees is vacuously complete.
 */
export function evaluateStepOutcome(step: EvalStep): StepOutcome {
  const rejected = step.actions.some((a) => a.decision === "REJECTED");
  if (rejected && step.allowReject) return "REJECTED";

  if (step.actions.length === 0) return "COMPLETED";

  const positives = step.actions.filter((a) => POSITIVE.includes(a.decision));

  if (step.completionRule === "ANY") {
    return positives.length >= 1 ? "COMPLETED" : "ACTIVE";
  }
  // ALL
  return positives.length === step.actions.length ? "COMPLETED" : "ACTIVE";
}

/** The decision a positive action carries, per step type. */
export function positiveDecisionFor(type: StepType): Decision {
  switch (type) {
    case "APPROVAL":
      return "APPROVED";
    case "REVIEW":
      return "REVIEWED";
    case "SIGNATURE":
      return "SIGNED";
  }
}

// ===========================================================================
// ORCHESTRATION  (database-backed)
// ===========================================================================

/**
 * Start a workflow for a contract: snapshot the template's steps into a running
 * instance, resolve assignees, activate the first step, and move the contract
 * into its first live state.
 */
export async function startWorkflow(
  contractId: string,
  templateId: string,
  actor: { id: string; name: string }
) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.findUniqueOrThrow({
      where: { id: contractId },
    });
    if (!["DRAFT", "REJECTED"].includes(contract.status)) {
      throw new Error(
        `Contract ${contract.reference} is ${contract.status}; only DRAFT or REJECTED contracts can enter a workflow.`
      );
    }

    const template = await tx.workflowTemplate.findUniqueOrThrow({
      where: { id: templateId },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    if (template.steps.length === 0) {
      throw new Error(`Workflow "${template.name}" has no steps.`);
    }

    const instance = await tx.workflowInstance.create({
      data: {
        contractId,
        templateId,
        status: "ACTIVE",
        currentStepOrder: template.steps[0].order,
      },
    });

    // Snapshot each step and resolve its assignees into action rows.
    for (const st of template.steps) {
      const step = await tx.workflowStepInstance.create({
        data: {
          instanceId: instance.id,
          order: st.order,
          name: st.name,
          type: st.type,
          completionRule: st.completionRule,
          allowReject: st.allowReject,
          status: "PENDING",
        },
      });

      const assignees = await resolveAssignees(tx, st);
      if (assignees.length > 0) {
        await tx.workflowStepAction.createMany({
          data: assignees.map((uid) => ({
            stepId: step.id,
            assigneeId: uid,
            decision: "PENDING",
          })),
        });
      }
    }

    await recordAudit(tx, {
      contractId,
      entityType: "WORKFLOW",
      entityId: instance.id,
      action: "WORKFLOW_STARTED",
      summary: `Started workflow "${template.name}"`,
      actorId: actor.id,
      actorLabel: actor.name,
      data: { templateId, steps: template.steps.length },
    });

    // Activate the first step.
    const firstStep = await tx.workflowStepInstance.findFirstOrThrow({
      where: { instanceId: instance.id },
      orderBy: { order: "asc" },
    });
    await activateStep(tx, contractId, firstStep.id, actor);

    return instance.id;
  });
}

async function resolveAssignees(
  db: Db,
  step: { assigneeUserId: string | null; assigneeRole: string | null; type: string }
): Promise<string[]> {
  // Signature steps are satisfied by collected signatures, not by user actions.
  if (step.type === "SIGNATURE") return [];
  if (step.assigneeUserId) return [step.assigneeUserId];
  if (step.assigneeRole) {
    const users = await db.user.findMany({
      where: { role: step.assigneeRole },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
  return [];
}

/** Move a step to ACTIVE and reflect it in the contract's status. */
async function activateStep(
  db: Db,
  contractId: string,
  stepId: string,
  actor: { id: string; name: string }
) {
  const step = await db.workflowStepInstance.update({
    where: { id: stepId },
    data: { status: "ACTIVE", activatedAt: new Date() },
  });
  await db.workflowInstance.update({
    where: { id: step.instanceId },
    data: { currentStepOrder: step.order },
  });

  const contractStatus =
    step.type === "SIGNATURE" ? "OUT_FOR_SIGNATURE" : "IN_REVIEW";
  await db.contract.update({
    where: { id: contractId },
    data: { status: contractStatus },
  });

  await recordAudit(db, {
    contractId,
    entityType: "STEP",
    entityId: step.id,
    action: "STEP_ACTIVATED",
    summary: `Step "${step.name}" (${step.type}) is now active`,
    actorId: actor.id,
    actorLabel: actor.name,
  });

  // A signature step with no configured signers still needs signers added and
  // sent from the contract page; a step with zero assignees of other types
  // completes vacuously. Otherwise, notify the assignees that they're up.
  if (step.type !== "SIGNATURE") {
    const actions = await db.workflowStepAction.findMany({
      where: { stepId: step.id },
      include: { assignee: true },
    });
    if (actions.length === 0) {
      await completeStepAndAdvance(db, contractId, step.id, actor);
    } else {
      const contract = await db.contract.findUniqueOrThrow({
        where: { id: contractId },
      });
      const verb = step.type === "APPROVAL" ? "approval" : "review";
      await queueEmails(
        db,
        actions.map((a) => ({
          toEmail: a.assignee.email,
          toName: a.assignee.name,
          subject: `Action needed: ${step.name} — ${contract.reference}`,
          body: `Hi ${a.assignee.name},\n\n"${contract.title}" (${contract.reference}) is waiting for your ${verb} at step "${step.name}".\n\nReview it here: ${appUrl()}/contracts/${contractId}\n\n— Contractable`,
          kind: "APPROVAL_REQUEST" as const,
          contractId,
        }))
      );
    }
  }
}

/**
 * Record one assignee's decision on the active step, then re-evaluate the step.
 * Returns the resulting step outcome.
 */
export async function submitDecision(params: {
  stepId: string;
  userId: string;
  decision: Extract<Decision, "APPROVED" | "REVIEWED" | "REJECTED">;
  comment?: string;
  actor: { id: string; name: string };
}): Promise<StepOutcome> {
  const { stepId, userId, decision, comment, actor } = params;
  return prisma.$transaction(async (tx) => {
    const step = await tx.workflowStepInstance.findUniqueOrThrow({
      where: { id: stepId },
      include: { instance: true, actions: true },
    });
    if (step.status !== "ACTIVE") {
      throw new Error(`Step "${step.name}" is not active (${step.status}).`);
    }
    const action = step.actions.find((a) => a.assigneeId === userId);
    if (!action) {
      throw new Error("You are not an assignee on this step.");
    }
    if (action.decision !== "PENDING") {
      throw new Error("You have already acted on this step.");
    }

    await tx.workflowStepAction.update({
      where: { id: action.id },
      data: { decision, comment: comment ?? null, actedAt: new Date() },
    });

    await recordAudit(tx, {
      contractId: step.instance.contractId,
      entityType: "STEP",
      entityId: step.id,
      action: `STEP_${decision}`,
      summary: `${actor.name} ${decision.toLowerCase()} step "${step.name}"${
        comment ? `: ${comment}` : ""
      }`,
      actorId: actor.id,
      actorLabel: actor.name,
    });

    const refreshed = await tx.workflowStepInstance.findUniqueOrThrow({
      where: { id: stepId },
      include: { actions: true },
    });
    const outcome = evaluateStepOutcome({
      completionRule: refreshed.completionRule as CompletionRule,
      allowReject: refreshed.allowReject,
      actions: refreshed.actions.map((a) => ({ decision: a.decision as Decision })),
    });

    if (outcome === "REJECTED") {
      await rejectWorkflow(tx, step.instance.contractId, step.id, step.instanceId, actor);
    } else if (outcome === "COMPLETED") {
      await completeStepAndAdvance(tx, step.instance.contractId, step.id, actor);
    }
    return outcome;
  });
}

/** Mark the current step complete and either activate the next step or finish. */
async function completeStepAndAdvance(
  db: Db,
  contractId: string,
  stepId: string,
  actor: { id: string; name: string }
) {
  const step = await db.workflowStepInstance.update({
    where: { id: stepId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  await recordAudit(db, {
    contractId,
    entityType: "STEP",
    entityId: step.id,
    action: "STEP_COMPLETED",
    summary: `Step "${step.name}" completed`,
    actorId: actor.id,
    actorLabel: actor.name,
  });

  const next = await db.workflowStepInstance.findFirst({
    where: { instanceId: step.instanceId, status: "PENDING" },
    orderBy: { order: "asc" },
  });

  if (next) {
    await activateStep(db, contractId, next.id, actor);
    return;
  }

  // No more steps — the workflow is complete.
  await db.workflowInstance.update({
    where: { id: step.instanceId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  // Terminal contract state depends on whether the workflow ended in signature.
  if (step.type === "SIGNATURE") {
    await db.contract.update({
      where: { id: contractId },
      data: { status: "EXECUTED", executedAt: new Date() },
    });
    await recordAudit(db, {
      contractId,
      entityType: "CONTRACT",
      entityId: contractId,
      action: "CONTRACT_EXECUTED",
      summary: "All signatures collected — contract executed",
      actorId: actor.id,
      actorLabel: actor.name,
    });
    await notifyOwner(db, contractId, "CONTRACT_EXECUTED");
  } else {
    await db.contract.update({
      where: { id: contractId },
      data: { status: "APPROVED" },
    });
    await recordAudit(db, {
      contractId,
      entityType: "CONTRACT",
      entityId: contractId,
      action: "CONTRACT_APPROVED",
      summary: "Workflow complete — contract approved",
      actorId: actor.id,
      actorLabel: actor.name,
    });
  }
}

async function rejectWorkflow(
  db: Db,
  contractId: string,
  stepId: string,
  instanceId: string,
  actor: { id: string; name: string }
) {
  await db.workflowStepInstance.update({
    where: { id: stepId },
    data: { status: "REJECTED", completedAt: new Date() },
  });
  await db.workflowInstance.update({
    where: { id: instanceId },
    data: { status: "REJECTED", completedAt: new Date() },
  });
  await db.contract.update({
    where: { id: contractId },
    data: { status: "REJECTED" },
  });
  await recordAudit(db, {
    contractId,
    entityType: "CONTRACT",
    entityId: contractId,
    action: "CONTRACT_REJECTED",
    summary: "Contract rejected in review",
    actorId: actor.id,
    actorLabel: actor.name,
  });
  await notifyOwner(db, contractId, "CONTRACT_REJECTED");
}

/**
 * Called by the signing module once every signature on a contract is complete.
 * Completes the active SIGNATURE step and advances/finishes the workflow.
 */
export async function completeSignatureStep(
  db: Db,
  contractId: string,
  actor: { id: string; name: string }
) {
  const activeSig = await db.workflowStepInstance.findFirst({
    where: {
      type: "SIGNATURE",
      status: "ACTIVE",
      instance: { contractId, status: "ACTIVE" },
    },
  });
  if (!activeSig) {
    // No workflow signature step (e.g. ad-hoc send) — just execute the contract.
    await db.contract.update({
      where: { id: contractId },
      data: { status: "EXECUTED", executedAt: new Date() },
    });
    await recordAudit(db, {
      contractId,
      entityType: "CONTRACT",
      entityId: contractId,
      action: "CONTRACT_EXECUTED",
      summary: "All signatures collected — contract executed",
      actorId: actor.id,
      actorLabel: actor.name,
    });
    await notifyOwner(db, contractId, "CONTRACT_EXECUTED");
    return;
  }
  await completeStepAndAdvance(db, contractId, activeSig.id, actor);
}
