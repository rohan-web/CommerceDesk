# CommerceDesk Handoff

## What the project is

CommerceDesk is a multi-workspace commerce and customer-operations web application for businesses and agencies. It is intended to cover the flow from enquiry and quotation through orders, payment, fulfilment, appointments and support.

This is an in-progress first-release codebase, not a finished or verified CodeCanyon package. The project is in `C:\Users\Rohan\Desktop\CommerceDesk`.

## Tech stack and how to run it

- **Stack:** Next.js 16.3.6, React 19.3, TypeScript 5.9, MongoDB/Mongoose, Redis/ioredis, BullMQ worker; pnpm 11.19.0; Node.js 24.
- **Required environment variables** (see `.env.example`): `MONGODB_URI`, `REDIS_URL`, `APP_URL`, `SETUP_TOKEN`, `APP_ENCRYPTION_KEY`. Use separate strong random values for the setup token and encryption key. Keep the encryption key stable and backed up.
- **Local setup:** copy `.env.example` to `.env`, fill the secrets, then run `pnpm install --frozen-lockfile`.
- **Start MongoDB, Redis, and the web app:** `docker compose up -d --build` (Docker Desktop / Docker Compose is required; MongoDB is configured as a single-node replica set for transactions).
- **Start the persistent worker** in a second terminal: `pnpm worker`.
- **Open the app:** `http://localhost:3000`, then complete the one-time owner setup. Set `APP_URL` to the actual app origin.
- **Checks:** `pnpm test` and `pnpm build`. The latest recorded 27-test and production-build pass predates the current Stripe scaffolding; current-source test/build status is **unverified**.

## Folder structure

- `src/app/` - Next.js pages, public storefront, customer pages, and staff-facing React interfaces.
- `src/app/api/` - Route handlers for identity, catalogue, customers, orders, quotes, appointments, deals, support, portal, and storefront flows.
- `src/server/` - Authentication, tenant access, request security, rate limiting, secrets, database, queues, and public access helpers.
- `src/server/domain/` - Money, storefront checkout, appointment availability, and deal-stage rules.
- `src/server/models/` - Mongoose schemas and indexes for tenants, users, commerce, CRM, scheduling, support, and audit records.
- `src/worker/` - BullMQ reservation-expiry worker and database recovery sweep.
- `tests/` - Node test-runner unit tests for money, permissions, request security, checkout, appointments, deals, and Stripe signature helper.
- `docs/FIRST_RELEASE_SCOPE.md` - Milestone map and remaining first-release work.
- `docs/CODECANYON_RELEASE_CHECKLIST.md` - Buyer-package checklist and historical verification ledger.
- `package.json` / `pnpm-lock.yaml` - Pinned scripts and dependencies.
- `docker-compose.yml` / `Dockerfile` - Local MongoDB replica-set, Redis, web, and worker setup.
- `.env.example` - Required local environment-variable names; contains no real secrets.
- `README.md` - Current local run instructions and broad project summary; some feature statements are stale (see Known bugs).
- `AGENTS.md` / `CLAUDE.md` - Repository-specific development notes.

## DONE: features that are working

The following have implementation paths in the source. Their complete live-database and release acceptance is not established unless stated otherwise.

- One-time owner setup, password sign-in, tenant-bound sessions, workspace selection/switching, permission checks, team invitations, role changes, revocation, and audit events.
- Native catalogue and variants, stock movements, customer CRM, internal orders, order fulfilment states, and a manual capture/refund ledger with balance checks and idempotency.
- Native storefront catalogue and guest delivery/pickup checkout, server-calculated tax and totals, manual bank-transfer/cash-on-pickup instructions, inventory reservation, private receipt tokens, and expired-hold stock release through BullMQ plus a database sweep.
- Immutable quote revisions, private quote links, acceptance, and idempotent conversion to an order.
- Customer-linked configurable sales pipeline, assignments, follow-up tasks, lost reasons, and activity history.
- Staff appointment scheduling, service resources, timezone-aware availability, daylight-saving rules, temporary holds, closures, week calendar, audited staff actions, and customer cancellation/rescheduling links.
- Tenant-scoped support cases, private staff notes, customer-visible replies, return authorisation, partial return receipt, and explicit tracked-stock movements.
- Customer portal bearer links stored as hashes, customer order/quote/appointment history, customer quote acceptance, and customer-visible support requests/replies. Staff share links manually; this is not a verified customer login system.
- Source has unit tests and a production build configuration. The most recent recorded pass is historical and does not verify the unfinished Stripe additions or live MongoDB flows.

## PARTIAL: started but incomplete

