# Service completion acceptance evidence — 2026-10-06

## Scope

Staff can create orders containing physical products and services, dispatch physical quantities, and record partial or full service completion separately. Completion entries are immutable, carry an optional note, use an idempotency key, and leave payment state unchanged. Internal retry keys and staff identifiers are not returned in order API responses.

## Disposable replica-set API run

- Created an isolated owner workspace, customer, physical product, service item, opening stock, and a mixed order. Each API operation returned its expected success status.
- Dispatched the complete physical quantity; the mixed order remained `partially_fulfilled` because service work was outstanding.
- Recorded one of two service units; the order remained `partially_fulfilled`.
- Repeated the same service request and key; the API returned the prior result with `replayed: true`.
- Reused the key with a changed note; the API returned 409.
- Recorded the remaining service quantity; the order became `fulfilled` while payment remained `unpaid`.
- Confirmed service history returned the event type and note while omitting idempotency keys, request fingerprints, and actor identifiers.
- The disposable app and MongoDB replica-set processes were stopped, and their temporary database files were removed.

## Automated checks

- Node.js 24.19.0 `pnpm test`: 67 passed, 0 failed, 1 opt-in replica-set membership test skipped.
- `pnpm build`: passed, including TypeScript and production route compilation.

## Remaining acceptance

- Staff UI has not been visually exercised in a browser or at responsive sizes.
- At the time of this service-completion run, assigned work orders and attachments were not yet implemented; later evidence records those workflows. Customer notifications remain outstanding.
