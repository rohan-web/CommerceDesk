# CommerceDesk

CommerceDesk is a multi-workspace commerce and customer-operations application built from the supplied **CommerceDesk First Release Specification v1.0**. The interface is a bespoke responsive dashboard and public storefront with custom CSS motion and a dark editorial visual system.

## Current build state

The codebase has a working installation and identity foundation: one-time first-owner setup, sign-in, workspace selection and switching, tenant-bound revocable sessions, role-based action permissions, and tenant-scoped APIs. Current commerce includes the catalogue and stock ledger, customer CRM, internal orders and fulfilment, immutable quote revisions with private acceptance and customer revision requests, configurable discount approval before sharing, integer-rounded discounts, optional quote deposits carried into converted orders and private payment requests, and a manual capture/refund ledger with bounded balance checks.

A first native storefront slice is implemented. An owner can configure store policies and manual fulfilment/payment methods, publish active physical products, and view the public catalogue. Customers can build a cart and place a delivery or pickup order with server-calculated tax, a fixed delivery fee, explicit policy acceptance, and an atomic stock hold. Orders remain pending until a signed Stripe payment event or an authorised staff member records funds. Where Stripe is connected, the private receipt offers a hosted card checkout for the remaining server-calculated balance. A private receipt link carries the order and payment instructions. A persistent worker expires unpaid reservations and releases held stock. Storefront receipt secrets are encrypted at rest. JSON write APIs enforce a hard streaming byte limit even when `Content-Length` is absent, and checkout attempts are rate-limited. Storefront dialogs trap and restore keyboard focus, close with Escape, and announce checkout errors to assistive technology. Owners can manage team invitations, roles and revocation, and sales staff can work an owner-configurable deal pipeline linked to tenant customers with assignment, follow-up dates, lost reasons and stage history.

This is an in-progress first-release implementation, not a finished CodeCanyon package. Native storefront variants support customer selection, variant-level pricing and stock reservation. Staff appointments include weekday hours, resources, DST-aware availability, expiring holds, closures, a week calendar and audited customer cancellation/rescheduling links. Internal orders can include physical products and services; physical dispatch and service completion are recorded separately, with immutable history and payment-state separation. Service lines create work orders; owners assign operations staff and due dates, and task checklists must be complete before final service completion. Work-order APIs, including private PDF/PNG/JPEG/WebP upload, download, removal and age-based cleanup for owners and assigned operations staff, passed disposable replica-set acceptance; browser acceptance is still unverified. Malware scanning, configurable retention for active files and upload-volume backup/restore remain unfinished. Print-ready packing slips are available for physical dispatches; customer notifications remain unfinished. The customer portal supports manually shared, revocable links, linked order/quote/appointment history, quote acceptance and customer-visible support conversations; it is not a verified customer sign-in system. Support cases and return authorization/receipt workflows are implemented, with stock updates recorded separately from refunds. A configurable sales pipeline, team invitations, roles, tenant-scoped records, immutable quote revisions and a manual payment ledger are also present. The staff web inbox supports private customer links, assignment, internal notes and human takeover. Catalogue CSV import/export is available; imports create draft entries only and do not change stock. Quote approval and portal workflows still need live browser and full replica-set acceptance.

Stripe has a tenant-scoped owner API and settings screen at `/settings/payments`. Customer receipts create idempotent hosted Checkout sessions for configured storefront deposits, accepted-quote deposits, or outstanding balances. Signed Stripe events are verified and deduplicated; verified captures and partial provider refunds update the immutable payment ledger only when source, amount and currency match. Staff can request a Stripe refund from a verified capture; pending refunds reserve the order balance until a signed result arrives. Delayed/out-of-order reconciliation acceptance remains incomplete. Stripe API behavior is mocked; no live account or webhook transaction has been tested. Account authenticator MFA is implemented, including encrypted TOTP enrollment, one-time recovery codes and sign-in challenge handling. Its settings enrollment/recovery/disable flow passed an isolated MongoDB replica-set run; end-to-end MFA sign-in remains unverified. Owners can configure tenant-scoped SMTP at `/settings/email`; credentials are encrypted and connection checks block private/reserved network destinations. Team invitations are queued in an encrypted outbox, retried by the worker, and shown in an owner delivery-history/retry screen. Outbox state transitions passed against a disposable local MongoDB instance with SMTP responses mocked; live SMTP delivery, password reset and quote/order/appointment email flows remain unverified or unfinished. WhatsApp, WooCommerce, OpenAI tools, broader durable automation, agency/platform billing, private-file scanning/retention, backups and update/rollback remain unfinished. Disposable replica-set checks verify catalogue CSV, work-order, and attachment APIs plus tenant-scope regression. Broad tenant-isolation, provider integration, recovery, accessibility, performance and buyer clean-install evidence remains incomplete. See [the first-release scope map](docs/FIRST_RELEASE_SCOPE.md) for the full milestone and acceptance list.

