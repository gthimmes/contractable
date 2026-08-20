import type { HelpContent } from "help-navigator";

// The in-app help corpus: categories + markdown articles, rendered by the
// help-navigator widget mounted in the (app) layout.
export const helpContent: HelpContent = {
  categories: [
    {
      id: "getting-started",
      title: "Getting started",
      icon: "🚀",
      description: "The contract lifecycle, your dashboard, and how roles work.",
    },
    {
      id: "contracts",
      title: "Contracts & redlining",
      icon: "📄",
      description: "Creating contracts, versions, redlines, and attachments.",
    },
    {
      id: "templates",
      title: "Templates & clauses",
      icon: "🧩",
      description: "Reusable templates with data binding, and the clause library.",
    },
    {
      id: "workflows",
      title: "Review & approval",
      icon: "✅",
      description: "Configurable workflows, ANY/ALL rules, and pending actions.",
    },
    {
      id: "signing",
      title: "E-signature",
      icon: "✍️",
      description: "Sending for signature, signing links, reminders, and execution.",
    },
    {
      id: "obligations",
      title: "Obligations",
      icon: "⏰",
      description: "Payments, renewals, and expirations — tracked and enforced.",
    },
    {
      id: "admin",
      title: "Audit & administration",
      icon: "🛡️",
      description: "The audit log, counterparties, insights, email, and settings.",
    },
  ],
  articles: [
    // ---------- Getting started ----------
    {
      id: "lifecycle-tour",
      title: "The contract lifecycle in two minutes",
      category: "getting-started",
      featured: true,
      tags: ["overview", "tour", "basics", "lifecycle"],
      body: `Contractable moves every agreement through one visible lifecycle:

1. **Create** — draft from a template (with your data bound in) or start blank
2. **Review** — reviewers redline and mark the contract reviewed
3. **Approve** — approvers sign off per the workflow's rules
4. **Sign** — signers execute via built-in e-signature links
5. **Enforce** — obligations (payments, renewals, expirations) are tracked to done
6. **Audit** — every step lands in a tamper-evident, hash-chained log

## Where to look first

Your **dashboard** shows the contracts that need *you* — pending reviews, approvals, and signatures — plus recent activity. When in doubt, start there: it's the queue of your next actions.

> Press **F1** anytime to open this help panel.`,
      related: ["dashboard-actions", "roles-permissions", "workflow-basics"],
    },
    {
      id: "dashboard-actions",
      title: "Your dashboard and pending actions",
      category: "getting-started",
      tags: ["dashboard", "pending", "queue"],
      body: `The dashboard is your work queue:

- **Pending actions** — reviews, approvals, and signatures waiting on you specifically
- **Recent contracts** — what's moving, and what state it's in
- The **notification bell** mirrors the same events, and the **Outbox** shows the emails the system sent

An item leaves your queue the moment you act on it — or when a workflow rule no longer needs you (an *ANY* step completes when the first reviewer acts).`,
      related: ["lifecycle-tour", "workflow-acting", "outbox-email"],
    },
    {
      id: "roles-permissions",
      title: "Roles, permissions, and “View as”",
      category: "getting-started",
      featured: true,
      tags: ["roles", "rbac", "admin", "impersonation"],
      body: `Access is role-based:

- **Admin** — everything, including Settings and user management
- **Legal** — reviews, redlines, full contract visibility, insights
- **Manager** — approvals and the contracts they're involved with, insights
- **Signer** — the contracts they're asked to sign
- **Viewer** — read-only

## View as (impersonation)

Admins get a **View as** switcher in the top-right user menu — walk a contract through every role yourself without logging in and out. An amber banner shows while you're impersonating; pick your admin account again to return. Impersonated actions are attributed honestly in the audit log.`,
      related: ["lifecycle-tour", "audit-log"],
    },
    {
      id: "search-notifications",
      title: "Search and notifications",
      category: "getting-started",
      tags: ["search", "notifications", "bell"],
      body: `**Search** (top-right box) finds contracts, counterparties, templates, and clauses in one query — matched on titles, numbers, and content.

**Notifications** arrive two ways:

- The **bell** in the header — in-app, with unread count
- **Email** — sent for the events that need action (you're asked to review, approve, or sign; a signature completes; an obligation comes due)

The **Outbox** page shows every email the system generated, so there's never a mystery about what was sent to whom.`,
      related: ["dashboard-actions", "outbox-email"],
    },

    // ---------- Contracts & redlining ----------
    {
      id: "creating-contracts",
      title: "Creating a contract",
      category: "contracts",
      featured: true,
      tags: ["create", "new", "draft", "counterparty"],
      body: `**Contracts → + New Contract** starts a draft. You choose:

- **A template** — the body is generated with your data bound in (counterparty name, dates, amounts), or
- **Blank** — paste or write the body directly

Every contract gets a number (like \`CTR-0007\`), a counterparty, and a workflow. From the draft you can edit the body, attach files, and submit it into review when it's ready.

## Counterparties

The other side of the deal comes from the **Counterparties** page. Add them once; every contract, obligation, and search references the same record.`,
      related: ["templates-binding", "redlining", "workflow-basics"],
    },
    {
      id: "redlining",
      title: "Redlining and version compare",
      category: "contracts",
      featured: true,
      tags: ["redline", "versions", "diff", "compare", "edits"],
      body: `During review, reviewers don't just approve or reject — they **redline**.

## How redlines work

Open a contract in review and edit the body: the editor tracks your changes as a new **version**. Nothing is overwritten — every version is kept.

## Compare

**Compare versions** shows any two versions side by side with insertions and deletions highlighted, so "what changed since legal saw it?" has a precise answer.

The version history — who changed what, when — also lands in the audit log automatically.`,
      related: ["workflow-acting", "audit-log", "creating-contracts"],
    },
    {
      id: "attachments",
      title: "Attachments",
      category: "contracts",
      tags: ["attachments", "files", "exhibits"],
      body: `Contracts carry **attachments** — exhibits, statements of work, insurance certificates, anything the agreement references.

Upload them from the contract page; they stay with the contract through its whole lifecycle and are available alongside the executed document afterward.

Attachments are files *about* the contract; the contract body itself lives in versions (see redlining). Keep signable terms in the body so they're covered by review, approval, and signature.`,
      related: ["redlining", "executed-store"],
    },
    {
      id: "executed-store",
      title: "Executed contracts and PDFs",
      category: "contracts",
      tags: ["executed", "pdf", "store", "download"],
      body: `When the last signer signs, the contract becomes **Executed** — the terminal, locked state.

## What you get

- The final body, frozen — no further edits or versions
- A generated **PDF** of the executed agreement with its signatures for download and distribution
- The full trail: versions, approvals, signature events, all in the audit log

The contracts list filters by state, so **the executed store is just your contracts list filtered to Executed** — one place where every finished agreement lives.`,
      related: ["signing-flow", "obligations-basics", "audit-log"],
    },

    // ---------- Templates & clauses ----------
    {
      id: "templates-binding",
      title: "Templates and data binding",
      category: "templates",
      featured: true,
      tags: ["templates", "generation", "placeholders", "binding"],
      body: `Templates turn your standard agreements into a generator: write the body once with **placeholders**, and each new contract fills them from real data — the counterparty, dates, amounts, and custom fields you supply at creation.

## Authoring

**Templates → New** opens the body editor. Insert placeholders where the deal-specific values go; the template preview shows exactly what a generated contract will look like.

## Why templates beat copy-paste

- The starting text is always the approved language
- Bound values can't drift out of sync between clauses
- Legal reviews the *template* once instead of every contract from scratch

Pair templates with the **clause library** for the reusable building blocks inside them.`,
      related: ["clause-library", "creating-contracts"],
    },
    {
      id: "clause-library",
      title: "The clause library",
      category: "templates",
      tags: ["clauses", "library", "reuse", "language"],
      body: `**Clauses** is your library of approved language — indemnification, limitation of liability, confidentiality, governing law — maintained once, reused everywhere.

Each clause has a title and body, with full CRUD for keeping the language current. Build templates out of clauses so a wording update in the library is a one-place change.

A good clause library is the quiet backbone of fast review: reviewers recognize approved language instantly and spend their attention on what's actually unusual in the deal.`,
      related: ["templates-binding", "redlining"],
    },

    // ---------- Review & approval ----------
    {
      id: "workflow-basics",
      title: "How review & approval workflows work",
      category: "workflows",
      featured: true,
      tags: ["workflow", "steps", "any", "all", "rules"],
      body: `Every contract follows a **workflow** — an ordered list of steps, each with assignees and a completion rule:

- **ANY** — the step completes when *one* assignee acts (typical for legal review pools)
- **ALL** — *every* assignee must act (typical for multi-manager approval)

## An example

The seeded *Standard MSA* flow: **Legal Review** (Larry or Nina, rule ANY) → **Manager Approval** (Mona *and* Marcus, rule ALL) → **Signature**.

When a step completes, the next one activates and its assignees are notified. When the last approval lands, the contract moves to *Out for Signature*.

Workflows are fully configurable — see the workflow builder.`,
      related: ["workflow-builder", "workflow-acting", "signing-flow"],
    },
    {
      id: "workflow-acting",
      title: "Acting on a review or approval",
      category: "workflows",
      tags: ["review", "approve", "reject", "pending"],
      body: `When a workflow step needs you, it appears in your **dashboard pending actions** (and your notifications).

## Reviewing

Open the contract, read the current version — redline it if the language needs work — then **Mark reviewed**.

## Approving

Approvers see **Approve** and **Reject** on the contract. Rejection sends the contract back with your comment rather than silently killing it; the team fixes and resubmits.

Your action is recorded with your name and timestamp in the audit log — an *ANY* step shows exactly which of the pool acted.`,
      related: ["workflow-basics", "redlining", "dashboard-actions"],
    },
    {
      id: "workflow-builder",
      title: "Building and editing workflows",
      category: "workflows",
      tags: ["builder", "configure", "assignees"],
      body: `**Workflows** (under More) is where admins shape the pipeline. For each workflow you define the steps in order, and per step:

- **Who** — the assigned users
- **The rule** — ANY or ALL

New contracts pick a workflow at creation. Editing a workflow shapes contracts that use it going forward — in-flight contracts keep the steps they started with, so a mid-review rule change never yanks a contract sideways.

Keep workflows few and boring: one standard flow per contract type beats a bespoke flow per deal.`,
      related: ["workflow-basics", "creating-contracts"],
    },

    // ---------- E-signature ----------
    {
      id: "signing-flow",
      title: "Sending a contract for signature",
      category: "signing",
      featured: true,
      tags: ["signature", "send", "signers", "esign"],
      body: `Once approvals complete, the contract is *Out for Signature*.

## Sending

On the contract page, add the **signers** (yours and the counterparty's), then **Send for signature**. Each signer gets a personal **signing link** by email — counterparty signers don't need an account.

## Tracking

The contract page shows who has signed and who hasn't. **Reminders** nudge signers who haven't acted, and signing links **expire** after a validity window for safety — expired links can be re-sent.

When the last signer signs, the contract flips to **Executed** automatically.`,
      related: ["signing-experience", "executed-store", "workflow-basics"],
    },
    {
      id: "signing-experience",
      title: "What signers see: adopt & sign",
      category: "signing",
      tags: ["adopt", "sign", "signature", "draw", "type"],
      body: `A signing link opens a focused page with the full contract text — no account required.

## Adopt & sign

The signer reviews the document, then adopts a signature by **typing** their name (rendered as a signature) or **drawing** one, and confirms. The signature, the signer's identity, and the exact document version are bound together and recorded.

## Integrity

The signed content is hashed into the audit chain, so any later question of *"is this what was signed?"* has a verifiable answer.`,
      related: ["signing-flow", "audit-log"],
    },

    // ---------- Obligations ----------
    {
      id: "obligations-basics",
      title: "Obligations: payments, renewals, expirations",
      category: "obligations",
      featured: true,
      tags: ["obligations", "payments", "renewals", "expirations", "overdue"],
      body: `Execution isn't the end — it's when the promises start. **Obligations** track them:

- **Payments** — invoices and milestones with due dates
- **Renewals** — decision dates *before* auto-renewal locks you in for another term
- **Expirations** — when agreements actually end

## Working the board

Add obligations on the executed contract, each with a due date and owner. The **Obligations** page shows everything across all contracts and **flags overdue items** — mark them complete as they're satisfied.

The renewal date is the one companies miss most. Set it when you file the executed contract, while the terms are fresh.`,
      related: ["executed-store", "outbox-email"],
    },

    // ---------- Audit & administration ----------
    {
      id: "audit-log",
      title: "The tamper-evident audit log",
      category: "admin",
      featured: true,
      tags: ["audit", "hash", "integrity", "compliance"],
      body: `Every meaningful action — creation, edits, reviews, approvals, signatures, state changes — is appended to the **audit log**.

## Hash-chained

Each entry carries a hash of the previous entry, forming a chain: silently altering or deleting history breaks every hash after it. The **Audit** page runs a **live integrity check** and shows the result.

## Why it matters

Disputes about a contract are usually disputes about *process* — who approved, what changed, what was signed. The audit page answers those with evidence rather than memory.`,
      related: ["signing-experience", "redlining", "roles-permissions"],
    },
    {
      id: "counterparties-help",
      title: "Managing counterparties",
      category: "admin",
      tags: ["counterparties", "companies", "contacts"],
      body: `**Counterparties** (under More) is the directory of the organizations you contract with — name, contact details, and every contract you have with them.

Add a counterparty before (or while) creating its first contract; reuse it thereafter. One record per organization keeps search, insights, and obligation tracking coherent — three spellings of the same vendor is how renewals get missed.`,
      related: ["creating-contracts", "insights-help"],
    },
    {
      id: "insights-help",
      title: "Insights and reporting",
      category: "admin",
      tags: ["insights", "reports", "metrics", "cycle-time"],
      body: `**Insights** (Admin, Legal, and Manager roles) turns the contract base into answers:

- Volume and value by state, type, and counterparty
- **Cycle times** — how long contracts sit in review, approval, and signature
- Obligation health — what's due, what's overdue

Use it to find the bottleneck (it's usually an *ALL* approval step) and to see renewal exposure before the quarter it lands in.`,
      related: ["obligations-basics", "workflow-basics"],
    },
    {
      id: "outbox-email",
      title: "Email, the outbox, and notifications",
      category: "admin",
      tags: ["email", "outbox", "smtp", "notifications"],
      body: `Contractable emails people when they're needed: review/approval requests, signing links, reminders, and obligation alerts.

## The outbox

**Outbox** (under More) lists every email the system generated with its recipient, subject, and status — the first place to look when someone says *"I never got the link."*

## Delivery

Without SMTP configured, emails are captured to the outbox only — perfect for trying the product. Configure SMTP in **Settings** to turn on real delivery; nothing else changes.`,
      related: ["signing-flow", "settings-admin"],
    },
    {
      id: "settings-admin",
      title: "Settings: users, API keys, webhooks",
      category: "admin",
      tags: ["settings", "users", "api-keys", "webhooks", "smtp"],
      body: `**Settings** (Admin only) is the control room:

- **Users** — create accounts and assign roles
- **SMTP** — turn on real email delivery
- **API keys** — token access for integrations that read or write contract data
- **Webhooks** — push contract events (state changes, signatures, obligations) to other systems as they happen

Create a **separate API key per integration** so one leak never means rotating everything, and point webhooks at a request bin first to see payload shapes.`,
      related: ["outbox-email", "roles-permissions"],
    },
  ],
};
