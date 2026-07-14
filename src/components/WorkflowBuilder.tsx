"use client";

import { useState } from "react";
import { saveWorkflowAction } from "@/app/actions";
import {
  ROLES,
  ROLE_LABELS,
  STEP_TYPES,
  STEP_TYPE_LABELS,
  COMPLETION_RULES,
  type Role,
  type StepType,
} from "@/lib/constants";

interface UserLite {
  id: string;
  name: string;
  role: string;
}

interface StepState {
  name: string;
  type: StepType;
  assigneeMode: "role" | "user";
  assigneeRole: string;
  assigneeUserId: string;
  completionRule: string;
  allowReject: boolean;
}

export interface WorkflowInit {
  id?: string;
  name: string;
  description: string;
  isDefault: boolean;
  steps: StepState[];
}

function blankStep(): StepState {
  return {
    name: "",
    type: "APPROVAL",
    assigneeMode: "role",
    assigneeRole: "LEGAL",
    assigneeUserId: "",
    completionRule: "ALL",
    allowReject: true,
  };
}

/**
 * Visual workflow builder: name the workflow and compose an ordered list of
 * steps, each with a type, an assignee (a whole role or one person), and a
 * completion rule. Serializes steps to JSON for the save action.
 */
export function WorkflowBuilder({
  users,
  init,
}: {
  users: UserLite[];
  init?: WorkflowInit;
}) {
  const [name, setName] = useState(init?.name ?? "");
  const [description, setDescription] = useState(init?.description ?? "");
  const [isDefault, setIsDefault] = useState(init?.isDefault ?? false);
  const [steps, setSteps] = useState<StepState[]>(
    init?.steps?.length ? init.steps : [blankStep()]
  );

  const update = (i: number, patch: Partial<StepState>) =>
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)));
  const move = (i: number, dir: -1 | 1) =>
    setSteps((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const copy = [...s];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  const remove = (i: number) =>
    setSteps((s) => (s.length > 1 ? s.filter((_, idx) => idx !== i) : s));

  // Serialize to the shape saveWorkflowAction expects.
  const serialized = JSON.stringify(
    steps.map((s) => ({
      name: s.name,
      type: s.type,
      assigneeRole:
        s.type === "SIGNATURE" || s.assigneeMode !== "role" ? null : s.assigneeRole,
      assigneeUserId:
        s.type === "SIGNATURE" || s.assigneeMode !== "user" ? null : s.assigneeUserId,
      completionRule: s.completionRule,
      allowReject: s.allowReject,
    }))
  );

  return (
    <form action={saveWorkflowAction} className="space-y-5">
      {init?.id && <input type="hidden" name="id" value={init.id} />}
      <input type="hidden" name="steps" value={serialized} />
      {isDefault && <input type="hidden" name="isDefault" value="true" />}

      <div className="card space-y-4 p-5">
        <div>
          <label className="label">Workflow name *</label>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="input"
            placeholder="Standard Review & Sign"
          />
        </div>
        <div>
          <label className="label">Description</label>
          <input
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input"
            placeholder="When should this workflow be used?"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          Make this the default workflow
        </label>
      </div>

      <div className="space-y-3">
        {steps.map((s, i) => (
          <div key={i} className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-500">Step {i + 1}</span>
              <div className="flex items-center gap-1 text-gray-400">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="px-1 disabled:opacity-30" aria-label="Move up">↑</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1} className="px-1 disabled:opacity-30" aria-label="Move down">↓</button>
                <button type="button" onClick={() => remove(i)} disabled={steps.length === 1} className="px-1 text-red-500 disabled:opacity-30" aria-label="Remove">✕</button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="label">Step name</label>
                <input
                  value={s.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  className="input"
                  placeholder="Legal Review"
                />
              </div>
              <div>
                <label className="label">Type</label>
                <select
                  value={s.type}
                  onChange={(e) => update(i, { type: e.target.value as StepType })}
                  className="input"
                >
                  {STEP_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {STEP_TYPE_LABELS[t as StepType]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {s.type !== "SIGNATURE" && (
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div>
                  <label className="label">Assign to</label>
                  <select
                    value={s.assigneeMode}
                    onChange={(e) => update(i, { assigneeMode: e.target.value as "role" | "user" })}
                    className="input"
                  >
                    <option value="role">A role</option>
                    <option value="user">A specific person</option>
                  </select>
                </div>
                <div>
                  <label className="label">{s.assigneeMode === "role" ? "Role" : "Person"}</label>
                  {s.assigneeMode === "role" ? (
                    <select
                      value={s.assigneeRole}
                      onChange={(e) => update(i, { assigneeRole: e.target.value })}
                      className="input"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r as Role]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={s.assigneeUserId}
                      onChange={(e) => update(i, { assigneeUserId: e.target.value })}
                      className="input"
                    >
                      <option value="">Select…</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="label">Completion</label>
                  <select
                    value={s.completionRule}
                    onChange={(e) => update(i, { completionRule: e.target.value })}
                    className="input"
                  >
                    {COMPLETION_RULES.map((r) => (
                      <option key={r} value={r}>
                        {r === "ALL" ? "ALL must act" : "ANY one acts"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {s.type !== "SIGNATURE" && (
              <label className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={s.allowReject}
                  onChange={(e) => update(i, { allowReject: e.target.checked })}
                />
                Allow rejection at this step
              </label>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setSteps((s) => [...s, blankStep()])}
        className="text-sm font-medium text-brand-600 hover:underline"
      >
        + Add step
      </button>

      <div className="flex justify-end">
        <button type="submit" className="btn-primary">
          Save workflow
        </button>
      </div>
    </form>
  );
}