## Run locally

Requirements: Node.js 24, Docker Compose, and pnpm 11.19.0. The Compose stack provides MongoDB as a single-node replica set and Redis; MongoDB transactions require the replica-set configuration.

1. Copy `.env.example` to `.env`.
2. Generate separate random secrets for `SETUP_TOKEN` and `APP_ENCRYPTION_KEY` in PowerShell. The setup token is one-use; the encryption key must stay stable so saved receipt tokens remain decryptable.

   ```powershell
   $setupBytes = New-Object byte[] 32
   $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
   $rng.GetBytes($setupBytes)
   [Convert]::ToBase64String($setupBytes)

   $encryptionBytes = New-Object byte[] 32
   $rng.GetBytes($encryptionBytes)
   [Convert]::ToBase64String($encryptionBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
   ```

   Put the first value in `SETUP_TOKEN` and the second in `APP_ENCRYPTION_KEY`.
3. Keep `APP_URL=http://localhost:3000` for local use, then run `pnpm install --frozen-lockfile`.
4. Start the app and local services with `docker compose up -d --build`.
5. Open `http://localhost:3000` and complete the one-time owner setup.
6. Run the persistent reservation worker in a second terminal with `pnpm worker`.

The setup token is checked server-side and stops working after the first owner is created. Store `APP_ENCRYPTION_KEY` securely and back it up; replacing it makes existing encrypted receipt tokens and Stripe credentials unreadable.

## Stripe test payments

Connect Stripe from the owner-only Payments screen at /settings/payments using test-mode credentials during development. Copy the tenant webhook endpoint shown there into the Stripe dashboard and subscribe to checkout.session.completed, checkout.session.expired, checkout.session.async_payment_succeeded, and checkout.session.async_payment_failed. For a local app, use Stripe CLI forwarding to the copied endpoint; a deployed app needs a publicly reachable HTTPS APP_URL. Never put real Stripe keys in source control.

## Verify the source

- `pnpm test` runs unit checks for money, permissions, request origins, checkout totals, policy versions, bounded JSON parsing, authenticated secret encryption, appointment availability, deal-stage rules, dispatch/service-completion quantity rules, SMTP DNS/TLS and email-template/retry behavior, and Stripe signature/account verification and mocked Checkout-session creation.
- `pnpm build` creates the optimized Next.js production build.

On 2026-10-06, the source passed 78 unit tests (one opt-in database test skipped) and the optimized production build on Node.js 24.19.0. The email outbox state machine also passed against a disposable single-node MongoDB instance with SMTP responses mocked; no real SMTP account was used. These checks do not establish full workflow, deployment, concurrency, tenant-isolation, connector, or recovery acceptance. Isolated MongoDB replica-set API runs also verified MFA enrollment/recovery, physical partial dispatch/retry/cancellation, mixed physical/service order completion, and assigned work-order tasks and completion gating; see the [MFA evidence](docs/evidence/2026-10-06-mfa.md), [partial-dispatch evidence](docs/evidence/2026-10-06-partial-dispatch.md), [service-completion evidence](docs/evidence/2026-10-06-service-completion.md), [work-order evidence](docs/evidence/2026-10-06-work-orders.md), [work-order file/packing-slip evidence](docs/evidence/2026-10-06-work-order-attachments.md), and [SMTP/outbox evidence](docs/evidence/2026-10-06-smtp-settings.md).

## Architecture and release rules

The implementation uses Next.js/TypeScript, MongoDB and Redis/BullMQ. Public routes, APIs and jobs must use the same server-side domain rules. Business reads and writes must be tenant-scoped and authorized on the server. Financial values use integer minor units and explicit currency. A redirect never proves payment; only a verified provider event or an authorized ledger entry can change payment state. Keep demo records opt-in and clearly labelled. Confirm all third-party redistribution rights before publishing on CodeCanyon.
