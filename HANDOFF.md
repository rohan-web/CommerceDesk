# CommerceDesk Handoff

## What the project is

CommerceDesk is a multi-workspace commerce and customer-operations web application for businesses and agencies. It covers enquiries and quotations through orders, payments, fulfilment, appointments, and support.

This is an in-progress first-release codebase, not a finished or verified CodeCanyon package. Project path: `C:\Users\Rohan\Desktop\CommerceDesk`.

## Progress snapshot (2026-10-06; work paused)

- **Work status:** paused by the user because of usage limits. Latest code change adds password recovery screens, request/completion APIs, hashed one-time tokens, and an encrypted SMTP email template/outbox flow. Database acceptance and verification after the final refactor are still pending.
- **Spec ledger:** 43 requirement IDs are tracked; 29 (67%) have partial implementation and 14 have no implementation. None are marked release-complete because every item still needs its full scope and acceptance evidence. This is a code-coverage count, not “67% finished.”
- **Functional scope estimate:** roughly 50% of the overall feature inventory has some implementation, still a rough estimate rather than a verified acceptance score. Spec coverage is not release completeness: 29 of 43 tracked items are partial and 14 are not started; none are release-complete.
- **CodeCanyon readiness estimate:** roughly 25–30%. Core workflows exist, but several required integrations and whole product areas are absent, most acceptance evidence is incomplete, and buyer documentation, clean-install proof, and the final package are outstanding.
- **Worth continuing:** after about 10 hours as estimated by the user, there is a meaningful multi-tenant commerce/operations foundation, but it is still early for a CodeCanyon release. The current rough readiness estimate is 25–30%, not a measured score. It can be worth continuing if the aim is to finish and polish a clearly scoped product; acceptance or sales cannot be promised.
- The specification DOCX is present at `C:\Users\Rohan\Desktop\CommerceDesk_First_Release_Specification.docx` and has now been extracted as the source of truth. The separately requested PDF was not found. The spec explicitly keeps all in-scope capabilities release-blocking; estimates above are rough inventory percentages, not an acceptance score.
- **SMTP/email:** owner-only workspace configuration, encrypted password storage, TLS connection verification, tenant rate limiting, and public DNS/IP checks are implemented. Team invitations use an encrypted MongoDB outbox, a worker retries transient failures, and owners can inspect delivery history and retry failed invitations. Unit tests and production build pass; no live provider is connected, and other transactional email flows remain open.
- **Work-order files:** authenticated private upload/download/removal, worker cleanup, and packing slips are implemented. Production build, unit checks, and isolated replica-set API/worker acceptance pass; browser/print layout, malware scanning, retention for active files, and backup/restore are still open.

## Tech stack and how to run it

- **Stack:** Next.js 16.3.6, React 19.3, TypeScript 5.9, MongoDB/Mongoose, Redis/ioredis, BullMQ worker, Nodemailer SMTP delivery; pnpm 11.19.0; Node.js 24.
- **Environment variables:** `MONGODB_URI`, `REDIS_URL`, `APP_URL`, `SETUP_TOKEN`, `APP_ENCRYPTION_KEY`, and `UPLOAD_DIR` (see `.env.example`). Use separate strong random values for the setup token and encryption key. Keep the encryption key stable and backed up. Back up the persistent private upload volume as well. Stripe and SMTP credentials are saved per tenant and encrypted; they are not environment variables.
- **Setup:** copy `.env.example` to `.env`, set the variables, then run `pnpm install --frozen-lockfile`.
- **Start services and app:** `docker compose up -d --build`. Docker Desktop / Compose is required; MongoDB is configured as a single-node replica set for transactions.
- **Start worker:** run `pnpm worker` in a second terminal.
- **Open:** `http://localhost:3000`, then complete one-time owner setup. `APP_URL` must match the app origin.
- **Checks:** the last full unit run on 2026-10-06 with Node.js 24.19.0 reported 79 passed and one opt-in database test skipped. The last production build passed before the final password-reset service extraction. Current post-refactor build and unit status are **unverified**. Password-reset replica-set acceptance has not run; its SMTP mock path is written in `tests/password-reset.acceptance.mts`. Invitation outbox and work-order attachment acceptance evidence is documented below. Live SMTP remains unverified.

