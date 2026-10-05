# CommerceDesk

CommerceDesk is a multi-workspace commerce and customer-operations application built from the supplied **CommerceDesk First Release Specification v1.0**. The interface is a bespoke responsive dashboard and public storefront with custom CSS motion and a dark editorial visual system.

## Current build state

The codebase has a working installation and identity foundation: one-time first-owner setup, sign-in, workspace selection and switching, tenant-bound revocable sessions, role-based action permissions, and tenant-scoped APIs. Current commerce includes the catalogue and stock ledger, customer CRM, internal orders and fulfilment, immutable quote revisions with private customer acceptance and idempotent conversion, and a manual capture/refund ledger with bounded balance checks.

A first native storefront slice is implemented. An owner can configure store policies and manual fulfilment/payment methods, publish active physical products, and view the public catalogue. Customers can build a cart and place a delivery or pickup order with server-calculated tax, a fixed delivery fee, explicit policy acceptance, and an atomic stock hold. Orders remain unpaid until a staff member records received funds. A private receipt link carries the order and payment instructions. A persistent worker expires unpaid reservations and releases held stock. Storefront receipt secrets are encrypted at rest. JSON write APIs enforce a hard streaming byte limit even when `Content-Length` is absent, and checkout attempts are rate-limited. Storefront dialogs trap and restore keyboard focus, close with Escape, and announce checkout errors to assistive technology. Owners can manage team invitations, roles and revocation, and sales staff can work an owner-configurable deal pipeline linked to tenant customers with assignment, follow-up dates, lost reasons and stage history.

This is an in-progress first-release implementation, not a finished CodeCanyon package. Native storefront variants support customer selection, variant-level pricing and stock reservation. Staff service appointments include weekday hours, resources, DST-aware slots, expiring holds and audited status changes. Business owners can invite teammates with hashed, expiring links, change roles and revoke workspace access; SMTP delivery is not implemented, so links must be shared privately by the owner. Sales staff can manage configurable customer-linked deals, follow-up tasks, assignments and history. Customer accounts/portal, transactional email, online payment processing, provider webhooks, returns, visual appointment calendar and customer booking remain outstanding. Shared inbox and conversations, quote approval workflow, work orders, WooCommerce and other integrations, AI tools, durable business automation beyond reservation expiry, agency/platform billing, and the complete platform administration and recovery tooling remain to be built. Password reset and MFA are also outstanding. The required end-to-end, tenant-isolation, integration, restart/recovery, accessibility, and buyer clean-install acceptance evidence has not been completed. See [the first-release scope map](docs/FIRST_RELEASE_SCOPE.md) for the full milestone and acceptance list.

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

The setup token is checked server-side and stops working after the first owner is created. Store `APP_ENCRYPTION_KEY` securely and back it up; replacing it makes existing encrypted receipt tokens unreadable.

## Verify the source

- `pnpm test` runs the unit checks for money, permissions, request origins, checkout totals, policy versions, bounded JSON parsing, authenticated secret encryption, appointment availability and deal-stage rules.
- `pnpm build` creates the optimized Next.js production build.

The current checks are unit/build evidence only. They do not establish full workflow, deployment, concurrency, tenant-isolation, connector, or recovery acceptance.

## Architecture and release rules

The implementation uses Next.js/TypeScript, MongoDB and Redis/BullMQ. Public routes, APIs and jobs must use the same server-side domain rules. Business reads and writes must be tenant-scoped and authorized on the server. Financial values use integer minor units and explicit currency. A redirect never proves payment; only a verified provider event or an authorized ledger entry can change payment state. Keep demo records opt-in and clearly labelled. Confirm all third-party redistribution rights before publishing on CodeCanyon.
