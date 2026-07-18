# Contractable

A contract lifecycle management (CLM) platform: **generate contracts from
templates** bound to your data, **redline** them during review, route them
through **configurable review & approval workflows**, collect **built-in
e-signatures**, store the executed agreements, and **enforce obligations**
(payments, renewals, expirations) — all backed by a **tamper-evident,
hash-chained audit log**, **role-based access control**, and **email
notifications**. Everything is full-CRUD: contracts, templates, workflows,
counterparties, and users.

Built with Next.js (App Router) + TypeScript + Prisma. Runs locally with zero
infrastructure (SQLite); Postgres-ready for production.

---

## Quick start

```bash
npm install
npm run setup      # create the database + load seed data
npm run dev        # start the app at http://localhost:3000
```

Then open **http://localhost:3000** and **sign in**. Every seeded user has the
password **`password`**:

| Email | Role |
| --- | --- |
| `alice@acme.example` | Admin |
| `larry@acme.example` / `nina@acme.example` | Legal |
| `mona@acme.example` / `marcus@acme.example` | Manager |
| `sam@acme.example` | Signer |
| `vic@acme.example` | Viewer |

Sign in as **Alice** (admin) to see everything. Admins get a **“View as”**
impersonation switcher in the top-right, so one person can still walk a contract
through every role — a banner shows when you're impersonating, and selecting
your admin account returns you.

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

Two more headline flows to try:

- **Generate a document** — open the seeded draft `CTR-0001`, pick a template
  in the *Generate document* panel, watch the live preview bind organization +
  counterparty data (and fill any custom `{{fields}}`), then **Generate** to
  write it as a version. Manage templates under **Templates**.
- **Redline** — open the in-review `CTR-0002`; it ships with a proposed redline
  shown as **tracked changes** (a word-level diff). **Accept** it to make it the
  current text or **Reject** it. Anyone reviewing can **Propose a redline** of
  their own.
- **Download a PDF** — open the executed `CTR-0005` and click **Download PDF**
  for the agreement plus a signature-certificate page (signer, method,
  timestamp, IP, and document hash).

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
    contracts.ts   Contract + version creation/update/delete (content-hashed)
    template.ts    Dependency-free template engine ({{merge}}, |helpers, if/each) + tests
    generation.ts  Binds Organization/Counterparty/contract data into a template → version
    diff.ts        Word-level LCS diff for redlines (tracked changes) + tests
    pdf.ts         Dependency-free PDF writer (standard-14 fonts, real wrapping) + tests
    contract-pdf.ts Lays out a contract as a PDF: summary + document + signature certificate
    search.ts      Cross-entity search (incl. document text) + snippet highlighting + tests
    smtp.ts        Dependency-free SMTP client (STARTTLS, AUTH, dot-stuffing) + tests
    redline.ts     Propose / accept / reject revisions as versions
    obligations.ts Enforcement: obligations, derived OVERDUE status, upcoming query
    permissions.ts RBAC policy — can()/assertCan(), roles + owner grants
    email.ts       Pluggable notification transport → outbox + console
    auth.ts        Login sessions, scrypt password verify, admin impersonation
    oauth.ts       Google SSO (OIDC auth-code flow, claim validation) + tests
    reset.ts       Password set/reset via single-use hashed email tokens
    ratelimit.ts   Sliding-window rate limiter for login/reset + tests
    password.ts    Pure scrypt hash/verify (shared with the seed)
    session.ts     getCurrentUser() from the session (redirects to /login)
    *.test.ts      68 unit tests (workflow decisions, template engine, diff engine)
  app/
    layout.tsx         Minimal root shell (public: /login, /sign)
    login/             Sign-in page
    (app)/             Authenticated route group — auth-gated layout + all pages
    (app)/page.tsx     Dashboard (KPIs, my approvals, obligations, activity)
    contracts/         List, new, detail, and edit pages
    counterparties/    Counterparty CRUD
    templates/         Contract-template CRUD (merge fields auto-detected)
    clauses/           Clause-library CRUD (insertable in the template editor)
    workflows/         Workflow list + visual builder (new/edit)
    sign/[token]/      Public tokenized signing page
    obligations/       Global enforcement view
    insights/          Portfolio analytics (funnel, cycle time, value) — staff only
    outbox/            Sent-notifications viewer (staff only)
    audit/             Audit log + integrity check
    settings/          Organization settings + user admin (admin only)
    actions.ts         Server actions (the write surface)
  components/          UI + client components (signature pad, diff view, generate,
                       redline editor, workflow builder, …)