## Folder structure

- `src/app/` - Next.js pages, public storefront/customer pages, and staff interfaces including the inbox.
- `src/app/api/` - Identity, catalogue, customer, order, quote, conversation, appointment, deal, support, payment, SMTP settings, and storefront routes.
- `src/server/models/EmailDelivery.ts` and `src/server/email-delivery.ts` - Encrypted transactional email outbox, bounded retry worker, and invitation/password-reset delivery storage.
- `src/server/email-templates.ts` / `src/server/email-retry.ts` - Escaped team invitation email and bounded exponential retry schedule.
- `src/app/api/integrations/smtp/deliveries/` - Tenant-scoped owner retry endpoint for failed email records.
- `src/app/settings/email/` and `src/app/EmailSettingsPanel.tsx` - Owner-facing tenant SMTP connection screen.
- `src/app/api/integrations/smtp/` and `src/server/smtp.ts` - SMTP credential verification, DNS/public-address guard, and transport setup.
- `src/app/api/work-orders/` - Tenant-scoped work-order queue, assignment, due-date/tasks, and private attachment upload/download/removal routes.
- `src/app/api/orders/[id]/packing-slip/` and `src/app/orders/[id]/packing-slip/` - Tenant-protected latest-dispatch packing data and print-ready staff view.
- `src/app/WorkOrdersPanel.tsx` - Owner/operator work queue, task checklist, private file upload/download/removal controls.
- `src/server/password-reset.ts`, `src/server/models/PasswordResetToken.ts`, and `src/app/api/password-reset/` - Transactional one-time password recovery with hashed tokens, expiry, password update, session revocation, and audit event; DB acceptance pending.
- `src/server/` - Authentication, tenant access, request security, rate limiting, secrets, database, and queues.
- `src/server/models/SmtpConnection.ts` and `src/server/smtp.ts` - Tenant SMTP metadata, encrypted-secret-backed connection verification, and public-DNS address checks.
- `src/server/models/WorkOrder.ts` and `src/server/work-orders.ts` - Service-line work-order storage and transactional generation.
- `src/server/models/WorkOrderAttachment.ts` and `src/server/private-files.ts` - Tenant-scoped attachment metadata, signature checks, private local storage, hashing, and file access helpers.
- `src/server/domain/` - Money, payment balances, quote approval, conversation lifecycle, appointment availability, deal-stage rules, and physical/service fulfilment validation.
- `src/server/models/` - Mongoose schemas and indexes for tenants, users, commerce, CRM, conversations, scheduling, support, and audit records.
- `src/worker/` - BullMQ reservation-expiry worker, database recovery sweep, and private-file cleanup.
- `src/worker/private-files.ts` - Retries deleted-file cleanup after 15 minutes and removes unreferenced files older than 24 hours.
- `tests/` - Node test-runner unit tests for money, permissions, request security, SMTP/email templates, payments, quotes, conversations, appointments, deals, Stripe requests, and physical/service fulfilment rules.
- `tests/work-order-attachments.acceptance.mts` - Disposable HTTP/replica-set acceptance for upload/download/delete permissions, tenant boundaries, worker cleanup, packing slips, and the 20-file limit.
- `tests/smtp.test.mts` - SMTP public-address/DNS filtering, TLS requirements, pinned destination, and transport cleanup checks.
- `tests/email-templates.test.mts` - Email HTML/header escaping and retry backoff checks.
- `tests/email-delivery.acceptance.mts` - Disposable MongoDB acceptance for encrypted outbox payloads, retry/failure transitions, recipient rejection, owner retry state, and stale-worker recovery; requires a loopback `MONGODB_TEST_URI` whose DB name includes `_test`.
- `tests/password-reset.acceptance.mts` - Disposable replica-set acceptance for encrypted reset email, token expiry/one-time use, password replacement, session revocation, MFA preservation, and audit; requires loopback `MONGODB_TEST_URI` with `_test` in its database name.
- `docs/FIRST_RELEASE_SCOPE.md` - Milestone map and remaining first-release work.
- `docs/SPEC_REQUIREMENT_TRACEABILITY.md` - Requirement-by-requirement implementation/evidence gaps from the supplied specification; no row represents release sign-off.
- `docs/CODECANYON_RELEASE_CHECKLIST.md` - Buyer-package checklist and verification ledger.
- `docs/evidence/2026-10-05-catalogue-csv-replica-set.md` - Disposable replica-set/API test evidence for CSV workflows and tenant-scope regression.
- `docs/evidence/2026-10-06-mfa.md` - MFA implementation summary, test/build results, and integration-verification limits.
- `docs/evidence/2026-10-06-partial-dispatch.md` - Replica-set API evidence for partial dispatch, retries, stock reservation, cancellation, and role denial.
- `docs/evidence/2026-10-06-service-completion.md` - Replica-set API evidence for mixed orders, partial service completion, retry handling, response privacy, and payment separation.
- `docs/evidence/2026-10-06-work-orders.md` - Replica-set API evidence for work-order generation, owner assignment, operator queue isolation, due dates, task gating, and service-completion synchronization.
- `docs/evidence/2026-10-06-work-order-attachments.md` - Production API evidence for private attachments and packing slips, access denial, validation, privacy, and the file limit.
- `docs/evidence/2026-10-06-smtp-settings.md` - SMTP settings implementation and unit/build verification limits.
- `package.json` / `pnpm-lock.yaml` - Pinned scripts and dependencies.
- `docker-compose.yml` / `Dockerfile` - Local MongoDB replica-set, Redis, web, and worker setup.
- `.env.example` - Required local environment-variable names; contains no real secrets.
- `README.md` - Local run instructions, feature summary, and verification limits.
- `AGENTS.md` / `CLAUDE.md` - Repository-specific development notes.