- **Stripe:** signature-verification helper, initial `StripeConnection` / `StripeWebhookEvent` schemas, a Stripe payment-method value, and helper tests are present. There is no complete Stripe connection setup, checkout/payment request, webhook processing/reconciliation route, refund workflow, or real provider test.
- **Customer access:** private customer portal links exist, but verified customer sign-in/recovery, company-member authorisation, saved addresses, and account-managed access are missing.
- **Quotes:** snapshots and customer acceptance exist; discount approvals, alternative packages, deposits/balances, customer revision requests, PDF export, and attachments are missing.
- **Support/returns:** case queue and basic return lifecycle exist; photo/evidence attachments, staff evidence requests, refund approval integration, and full reopening/conversation lifecycle remain incomplete.
- **Orders/operations:** basic payment and fulfilment states exist; deposits, external payment, partial dispatch, work orders, packing documents, mixed physical/service completion, and customer notifications are missing.
- **Documentation and release gates:** early setup docs/checklists exist, but buyer help, support/API guides, clean install, backup/restore, update/rollback, licensing, and final archive have not been verified.
- **Current spec artifact:** no CommerceDesk specification PDF was found on Desktop. The only Desktop PDF is the unrelated six-page `Stratify_Digital_AI_CRM_Proposal_Updated.pdf`. This handoff uses the matching `CommerceDesk_First_Release_Specification.docx`; the requested PDF remains **unverified/unavailable**.

## NOT STARTED: features from the spec with no complete implementation

- Shared inbox and conversation/message model, inbound webhooks, assignment/transfer/human takeover, delivery status, and duplicate-event handling for WhatsApp/web channels.
- WooCommerce connection, catalogue/stock import, external order creation, status sync, retry, and reconciliation.
- SMTP connection testing, transactional templates, delivery logs, retry, and automated invitation/appointment/customer email delivery.
- OpenAI tenant configuration, knowledge ingestion, permissioned tools, test console, usage limits, summaries, and safe handover/approval.
- Automation rule editor and event-driven actions beyond storefront hold expiry, including durable approval states and retry UI.
- Agency assignments/templates and platform tenant administration, plans, billing lifecycle, usage limits, and subscription ledger.
- Scoped REST API keys, signed outbound webhooks, provider event/mapping/reconciliation screens, and operational diagnostics/audit search/export.
- Product CSV import/export, company price lists and quantity tiers, categories/images/bundles, service booking from checkout, and complete customer account screens.
- Password reset, administrator MFA, secure private uploads/downloads, documented retention/anonymisation, backup/restore, and tested upgrade/rollback.
- Complete spec E2E-01 through E2E-12 evidence, tenant/role attack matrix, concurrency tests against replica-set MongoDB, provider sandbox proof, performance run, browser/device/accessibility acceptance, and pilot installations.
- Full CodeCanyon buyer package: polished public buyer help, licence/third-party asset inventory, screenshots, demo access/data reset, final ZIP/checksum, and clean-machine install evidence.

## Known bugs

- **No confirmed runtime bug list was found.** Current-source build and test status is **unverified** after the recent Stripe-related edits.
- `README.md` and parts of the release ledger are stale: they still describe customer portal and some appointment/support work as outstanding although those implementations now exist.
- The Git repository is on `main` with no commits and has no remote configured. `git push` cannot work until a remote is supplied.
- The Desktop PDF named above is not the CommerceDesk release specification; only the matching DOCX was available here.

## Next steps

- [ ] Finish or remove the incomplete Stripe scaffolding: tenant-owned connection setup, server-created checkout/payment requests, signed event ingestion, idempotent capture/refund reconciliation, and a visible failure/retry path.
- [ ] Update `README.md`, `.env.example`, scope map, and verification ledger so they match the current source and required external services.
- [ ] Build and test verified customer accounts, recovery, and company access; add tenant-isolation and role-denial tests.
- [ ] Implement shared inbox and conversation lifecycle, starting with signed/duplicate-safe provider event storage.
- [ ] Implement WooCommerce and SMTP connections, connection health, retries, and outage states.
- [ ] Complete quote approval, deposit, revision-request, PDF, and attachment workflows.
- [ ] Add work orders, partial fulfilment, service completion, evidence uploads, and refund approval.
- [ ] Add permissioned OpenAI tools and automation rules with durable jobs, human approval, usage limits, and retry controls.
- [ ] Add agency/platform administration, billing lifecycle, scoped APIs, outbound signed webhooks, and operational diagnostics.
- [ ] Run E2E-01–12, security/isolation, concurrency, recovery, accessibility, responsive-browser, and performance acceptance against disposable test services; save outputs and screenshots.
- [ ] Complete backup/restore and update/rollback procedures, third-party rights/licence review, buyer documentation, demo setup, and clean-install CodeCanyon ZIP.
- [ ] Configure the intended Git remote, then push the requested commit.