prisma/
  schema.prisma        Data model
  seed.ts              Seeds via the real engine, so states are internally consistent
```

### Document generation

Templates are plain text with merge fields. The **dependency-free template
engine** (`template.ts`, no `eval`, no npm) supports `{{ dotted.paths }}`,
formatting helpers (`{{ contract.value | money }}`, `{{ today | date }}`,
`| upper`, `| default:"…"`), conditionals (`{{#if x}}…{{else}}…{{/if}}`), and
loops (`{{#each items}}…{{/each}}`). Generation builds a data context from the
**Organization** record, the contract's linked **Counterparty**, the contract's
own fields, and any custom values, then renders the document as a new version.
The same pure engine renders the **live preview** in the browser, so what you
see is what gets written.

### Amendments

An executed contract is immutable — but deals change. **Amend** (on any
executed contract) creates a linked draft, *Amendment No. N*, seeded from the
executed text with the counterparty and deal fields inherited. The amendment
travels the normal review → approval → signature path like any contract;
parent and amendment link to each other (banner on the amendment, list on the
parent), and both sides' audit trails record the event.

### Clause library

**Clauses** (nav → *Clauses*) are pre-approved blocks of contract language —
liability caps, governing law, termination, force majeure ship seeded — managed
by Legal/admins with the same permissions as templates. In the template editor,
**"Insert clause from library…"** drops a clause at the cursor, so templates
are composed from vetted language instead of retyped. Clauses carry merge
fields just like templates ({{ org.jurisdiction }} etc.), resolve at
generation time, and are covered by search.

### Redlining

`diff.ts` computes a word-level LCS diff between two document texts; the
`DiffView` renders it as tracked changes (insertions underlined green,
deletions struck red). A reviewer **proposes a redline**, which creates a
`PROPOSED` version alongside the current text (linked by `basedOn`). An owner
**accepts** it — it becomes the current version and the prior one is
`SUPERSEDED` — or **rejects** it. This turns review into real negotiation with a
full, auditable revision history. The same diff powers **Compare versions** on
the contract page: pick any two versions and see the tracked changes between
them.

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

### Search

The header search box (or **/search**) queries everything at once: contract
titles, references, descriptions, counterparty names, **the full text of the
current document**, and templates. Document hits show a highlighted snippet
around the first match. Matching uses SQL `LIKE` (case-insensitive), so it
needs no extra infrastructure and ports to Postgres unchanged; the snippet
extraction is a pure, tested function (`search.ts`).

### PDF export

Any contract with a generated document can be **downloaded as a PDF**
(`Download PDF` on the contract page → `/contracts/<id>/pdf`). The file has a
cover with the deal summary, the full agreement text, and a **signature
certificate** page listing every signer with their method, timestamp, IP
address, and the SHA-256 hash of the exact document they signed — plus the
current version's content hash. Non-executed contracts are watermarked *DRAFT*.

The generator (`pdf.ts`) is **dependency-free**, in keeping with the template
and diff engines: it emits valid PDF/1.4 bytes using the standard-14 fonts (no
embedding, so files stay tiny) and wraps text accurately using the built-in
Helvetica width metrics. `contract-pdf.ts` is a pure layout function (no DB), so
it is unit-tested directly; the route handler just loads data and streams the
result with `Content-Disposition: attachment`.

### Tamper-evident audit

Every state change appends to an **append-only, hash-chained** log: each
event's hash covers the previous event's hash, so any retroactive edit breaks
the chain from that point forward. The Audit page runs `verifyAuditChain` live.
Deleting a contract **never deletes its audit events** — they are detached and
a `CONTRACT_DELETED` record is appended, so the chain stays verifiable and the
removal itself is audited.

### REST API

**Settings → API keys** (admin) issues bearer keys for the versioned REST
surface — keys are stored **hashed**, shown once at creation, scoped
**read-only** or **read + write**, and revocable:

```
GET  /api/v1/contracts?status=EXECUTED     list (filter, limit)
GET  /api/v1/contracts/CTR-0005            one contract + versions, signatures, obligations
POST /api/v1/contracts                     create a draft (WRITE scope)
GET  /api/v1/counterparties                list  ·  POST creates (WRITE)
GET  /api/v1/obligations?status=OPEN       list obligations
Authorization: Bearer ck_…
```

API-created contracts are attributed in the audit log with the key's name.
Together with webhooks this closes the integration loop: events push out,
data reads/writes come in.

### Webhooks

**Settings → Webhooks** (admin): register endpoints that receive an
HMAC-SHA256-signed JSON POST (`X-Contractable-Signature`) for lifecycle
events — contract created/approved/executed/rejected/amended/deleted, workflow
started, signatures requested/signed/declined, redlines proposed/resolved,
documents generated, obligations added. Filter per endpoint with exact names,
prefixes (`contract.*`), or `*`. Dispatch piggybacks on the audit log (one
call site), runs detached so it can never slow or fail the operation, and
every attempt is logged with status/response for debugging.

### Authentication & sessions

Login is real and self-contained: passwords are hashed with **scrypt**
(`password.ts`, no external deps), and a successful sign-in creates a
server-side **`Session`** row whose random token lives in an httpOnly cookie.
Every route under the **`(app)` route group** is protected by its layout calling
`getCurrentUser()`, which resolves the session or **redirects to `/login`**;
`/login` and the public `/sign/<token>` page live outside that group. Admins can
**impersonate** any user (to demo/verify roles) — the real admin id is stashed
so they can always return, and only an admin can start it.

**SSO is built in** (`oauth.ts` — the OIDC authorization-code flow in two
fetches, no dependency) with two providers sharing one flow:

- **Google** — set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (redirect URI
  `{APP_BASE_URL}/auth/google/callback`).
- **Any OIDC identity provider** (Okta, Azure AD/Entra, Auth0, Keycloak…) —
  set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and a display
  `OIDC_NAME`; endpoints resolve automatically from the issuer's
  `/.well-known/openid-configuration` (redirect URI
  `{APP_BASE_URL}/auth/oidc/callback`).

Both flows are CSRF-protected with a state cookie, validate the id_token's
issuer/audience/expiry (the discovery document's issuer must match the
configured one), require a verified email, and map it to an **existing** user —
accounts are never auto-created, since roles are assigned by an admin. SSO and
password sign-in produce the identical server-side session.

**Password reset** (`reset.ts`) works through single-use emailed links
(`/forgot` → `/reset/<token>`, 1-hour TTL): only the token's sha256 is stored,
completing a reset revokes every existing session, and unknown emails get the
same response as known ones (no account enumeration). It doubles as the
**invite flow** — an admin creates a user without a password and the user sets
one via "Forgot password". Login and reset requests are **rate-limited**
(`ratelimit.ts`, sliding window: 10 login attempts / 15 min, 3 reset emails /
hour per account).

### Role-based access control

`permissions.ts` is a single pure policy module. `can(actor, action, resource?)`
is the source of truth for both layers: the UI hides controls a user may not
use, and **every mutating server action calls `assertCan`** as the real
security boundary (hiding a button is not access control). Roles: `ADMIN`,
`LEGAL`, `MANAGER`, `SIGNER`, `VIEWER`. Contract-scoped actions also grant to
the contract's **owner/creator**, so a manager who owns a deal can act on it
even if their role alone wouldn't. Try it: as an admin, impersonate **Vic
Viewer** — every mutation control disappears, admin-only nav (Settings, Outbox)
is hidden, and direct navigation to a guarded page redirects.

### Import & export

Data leaves cleanly: **Export CSV** on the contracts list downloads the full
register, and **Export JSON** on any contract downloads a complete **evidence
bundle** — metadata, every version with its content hash, signature receipts
(signer, timestamp, IP, document hash), obligations, and the audit trail.
Data comes in too: **Import from CSV** on the counterparties page upserts by
name (header row: `name, legal_name, address, contact_name, contact_email,
jurisdiction, notes`). The CSV codec (`csv.ts`) is dependency-free and
round-trip tested.

### Insights

**/insights** (staff only) computes portfolio analytics from existing data:
KPI cards (contracts, total/executed value, in-flight count, average & median
**cycle time** from created → executed), the pipeline funnel by status,
executed volume for the trailing six months, and value broken down by category
and top counterparties. All computations are pure functions in `insights.ts`
with unit tests — the page just loads rows and renders bars.

### Reminders (renewals & obligations)

A periodic **reminder sweep** (`reminders.ts`) emails obligation owners about
items due within 7 days or overdue, and contract owners about executed
contracts expiring within 30 days. A `ReminderLog` row per (entity, kind) send
enforces a 7-day cooldown, so reminders repeat weekly instead of spamming.
Two triggers, no cron infrastructure: app traffic runs the sweep lazily at
most every 12 hours (detached — page loads never wait), and
**`GET /api/cron/reminders`** runs it on demand for real schedulers (set
`CRON_SECRET` to require a Bearer token). Reminder emails appear in the outbox
like everything else.

### In-app notifications

The header **bell** shows an unread badge and a dropdown of your latest
notifications — approvals waiting on you, signature requests, executed/rejected
outcomes, proposed redlines, and reminders. They're created alongside outgoing
email in the same transaction (`queueEmail` is the single call site) for
recipients who are users of the system; external signers and password-reset
links are excluded. Click-through opens the contract; **Mark all read** clears
the badge.

### Email notifications

`email.ts` persists every message to an in-app **outbox** (`EmailMessage`) and
logs to the console, so notifications are demoable with zero infrastructure.
**Real delivery is built in**: set `SMTP_HOST` (and optionally `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — see `.env`) and every notification is
also sent over SMTP by a **dependency-free SMTP client** (`smtp.ts`: EHLO,
STARTTLS upgrade on 587 / implicit TLS on 465, AUTH PLAIN/LOGIN, dot-stuffed
DATA — protocol-tested against an in-process mock server). Delivery runs
detached so a slow relay never holds up a workflow transaction, and each outbox
card shows the outcome (`LOGGED` / `SENT` / `FAILED` with the error).
Notifications fire on: an approval/review step activating (to its assignees), a
contract sent for signature (each signer's unique link), a contract executed or
rejected (to the owner), and a redline proposed (to the owner). The **Outbox**
page (staff only) shows everything sent.

---

## Moving to production

- **Database** — change the `datasource` provider in `prisma/schema.prisma`
  from `sqlite` to `postgresql` and point `DATABASE_URL` at your Postgres
  instance; the schema is otherwise portable. (SQLite is used here only to keep
  local setup zero-infrastructure.)
- **Authentication** — real email/password login with server-side sessions is
  built in (`auth.ts`), and **Google SSO** works by setting the two
  `GOOGLE_*` variables in `.env`. For other identity providers (Okta, SAML),
  mirror `oauth.ts`/the `auth/google` routes — the session and authorization
  layers stay the same. Passwords use scrypt; rate-limiting and password reset
  are built in (the limiter is in-memory — back it with Redis if you run
  multiple nodes).
- **E-signature** — the built-in signer is self-contained. To use a third-party
  provider (e.g. DocuSign), implement an alternative behind the signing module.
- **Email delivery** — set the `SMTP_*` variables in `.env` and notifications
  send as real mail (in addition to the outbox). Works with any standard relay
  (SendGrid, SES SMTP, Postmark, a corporate relay) on 587/STARTTLS or 465/TLS.

---

## What's built vs. next

**Built:** document generation from data-bound templates (with live preview and
a visual template CRUD); **PDF export of contracts with a signature
certificate**; redlining with tracked-changes diffs and
propose/accept/reject; configurable multi-step workflows (review/approval/
signature) with a visual builder, role- and user-based assignment, ALL/ANY
rules, and rejection handling; built-in ordered e-signature with hashing;
contract versioning with lineage; obligation tracking with overdue detection;
hash-chained audit with verification; **email/password authentication with
server-side sessions and admin impersonation**; **role-based access control
enforced in every server action**; **email notifications with an in-app
outbox**; counterparties, organization, and user admin; and full
insert/edit/delete across contracts, templates, workflows, counterparties,
obligations, signers, comments, and users.

**Natural next steps:** additional identity providers (Okta/SAML — mirror the
Google flow), richer search ranking (FTS5/tsvector), contract renewal
reminders, and bulk import/export.