## DONE: features that are working

Implementation exists in source; live database and complete release acceptance are not implied.

- Owner setup, password sign-in, tenant-bound sessions, workspace switching, permissions, team invitations, role changes, revocation, and audit events.
- Catalogue and variants, stock movements, customer CRM, internal orders, fulfilment states, manual capture/refund ledger with balance checks and idempotency, and tenant-scoped CSV export plus validated create-only CSV import. The tenant membership projection bug that caused authenticated routes to lose the workspace ID is fixed and covered by regression and live API checks.
- Native storefront guest checkout for delivery/pickup, server-calculated tax/totals, manual payment instructions, inventory reservation, private receipt links, hold expiry, full-payment or deposit policies, and later balance collection.
- Immutable quote revisions, private links, customer acceptance/revision requests, threshold-based discount approval, optional deposits, and idempotent order conversion with private payment request.
- Configurable sales pipeline, assignment, follow-up tasks, lost reasons, and activity history.
- Appointment scheduling with resources, timezone/DST-aware availability, holds, closures, week calendar, audited staff actions, and customer cancellation/rescheduling links.
- Support cases, private notes, customer-visible replies, return authorisation, partial receipt, and tracked-stock movements.
- Customer portal bearer links stored as hashes, customer order/quote/appointment history, quote acceptance, and customer-visible support requests/replies. This is not verified customer login.
- Shared web inbox: tenant-scoped conversations, private customer links and rotation, customer-visible replies, private staff notes, assignment, human takeover/resume, close/reopen, and idempotent message requests.
- Stripe credential management, encrypted storage, hosted Checkout for storefront/quote receipts, signed webhook reconciliation, and staff-requested partial refunds. Provider behavior is covered by mocked tests only.
- Owner-only SMTP connection settings; encrypted password storage; tenant-level verification rate limit; public DNS answers are pinned after rejecting private/reserved addresses; TLS and STARTTLS modes are verified before save. Unit checks and build pass; live provider authentication is unverified.
- Team invitation email delivery: one-time invite URLs are encrypted in a tenant-scoped outbox and sent by the worker through that tenant's SMTP account. Transient errors retry up to five times with bounded backoff; failures and sent/queued status appear in Email delivery settings; failed invitations can be retried. Templates escape HTML and strip subject newlines. Unit tests/build pass; the outbox state machine passed disposable MongoDB acceptance with a mocked provider. Actual SMTP delivery remains unverified.
- Account authenticator MFA: encrypted TOTP enrollment, password recheck to start, one-time recovery codes, replay prevention, auditing, session revocation, and an account security screen. Pure TOTP tests and the production build pass; full sign-in MFA challenge acceptance remains unverified.
- Orders can contain physical products and services. Operations-only physical dispatch supports partial quantities, immutable history, idempotent retries, transactional stock deduction, audit events, and releasing only undispatched reservations on cancellation. Service completion has a separate quantity-and-note flow with immutable history, idempotent retries, mixed-order status calculation, and unchanged payment state. Replica-set API evidence covers both workflows.
- Service order lines create work orders transactionally. Owners can assign owner/operations staff and set due dates; operations users see only their assigned queue, maintain task checklists, and cannot finish service quantities until every task is complete. Work-order and order completion quantities synchronize. Replica-set API evidence covers the owner/operator workflow.
- Work-order attachments: owners/assigned operators can upload, download, and remove PDF, PNG, JPEG, and WebP files up to 10 MB. Signature checks, private storage, SHA-256 integrity verification, audit events, safe download headers, a transaction-safe 20-file cap, and slot release on deletion are implemented. Worker retries failed deletions and sweeps unreferenced files older than 24 hours. Disposable replica-set acceptance passes; browser appearance is unverified.
- Packing slips: operations staff and owners can print a slip for the latest physical dispatch. The tenant-scoped API returns only dispatched quantities and shipping details, not order prices or payment state. Replica-set acceptance passes; print layout is not visually verified.

