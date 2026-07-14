// Central definitions for the "enum-like" string fields used across the schema.
// SQLite has no native enums, so these TypeScript unions + constant arrays are
// the single source of truth, validated in the application layer.

export const ROLES = ["ADMIN", "LEGAL", "MANAGER", "SIGNER", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  LEGAL: "Legal",
  MANAGER: "Business Manager",
  SIGNER: "Authorized Signer",
  VIEWER: "Viewer",
};

// Contract lifecycle states.
export const CONTRACT_STATUS = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "OUT_FOR_SIGNATURE",
  "EXECUTED",
  "ACTIVE",
  "EXPIRED",
  "TERMINATED",
  "CANCELLED",
] as const;
export type ContractStatus = (typeof CONTRACT_STATUS)[number];

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  OUT_FOR_SIGNATURE: "Out for Signature",
  EXECUTED: "Executed",
  ACTIVE: "Active",
  EXPIRED: "Expired",
  TERMINATED: "Terminated",
  CANCELLED: "Cancelled",
};

// Tailwind class hints per status for badges.
export const CONTRACT_STATUS_COLORS: Record<ContractStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  IN_REVIEW: "bg-amber-100 text-amber-800",
  APPROVED: "bg-blue-100 text-blue-800",
  REJECTED: "bg-red-100 text-red-800",
  OUT_FOR_SIGNATURE: "bg-purple-100 text-purple-800",
  EXECUTED: "bg-green-100 text-green-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  EXPIRED: "bg-orange-100 text-orange-800",
  TERMINATED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-200 text-gray-600",
};

export const CONTRACT_CATEGORIES = [
  "NDA",
  "MSA",
  "SOW",
  "EMPLOYMENT",
  "VENDOR",
  "OTHER",
] as const;
export type ContractCategory = (typeof CONTRACT_CATEGORIES)[number];

// Workflow step types.
export const STEP_TYPES = ["REVIEW", "APPROVAL", "SIGNATURE"] as const;
export type StepType = (typeof STEP_TYPES)[number];

export const STEP_TYPE_LABELS: Record<StepType, string> = {
  REVIEW: "Review",
  APPROVAL: "Approval",
  SIGNATURE: "Signature",
};

export const COMPLETION_RULES = ["ALL", "ANY"] as const;
export type CompletionRule = (typeof COMPLETION_RULES)[number];

// Step instance status.
export const STEP_STATUS = [
  "PENDING",
  "ACTIVE",
  "COMPLETED",
  "REJECTED",
  "SKIPPED",
] as const;
export type StepStatus = (typeof STEP_STATUS)[number];

// Per-assignee decision on a step.
export const DECISIONS = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "REVIEWED",
  "SIGNED",
] as const;
export type Decision = (typeof DECISIONS)[number];

export const WORKFLOW_STATUS = [
  "ACTIVE",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUS)[number];

export const SIGNATURE_STATUS = ["PENDING", "SIGNED", "DECLINED"] as const;
export type SignatureStatus = (typeof SIGNATURE_STATUS)[number];

export const OBLIGATION_TYPES = [
  "PAYMENT",
  "RENEWAL",
  "DELIVERABLE",
  "COMPLIANCE",
  "EXPIRATION",
  "OTHER",
] as const;
export type ObligationType = (typeof OBLIGATION_TYPES)[number];

export const OBLIGATION_STATUS = ["OPEN", "DONE", "WAIVED"] as const;
export type ObligationStatus = (typeof OBLIGATION_STATUS)[number];

export function isRole(v: string): v is Role {
  return (ROLES as readonly string[]).includes(v);
}
