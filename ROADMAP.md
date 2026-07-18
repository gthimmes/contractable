# Contractable — Roadmap

The MVP covers the full lifecycle: generate → redline → review/approve → sign →
PDF export → enforce, with auth (password/SSO/reset + rate limiting), RBAC,
email (outbox + SMTP), search, a clause library, and a hash-chained audit log.

This roadmap is the next arc: **make the platform proactive, complete the
lifecycle loop, and open it up to the outside world.** Ordered by value;
each item ships independently.

## 1. Renewal & obligation reminders — ✅ shipped

Enforcement today is passive: obligations show as overdue only when someone
looks. Add a reminder sweep that emails obligation owners about upcoming and
overdue items and contract owners about expiring contracts, with a
de-duplication log so nobody is spammed. Runs lazily on app traffic (no cron
infra needed) plus a `/api/cron/reminders` endpoint for real schedulers.
*Why first: enforcement is the promise of a CLM — this makes it real.*

## 2. Contract amendments — ✅ shipped

An executed contract is immutable, but deals change. "Amend" on an executed
contract creates a linked draft (amendment №N) seeded from the executed text,
which then travels the normal review → approval → signature path. Parent and
amendment link to each other.
*Why: closes the last gap in the lifecycle loop.*

## 3. Version compare — ✅ shipped

The redline view already diffs proposed vs. current. Generalize it: pick any
two versions of a contract and see the tracked-changes diff between them.
*Why: cheap (diff engine exists) and answers the most common review question —
"what changed between v2 and v5?"*

## 4. Insights dashboard — ✅ shipped

/insights: pipeline funnel by status, cycle-time metrics (created → executed),
executed volume and value by month, breakdown by category and counterparty.
Pure, tested computations over existing data; no new infrastructure.
*Why: managers run renewals and workload from this.*

## 5. Outbound webhooks — ✅ shipped

Admin-managed webhook endpoints (URL + secret + event filter). Key lifecycle
events (executed, rejected, workflow started/completed, signature signed,
redline proposed/resolved) POST a JSON payload signed with an HMAC header;
deliveries are logged with status for debugging.
*Why: the cheapest integration surface — Slack, Zapier, internal systems —
without building an API client story.*

## 6. Data in / data out — ⬜ planned

CSV export of the contract list (current filters), a full JSON evidence bundle
per contract (metadata, versions, signatures, audit trail), and CSV import of
counterparties. Dependency-free CSV codec, tested.
*Why: nobody adopts a system their data can't leave.*

## 7. Generic OIDC SSO (Okta, Azure AD, Auth0) — ⬜ planned

Generalize the Google flow using OIDC discovery (`/.well-known/openid-
configuration`): set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`,
`OIDC_NAME` and the login page offers the provider alongside Google/password.
*Why: orgs on Okta/Entra can't use Google-only SSO.*

## 8. In-app notifications — ⬜ planned

A bell in the header backed by the same events that send email: approvals
waiting on you, signatures completed, redlines proposed. Read/unread state.
*Why: email is where notifications go to die; the app should surface your
queue itself.*

## Later / not yet scheduled

- Full-text search ranking via SQLite FTS5 / Postgres tsvector
- Attachments on contracts (local disk store)
- Custom-field definitions per contract category
- Multi-organization tenancy
- REST API with API keys (webhooks cover outbound; this is inbound)
- Signature reminders and signing-link expiry
