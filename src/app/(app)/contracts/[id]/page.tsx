import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, getAllUsers } from "@/lib/session";
import { effectiveStatus } from "@/lib/obligations";
import { isSignatureExpired } from "@/lib/signing";
import { buildContext } from "@/lib/generation";
import { can } from "@/lib/permissions";
import {
  StatusBadge,
  Pill,
  formatDate,
  formatDateTime,
  formatMoney,
  EmptyState,
} from "@/components/ui";
import { SendForSignature } from "@/components/SendForSignature";
import { CopyLink } from "@/components/CopyLink";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { GenerateDocument } from "@/components/GenerateDocument";
import { RedlineEditor } from "@/components/RedlineEditor";
import { DiffView } from "@/components/DiffView";
import { CompareVersions } from "@/components/CompareVersions";
import {
  createAmendmentAction,
  decideAction,
  startWorkflowAction,
  addObligationAction,
  setObligationStatusAction,
  deleteObligationAction,
  addCommentAction,
  deleteCommentAction,
  deleteContractAction,
  acceptRedlineAction,
  rejectRedlineAction,
  removeSignatureAction,
  reissueSignatureAction,
  uploadAttachmentAction,
  deleteAttachmentAction,
} from "@/app/actions";
import {
  STEP_TYPE_LABELS,
  OBLIGATION_TYPES,
  type StepType,
} from "@/lib/constants";