## PARTIAL: started but incomplete

- **Catalogue CSV:** export is capped at 10,000 rows and import at 500 rows / 1 MB. Import is create-only, creates unpublished drafts with zero stock, and does not import variants or adjust inventory. Setup, invalid-batch atomicity, valid import/export, duplicate rejection, unauthenticated rejection, and cross-origin rejection passed against a disposable MongoDB replica set. Desktop/mobile browser acceptance remains unverified.
- **Shared inbox:** MongoDB-backed route flows and browser acceptance are unverified. WhatsApp delivery, attachments, and provider-event synchronization are not implemented.
- **Stripe/payments:** delayed/out-of-order edge cases, live account tests, and Mongo replica-set integration tests remain incomplete.
- **SMTP/password recovery:** invitation and password-reset templates/outbox code are implemented. Reset uses generic request replies, rate limits, a 30-minute single-use hashed token, encrypted email payload, and session revocation while preserving MFA. Replica-set acceptance, post-refactor build/tests, browser flow, and real-provider delivery remain unverified; quote/order/appointment notices are not implemented.
- **MFA:** password-required enrollment, incorrect-password rejection, invalid TOTP rejection, enablement, generation of ten recovery codes, regeneration, rejection of a reused recovery code, disable, and final disabled state passed against an isolated MongoDB replica set on 2026-10-06. MFA sign-in challenge, Redis-backed login, and browser/device acceptance are unverified.
- **Customer access:** customer portal links exist, but verified customer sign-in/recovery, company-member authorization, saved addresses, and account-managed access are missing.
- **Quotes:** alternative packages, PDF export, and attachments are missing; approval and revision workflows need live acceptance. Staff converts accepted quotes to orders.
- **Support/returns:** photo/evidence attachments, evidence requests, and refund approval integration are missing; inbox and support cases are not integrated.
- **Orders/operations:** physical dispatch, service quantity completion, assigned work-order queues, private work-order file upload/download/deletion, worker cleanup, and print packing slips pass disposable replica-set API acceptance. Browser/print acceptance is unverified. Customer notifications are missing. Malware scanning, configurable retention for active uploads, and backup/restore of uploaded files remain.
- **Documentation and release gates:** buyer help, support/API guides, clean install, backup/restore, update/rollback, licensing, and final archive are not verified.
- **Spec artifact:** `C:\Users\Rohan\Desktop\CommerceDesk_First_Release_Specification.docx` is present and is the source used for the new requirement-by-requirement ledger; the separately requested PDF was not found.

