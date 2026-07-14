# Contractable

A contract lifecycle management (CLM) platform: draft contracts, route them
through **configurable review & approval workflows**, collect **built-in
e-signatures**, store the executed agreements, and **enforce obligations**
(payments, renewals, expirations) — all backed by a **tamper-evident,
hash-chained audit log**.

Built with Next.js (App Router) + TypeScript + Prisma. Runs locally with zero
infrastructure (SQLite); Postgres-ready for production.

---

## Quick start

```bash
npm install
npm run setup      # create the database + load seed data
npm run dev        # start the app at http://localhost:3000
```

Then open **http://localhost:3000**. Use the **“Acting as”** switcher in the
top-right to change identity — auth is intentionally stubbed for the MVP so a
single person can walk a contract through every role.

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Run the workflow-engine unit tests (Vitest) |
| `npm run db:seed` | Reload seed data |
| `npm run db:reset` | Wipe and reseed the database |
| `npm run build` | Production build (also type-checks every route) |

---

## Try the full lifecycle in ~2 minutes

The seed ships five contracts spanning every state. To drive one end-to-end:

1. **Create** — Dashboard → **+ New Contract** (or open the seeded
   `CTR-0002`, an MSA already *In Review*).
2. **Review** — switch to **Larry Legal**; the dashboard shows a pending
   action. Open it and **Mark reviewed**. The Legal Review step (rule: *ANY*)
   completes and advances to Manager Approval.
3. **Approve** — switch to **Mona Manager** then **Marcus Manager** and
   **Approve** (rule: *ALL* — both must approve).
4. **Sign** — the contract moves to *Out for Signature*. Add signers and
   **Send for signature**, then open each signing link and **Adopt & sign**
   (type or draw). When the last signer signs, the contract is **Executed**.
5. **Enforce** — add obligations (payments, renewals, expirations) on the
   contract; track them on the **Obligations** page, which flags overdue items.
6. **Audit** — the **Audit** page shows the full hash-chained log with a live
   integrity check.

Seeded users: `Alice Admin`, `Larry Legal` & `Nina Counsel` (Legal),
`Mona Manager` & `Marcus Manager` (Managers), `Sam Signer`, `Vic Viewer`.

---

## Architecture

```
src/
  lib/
    constants.ts   Enum-like unions (roles, statuses, step types) — single source of truth
    db.ts          Prisma client singleton
    audit.ts       Tamper-evident, hash-chained audit log + chain verifier
    workflow.ts    The workflow engine (pure decision logic + DB orchestration)
    signing.ts     Built-in e-signature: tokenized links, ordered signing, hashing
    contracts.ts   Contract + version creation (content-hashed)
    obligations.ts Enforcement: obligations, derived OVERDUE status, upcoming query
    session.ts     Current-user resolution (cookie-based; swap for real auth)
    workflow.test.ts  Unit tests for the engine's decision logic
  app/
    page.tsx           Dashboard (KPIs, my approvals, obligations, activity)
    contracts/         List, new, and detail pages
    sign/[token]/      Public tokenized signing page
    workflows/         Workflow template viewer
    obligations/       Global enforcement view
    audit/             Audit log + integrity check
    actions.ts         Server actions (the write surface)
  components/          UI + client components (signature pad, signer list, …)
prisma/
  schema.prisma        Data model
  seed.ts              Seeds via the real engine, so states are internally consistent
```

### The workflow engine

A **workflow template** is an ordered list of steps; each step has a **type**
(`REVIEW` / `APPROVAL` / `SIGNATURE`), an **assignment** (a specific user or a
role), and a **completion rule** (`ALL` or `ANY` of the assignees). Three
templates ship seeded — *Standard Review & Sign*, *Fast-Track NDA*, and
*High-Value Multi-Approval* — demonstrating the multiple-workflow requirement.

Starting a workflow **snapshots** the template into a running instance (so
later template edits don't mutate in-flight contracts), resolves assignees into
action rows, and activates the first step. As assignees act, the engine
re-evaluates the step:

- a rejection short-circuits the step (when the step allows it) → contract
  *Rejected*;
- `ALL` completes when every assignee has acted positively; `ANY` completes on
  the first positive action;
- completing the last step *Approves* the contract, or — if it ended in a
  signature step — *Executes* it once all signatures are collected.

The decision logic is a **pure function** (`evaluateStepOutcome`) with no
database dependency, unit-tested in `workflow.test.ts`. The DB orchestration
wraps every transition in a Prisma transaction alongside its audit entry.

### Built-in e-signature

Each signer gets a unique tokenized link (`/sign/<token>`). The signing page
renders the exact document version, captures a **typed or drawn** signature,
and records a tamper-evident receipt: the **document content hash** at signing
time, the signer, timestamp, and IP. Signing is **ordered** — a signer is
blocked until everyone ahead of them has signed. The final signature completes
the workflow's signature step and executes the contract.

### Tamper-evident audit

Every state change appends to an **append-only, hash-chained** log: each
event's hash covers the previous event's hash, so any retroactive edit breaks
the chain from that point forward. The Audit page runs `verifyAuditChain` live.

---

## Moving to production

- **Database** — change the `datasource` provider in `prisma/schema.prisma`
  from `sqlite` to `postgresql` and point `DATABASE_URL` at your Postgres
  instance; the schema is otherwise portable. (SQLite is used here only to keep
  local setup zero-infrastructure.)
- **Auth** — replace `src/lib/session.ts` (and the identity switcher) with real
  authentication/SSO and enforce role-based authorization in the server
  actions.
- **E-signature** — the built-in signer is self-contained. To use a third-party
  provider (e.g. DocuSign), implement an alternative behind the signing module.
- **Notifications** — email signing links and approval requests (currently
  surfaced in-app).

---

## What's built vs. next

**Built:** configurable multi-step workflows (review/approval/signature),
role- and user-based assignment with ALL/ANY rules, rejection handling,
built-in ordered e-signature with hashing, contract versioning, obligation
tracking with overdue detection, hash-chained audit with verification, and a
full UI across dashboard, contracts, workflows, obligations, and audit.

**Natural next steps:** a visual workflow *builder* (the data model already
supports arbitrary step sequences), email notifications, PDF generation of
executed contracts, full-text search, and real auth/RBAC.