const VERSION_ORIGIN_LABEL: Record<string, string> = {
  MANUAL: "Manual",
  GENERATED: "Generated",
  REDLINE: "Redline",
};

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [me, users] = await Promise.all([getCurrentUser(), getAllUsers()]);

  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      owner: true,
      createdBy: true,
      template: true,
      counterpartyRef: true,
      currentVersion: true,
      amendsContract: true,
      amendments: { orderBy: { createdAt: "asc" } },
      signatures: { orderBy: { order: "asc" } },
      obligations: { orderBy: { dueDate: "asc" }, include: { owner: true } },
      comments: { orderBy: { createdAt: "asc" }, include: { author: true } },
      attachments: { orderBy: { createdAt: "asc" }, include: { uploadedBy: true } },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: { basedOn: true, createdBy: true },
      },
      workflowInstances: {
        orderBy: { startedAt: "desc" },
        include: {
          template: true,
          steps: {
            orderBy: { order: "asc" },
            include: { actions: { include: { assignee: true } } },
          },
        },
      },
    },
  });
  if (!contract) notFound();

  const audit = await prisma.auditEvent.findMany({
    where: { contractId: id },
    orderBy: { createdAt: "desc" },
  });
  const workflowTemplates = await prisma.workflowTemplate.findMany({
    orderBy: { isDefault: "desc" },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  const contractTemplates = await prisma.contractTemplate.findMany({
    orderBy: { name: "asc" },
  });

  const activeInstance = contract.workflowInstances.find(
    (w) => w.status === "ACTIVE"
  );
  const activeStep = activeInstance?.steps.find((s) => s.status === "ACTIVE");
  const myPendingAction =
    activeStep && activeStep.type !== "SIGNATURE"
      ? activeStep.actions.find(
          (a) => a.assigneeId === me.id && a.decision === "PENDING"
        )
      : undefined;

  // Authorization: combine lifecycle state with the acting user's permissions.
  const meActor = { id: me.id, role: me.role };
  const editableState =
    ["DRAFT", "REJECTED"].includes(contract.status) && !activeInstance;
  const perm = {
    edit: can(meActor, "contract:edit", contract),
    delete:
      ["DRAFT", "REJECTED", "CANCELLED"].includes(contract.status) &&
      can(meActor, "contract:delete", contract),
    generate: editableState && can(meActor, "contract:generate", contract),
    workflow:
      !activeInstance &&
      ["DRAFT", "REJECTED"].includes(contract.status) &&
      can(meActor, "workflow:start", contract),
    signature:
      ["APPROVED", "OUT_FOR_SIGNATURE"].includes(contract.status) &&
      can(meActor, "signature:manage", contract),
    signatureManage: can(meActor, "signature:manage", contract),
    redlinePropose:
      ["DRAFT", "IN_REVIEW", "APPROVED"].includes(contract.status) &&
      can(meActor, "redline:propose", contract),
    redlineResolve: can(meActor, "redline:resolve", contract),
    obligation: can(meActor, "obligation:manage", contract),
    comment: can(meActor, "comment:create"),
    amend: contract.status === "EXECUTED" && can(meActor, "contract:create"),
  };

  const currentBody = contract.currentVersion?.body ?? "";
  const proposedRedlines = contract.versions.filter((v) => v.status === "PROPOSED");

  const baseContext =
    perm.generate && contractTemplates.length > 0
      ? await buildContext(contract.id)
      : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/contracts" className="text-sm text-brand-600 hover:underline">
          ← Contracts
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-gray-400">{contract.reference}</span>
              <StatusBadge status={contract.status} />
              {contract.category && (
                <span className="badge bg-gray-100 text-gray-600">{contract.category}</span>
              )}
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{contract.title}</h1>
            {contract.description && (
              <p className="mt-1 text-sm text-gray-500">{contract.description}</p>
            )}
            {contract.amendsContract && (
              <p className="mt-1 text-sm text-amber-700">
                Amends{" "}
                <Link
                  href={`/contracts/${contract.amendsContract.id}`}
                  className="font-medium underline hover:text-amber-900"
                >
                  {contract.amendsContract.reference} — {contract.amendsContract.title}
                </Link>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {perm.amend && (
              <form action={createAmendmentAction}>
                <input type="hidden" name="contractId" value={contract.id} />
                <ConfirmSubmit
                  message={`Create an amendment to ${contract.reference}? A linked draft seeded from the executed text will open.`}
                  className="btn-secondary"
                >
                  Amend
                </ConfirmSubmit>
              </form>
            )}
            {contract.currentVersion && (
              <a
                href={`/contracts/${contract.id}/pdf`}
                className="btn-secondary"
                // A route handler streams the file; let the browser download it.
                download
              >
                Download PDF
              </a>
            )}
            <a
              href={`/contracts/${contract.id}/export.json`}
              className="btn-secondary"
              title="Full evidence bundle: versions, hashes, signatures, audit trail"
              download
            >
              Export JSON
            </a>
            {perm.edit && (
              <Link href={`/contracts/${contract.id}/edit`} className="btn-secondary">
                Edit
              </Link>
            )}
            {perm.delete && (
              <form action={deleteContractAction}>
                <input type="hidden" name="contractId" value={contract.id} />
                <ConfirmSubmit message={`Permanently delete ${contract.reference}? This cannot be undone.`}>
                  Delete
                </ConfirmSubmit>
              </form>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Generate from template */}
          {perm.generate && contractTemplates.length > 0 && baseContext && (
            <section className="card p-5">
              <h2 className="mb-1 text-lg font-semibold">Generate document</h2>
              <p className="mb-4 text-sm text-gray-500">
                Assemble the contract from a template, binding merge fields to
                this record&apos;s data. Generating replaces the current draft body.
              </p>
              <GenerateDocument
                contractId={contract.id}
                templates={contractTemplates.map((t) => ({
                  id: t.id,
                  name: t.name,
                  category: t.category,
                  body: t.body,
                }))}
                baseContext={baseContext as Record<string, unknown>}
              />
            </section>
          )}

          {/* Review & approval */}
          <section className="card p-5">
            <h2 className="mb-4 text-lg font-semibold">Review &amp; approval</h2>

            {perm.workflow && (
              <form action={startWorkflowAction} className="space-y-3">
                <input type="hidden" name="contractId" value={contract.id} />
                <p className="text-sm text-gray-600">Route this contract through a workflow:</p>
                <div className="space-y-2">
                  {workflowTemplates.map((t, i) => (
                    <label
                      key={t.id}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:border-brand-300 hover:bg-brand-50/40"
                    >
                      <input type="radio" name="templateId" value={t.id} defaultChecked={i === 0} className="mt-1" />
                      <div>
                        <div className="font-medium">
                          {t.name}
                          {t.isDefault && (
                            <span className="ml-2 badge bg-brand-100 text-brand-700">default</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">{t.description}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {t.steps.map((s) => (
                            <span key={s.id} className="badge bg-gray-100 text-gray-600">
                              {s.order}. {s.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
                <button type="submit" className="btn-primary">Start workflow</button>
              </form>
            )}

            {activeInstance && (
              <div className="space-y-4">
                <div className="text-sm text-gray-500">
                  Workflow:{" "}
                  <span className="font-medium text-gray-800">{activeInstance.template.name}</span>
                </div>
                <ol className="space-y-3">
                  {activeInstance.steps.map((s) => (
                    <li
                      key={s.id}
                      className={`rounded-lg border p-3 ${
                        s.status === "ACTIVE" ? "border-amber-300 bg-amber-50/50" : "border-gray-200"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium">
                          {s.order}. {s.name}{" "}
                          <span className="text-xs font-normal text-gray-400">
                            ({STEP_TYPE_LABELS[s.type as StepType]} · {s.completionRule})
                          </span>
                        </div>
                        <Pill value={s.status} />
                      </div>
                      {s.actions.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {s.actions.map((a) => (
                            <li key={a.id} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600">
                                {a.assignee.name}
                                {a.comment && <span className="text-gray-400"> — “{a.comment}”</span>}
                              </span>
                              <Pill value={a.decision} />
                            </li>
                          ))}
                        </ul>
                      )}
                      {s.type === "SIGNATURE" && s.status === "ACTIVE" && (
                        <p className="mt-2 text-sm text-gray-500">
                          Awaiting signatures — see the signature panel below.
                        </p>
                      )}
                    </li>
                  ))}
                </ol>

                {myPendingAction && (
                  <form action={decideAction} className="rounded-lg border border-brand-200 bg-brand-50/50 p-4">
                    <input type="hidden" name="contractId" value={contract.id} />
                    <input type="hidden" name="stepId" value={activeStep!.id} />
                    <div className="mb-2 text-sm font-medium">
                      Your decision on “{activeStep!.name}”
                    </div>
                    <textarea name="comment" rows={2} className="input mb-3" placeholder="Optional comment…" />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        name="decision"
                        value={activeStep!.type === "APPROVAL" ? "APPROVED" : "REVIEWED"}
                        className="btn-success"
                      >
                        {activeStep!.type === "APPROVAL" ? "Approve" : "Mark reviewed"}
                      </button>
                      {activeStep!.allowReject && (
                        <button type="submit" name="decision" value="REJECTED" className="btn-danger">
                          Reject
                        </button>
                      )}
                    </div>
                  </form>
                )}
                {activeStep && activeStep.type !== "SIGNATURE" && !myPendingAction && (
                  <p className="text-sm text-gray-500">
                    Waiting on other assignees for “{activeStep.name}”. Switch users (top-right) to act as an assignee.
                  </p>
                )}
              </div>
            )}

            {!activeInstance && !perm.workflow && (
              <p className="text-sm text-gray-500">
                {contract.status === "EXECUTED"
                  ? "Fully executed — the approval workflow is complete."
                  : "No active workflow."}
              </p>
            )}
          </section>

          {/* Redlines & revisions */}
          {(perm.redlinePropose || proposedRedlines.length > 0) && (
            <section className="card p-5">
              <h2 className="mb-1 text-lg font-semibold">Redlines &amp; revisions</h2>
              <p className="mb-4 text-sm text-gray-500">
                Propose changes to the contract text during review. Proposed
                redlines are shown as tracked changes and can be accepted or rejected.
              </p>

              {proposedRedlines.length > 0 && (
                <div className="mb-4 space-y-4">
                  {proposedRedlines.map((v) => (
                    <div key={v.id} className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-sm">
                          <span className="font-medium">Redline v{v.versionNumber}</span>{" "}
                          <span className="text-gray-500">
                            by {v.createdBy.name} · {formatDateTime(v.createdAt)}
                          </span>
                          {v.note && <div className="text-xs text-gray-500">{v.note}</div>}
                        </div>
                        <Pill value={v.status} />
                      </div>
                      <DiffView oldText={v.basedOn?.body ?? currentBody} newText={v.body} />
                      {perm.redlineResolve ? (
                        <div className="mt-3 flex gap-2">
                          <form action={acceptRedlineAction}>
                            <input type="hidden" name="contractId" value={contract.id} />
                            <input type="hidden" name="versionId" value={v.id} />
                            <button className="btn-success">Accept redline</button>
                          </form>
                          <form action={rejectRedlineAction} className="flex items-center gap-2">
                            <input type="hidden" name="contractId" value={contract.id} />
                            <input type="hidden" name="versionId" value={v.id} />
                            <input name="reason" placeholder="Reason (optional)" className="input max-w-xs" />
                            <button className="btn-danger">Reject</button>
                          </form>
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-gray-400">
                          Only Legal or an admin can accept or reject this redline.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {perm.redlinePropose && (
                <RedlineEditor contractId={contract.id} currentBody={currentBody} />
              )}
            </section>
          )}

          {/* Signatures */}
          {(perm.signature || contract.signatures.length > 0) && (
            <section className="card p-5">
              <h2 className="mb-4 text-lg font-semibold">Signatures</h2>
              {contract.signatures.length > 0 && (
                <ul className="mb-4 divide-y divide-gray-100">
                  {contract.signatures.map((sig) => (
                    <li key={sig.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="font-medium">{sig.signerName}</div>
                        <div className="text-xs text-gray-500">
                          {sig.signerEmail}
                          {sig.signedAt && <> · signed {formatDateTime(sig.signedAt)}</>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {sig.status === "PENDING" && (
                          <>
                            {!isSignatureExpired(sig) && (
                              <>
                                <CopyLink path={`/sign/${sig.token}`} />
                                <Link href={`/sign/${sig.token}`} className="text-xs font-medium text-brand-600 hover:underline">
                                  Open →
                                </Link>
                              </>
                            )}
                            {perm.signatureManage && (
                              <>
                                <form action={reissueSignatureAction}>
                                  <input type="hidden" name="contractId" value={contract.id} />
                                  <input type="hidden" name="signatureId" value={sig.id} />
                                  <button
                                    className="text-xs font-medium text-brand-600 hover:underline"
                                    title="New link + fresh expiry, emailed to the signer. The old link stops working."
                                  >
                                    Re-issue link
                                  </button>
                                </form>
                                <form action={removeSignatureAction}>
                                  <input type="hidden" name="contractId" value={contract.id} />
                                  <input type="hidden" name="signatureId" value={sig.id} />
                                  <ConfirmSubmit message="Remove this pending signer?" className="text-xs font-medium text-red-600 hover:underline">
                                    Remove
                                  </ConfirmSubmit>
                                </form>
                              </>
                            )}
                          </>
                        )}
                        <Pill value={isSignatureExpired(sig) ? "EXPIRED" : sig.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {perm.signature && (
                <div className="rounded-lg border border-gray-200 p-4">
                  <SendForSignature contractId={contract.id} />
                </div>
              )}
            </section>
          )}

          {/* Document + version history */}
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Document</h2>
              {contract.currentVersion && (
                <span className="text-xs text-gray-400">
                  v{contract.currentVersion.versionNumber} ·{" "}
                  {VERSION_ORIGIN_LABEL[contract.currentVersion.origin] ?? contract.currentVersion.origin} · hash{" "}
                  <span className="font-mono">{contract.currentVersion.contentHash.slice(0, 12)}…</span>
                </span>
              )}
            </div>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-xs leading-relaxed text-gray-700">
              {currentBody}
            </pre>

            {contract.versions.length >= 2 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-brand-600">
                  Compare versions
                </summary>
                <div className="mt-3">
                  <CompareVersions
                    versions={contract.versions.map((v) => ({
                      id: v.id,
                      versionNumber: v.versionNumber,
                      body: v.body,
                      status: v.status,
                      origin: v.origin,
                    }))}
                  />
                </div>
              </details>
            )}

            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-brand-600">
                Version history ({contract.versions.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {contract.versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700">
                      v{v.versionNumber} · {VERSION_ORIGIN_LABEL[v.origin] ?? v.origin}
                      {v.note ? ` — ${v.note}` : ""}
                    </span>
                    <span className="flex items-center gap-2 text-gray-400">
                      {formatDate(v.createdAt)}
                      <Pill value={v.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </section>

          {/* Obligations */}
          <section className="card p-5">
            <h2 className="mb-4 text-lg font-semibold">Obligations &amp; enforcement</h2>
            {contract.obligations.length === 0 ? (
              <EmptyState>No obligations tracked yet.</EmptyState>
            ) : (
              <ul className="mb-4 divide-y divide-gray-100">
                {contract.obligations.map((o) => (
                  <li key={o.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{o.title}</div>
                        <div className="text-xs text-gray-500">
                          {o.type} · due {formatDate(o.dueDate)}
                          {o.owner && <> · {o.owner.name}</>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Pill value={effectiveStatus(o)} />
                        {perm.obligation && o.status === "OPEN" && (
                          <form action={setObligationStatusAction}>
                            <input type="hidden" name="contractId" value={contract.id} />
                            <input type="hidden" name="obligationId" value={o.id} />
                            <input type="hidden" name="status" value="DONE" />
                            <button className="text-xs font-medium text-emerald-600 hover:underline">Mark done</button>
                          </form>
                        )}
                        {perm.obligation && (
                          <form action={deleteObligationAction}>
                            <input type="hidden" name="contractId" value={contract.id} />
                            <input type="hidden" name="obligationId" value={o.id} />
                            <ConfirmSubmit message="Delete this obligation?" className="text-xs font-medium text-red-600 hover:underline">
                              Delete
                            </ConfirmSubmit>
                          </form>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {perm.obligation && (
            <details className="rounded-lg border border-gray-200 p-4">
              <summary className="cursor-pointer text-sm font-medium text-brand-600">+ Add obligation</summary>
              <form action={addObligationAction} className="mt-3 space-y-3">
                <input type="hidden" name="contractId" value={contract.id} />
                <div className="grid grid-cols-2 gap-3">
                  <input name="title" required placeholder="Title" className="input" />
                  <select name="type" className="input" defaultValue="OTHER">
                    {OBLIGATION_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <input name="description" placeholder="Description" className="input" />
                <div className="grid grid-cols-2 gap-3">
                  <input name="dueDate" type="date" className="input" />
                  <select name="ownerId" className="input" defaultValue="">
                    <option value="">Owner…</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn-primary">Add obligation</button>
              </form>
            </details>
            )}
          </section>

          {/* Attachments */}
          {(perm.comment || contract.attachments.length > 0) && (
            <section className="card p-5">
              <h2 className="mb-4 text-lg font-semibold">Attachments</h2>
              {contract.attachments.length === 0 ? (
                <p className="mb-4 text-sm text-gray-400">
                  No files attached — exhibits, correspondence, and scans live here.
                </p>
              ) : (
                <ul className="mb-4 divide-y divide-gray-100">
                  {contract.attachments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <a
                          href={`/contracts/${contract.id}/attachments/${a.id}`}
                          className="truncate text-sm font-medium text-brand-600 hover:underline"
                          download
                        >
                          {a.fileName}
                        </a>
                        <div className="text-xs text-gray-400">
                          {Math.ceil(a.size / 1024)} KB · {a.uploadedBy.name} ·{" "}
                          {formatDateTime(a.createdAt)}
                        </div>
                      </div>
                      {(a.uploadedById === me.id || perm.edit) && (
                        <form action={deleteAttachmentAction}>
                          <input type="hidden" name="contractId" value={contract.id} />
                          <input type="hidden" name="attachmentId" value={a.id} />
                          <ConfirmSubmit
                            message={`Delete "${a.fileName}"?`}
                            className="text-xs font-medium text-red-600 hover:underline"
                          >
                            Delete
                          </ConfirmSubmit>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {perm.comment && (
                <form action={uploadAttachmentAction} className="flex flex-wrap items-center gap-3">
                  <input type="hidden" name="contractId" value={contract.id} />
                  <input type="file" name="file" required className="text-sm" />
                  <button type="submit" className="btn-secondary">
                    Upload
                  </button>
                  <span className="text-xs text-gray-400">
                    Max 10 MB. Documents, spreadsheets, and images.
                  </span>
                </form>
              )}
            </section>
          )}

          {/* Comments */}
          <section className="card p-5">
            <h2 className="mb-4 text-lg font-semibold">Discussion</h2>
            <ul className="mb-4 space-y-3">
              {contract.comments.length === 0 && (
                <li className="text-sm text-gray-400">No comments yet.</li>
              )}
              {contract.comments.map((c) => (
                <li key={c.id} className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.author.name}</span>
                    <span className="text-xs text-gray-400">{formatDateTime(c.createdAt)}</span>
                    {c.authorId === me.id && (
                      <form action={deleteCommentAction}>
                        <input type="hidden" name="contractId" value={contract.id} />
                        <input type="hidden" name="commentId" value={c.id} />
                        <button className="text-xs text-gray-400 hover:text-red-600">delete</button>
                      </form>
                    )}
                  </div>
                  <p className="text-gray-700">{c.body}</p>
                </li>
              ))}
            </ul>
            {perm.comment && (
              <form action={addCommentAction} className="flex gap-2">
                <input type="hidden" name="contractId" value={contract.id} />
                <input name="body" placeholder="Add a comment…" className="input" required />
                <button type="submit" className="btn-secondary">Post</button>
              </form>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Details</h2>
            <dl className="space-y-2 text-sm">
              <Detail
                label="Counterparty"
                value={contract.counterpartyRef?.name ?? contract.counterparty ?? "—"}
              />
              <Detail label="Value" value={formatMoney(contract.value, contract.currency ?? "USD")} />
              <Detail label="Owner" value={contract.owner?.name ?? "—"} />
              <Detail label="Created by" value={contract.createdBy.name} />
              <Detail label="Effective" value={formatDate(contract.effectiveDate)} />
              <Detail label="Expires" value={formatDate(contract.expirationDate)} />
              <Detail label="Executed" value={formatDate(contract.executedAt)} />
              {contract.template && <Detail label="Template" value={contract.template.name} />}
            </dl>
          </section>

          {contract.amendments.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Amendments
              </h2>
              <ul className="space-y-2">
                {contract.amendments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link
                      href={`/contracts/${a.id}`}
                      className="text-brand-600 hover:underline"
                    >
                      {a.reference} — {a.title}
                    </Link>
                    <StatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Audit trail</h2>
            <ol className="space-y-3">
              {audit.map((e) => (
                <li key={e.id} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                    <span className="font-medium text-gray-700">{e.action}</span>
                  </div>
                  <div className="ml-3.5 text-gray-500">{e.summary}</div>
                  <div className="ml-3.5 text-gray-400">
                    {e.actorLabel ?? "System"} · {formatDateTime(e.createdAt)}
                  </div>
                </li>
              ))}
            </ol>
            <Link href="/audit" className="mt-3 inline-block text-xs font-medium text-brand-600 hover:underline">
              View full audit log & integrity check →
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-800">{value}</dd>
    </div>
  );
}