## NOT STARTED: features from the spec with no implementation

- WhatsApp provider connection, inbound/outbound webhooks, delivery status, transfer, attachments, and provider-event deduplication.
- WooCommerce connection, catalogue/stock import, external orders, status sync, retries, and reconciliation.
- Quote/order/appointment notifications and templates; password reset is implemented in source but awaits acceptance evidence.
- OpenAI tenant configuration, knowledge ingestion, permissioned tools, test console, usage limits, summaries, and safe handover/approval.
- Automation rule editor and event-driven actions beyond storefront hold expiry.
- Agency templates/assignments and platform tenant administration, plans, billing lifecycle, usage limits, and subscription ledger.
- Scoped REST API keys, signed outbound webhooks, provider mapping/reconciliation screens, and operational diagnostics/audit search/export.
- Company price lists/quantity tiers, categories/images/bundles, service booking from checkout, and complete customer account screens.
- Malware scanning and retention rules for active private uploads, documented anonymisation, backup/restore, and tested upgrade/rollback.
- Full E2E-01 through E2E-12 evidence, tenant/role attack matrix, concurrency tests on replica-set MongoDB, provider sandbox proof, performance run, browser/device/accessibility acceptance, and pilot installations.
- Full CodeCanyon buyer package: public buyer help, licence/third-party asset inventory, screenshots, demo access/data reset, final ZIP/checksum, and clean-machine install evidence.

## Known bugs

- No confirmed runtime bug list was found. Live integration behavior remains unverified.
- Stripe network behavior is mocked; actual Stripe transactions and refund webhook/database behavior remain unverified.
- SMTP DNS/transport, template escaping and retry-schedule logic have unit coverage; outbox state transitions passed on a disposable single-node MongoDB instance using mocked SMTP results. Replica-set and real SMTP message delivery remain unverified.
- Git remote/push state remains unverified. The separately requested PDF was not found; the supplied DOCX specification is available and was extracted.
- No completed CodeCanyon review or market-demand validation has been done; marketplace suitability is unverified.

## Next steps

- [ ] Run `tests/password-reset.acceptance.mts` against disposable loopback replica-set MongoDB; then re-run unit tests and production build on the current refactored source.
- [ ] Verify invitation and password-reset outbox/worker behavior with replica-set MongoDB and a test SMTP server; then add quote/order/appointment messages and live-provider acceptance.
- [ ] Verify catalogue CSV controls and inbox workflows in desktop/mobile browsers; CSV API/database scenarios already pass against an isolated replica set.
- [ ] Exercise Stripe payments, refunds, and webhook transaction paths against disposable replica-set MongoDB and Stripe test mode, including delayed/out-of-order events.
- [ ] Verify MFA sign-in challenge with Redis and browser/device acceptance; enrollment, recovery, replay rejection, and disable have passed against an isolated replica set.
- [ ] Work through `docs/SPEC_REQUIREMENT_TRACEABILITY.md` by requirement ID; next foundation priorities are full tenant/role attack matrix and clean-install acceptance.
- [ ] Run the full customer portal and quote approval workflows against disposable MongoDB.
- [ ] Implement WhatsApp and WooCommerce with connection health, durable retries, and outage states.
- [ ] Visually verify dispatch, service completion, work orders, attachment flows, and packing slips on desktop/mobile; implement customer notifications.
- [ ] Implement private-file malware scanning and a retention policy for active uploads; document backup/restore of the `work_order_files` volume.
- [ ] Complete quote alternatives, PDF export/attachments, and refund approval.
- [ ] Add permissioned AI tools and durable automation with human approval, usage limits, and retry controls.
- [ ] Add agency/platform administration, billing, scoped APIs, outbound signed webhooks, and operational diagnostics.
- [ ] Run E2E-01–12, security/isolation, concurrency, recovery, accessibility, responsive-browser, and performance acceptance; save evidence.
- [ ] Complete backup/restore and update/rollback procedures, asset rights review, buyer documentation, demo setup, and clean-install CodeCanyon ZIP.
