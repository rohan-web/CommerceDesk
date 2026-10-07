# Partial dispatch acceptance evidence — 2026-10-06

## Scope

Partial physical-item dispatch on an internal native-store order. Service lines remain separate and are not marked complete by a physical dispatch. Dispatch stock changes and order history are written in MongoDB transactions. Order status, payment status, and fulfilment status remain separate.

## Disposable replica-set API run

- Created owner workspace, customer, tracked product, opening stock of 5, and an order for 4 units: setup/customer/product/stock/order all returned 200/201 as expected.
- Dispatching 2 of 4 returned 200 and `partially_fulfilled`.
- Repeating the same key and payload returned 200 with `replayed: true`.
- Reusing that key for a different quantity returned 409.
- Dispatching the remaining physical quantity completed the order with `fulfilled`; stock-on-hand was 1 and stock-reserved was 0.
- Separate order: dispatching 1 of 2, then cancelling, returned 200 for both actions. Final product stock-on-hand was 1 and stock-reserved was 0, proving cancellation released only the remaining reservation.
- Changed the disposable membership to sales and attempted dispatch; the API returned 403.

## Automated checks

- `pnpm test` on Node.js 24.19.0: 64 passed, 0 failed, 1 opt-in replica-set membership test skipped.
- `pnpm build` on Node.js 24.19.0: passed, including TypeScript and route compilation.

## Remaining acceptance

- Browser and responsive UI walkthrough is unverified.
- At the time of this dispatch run, service completion, work orders, private files, and packing slips were not yet implemented. Later acceptance is recorded in `2026-10-06-service-completion.md`, `2026-10-06-work-orders.md`, and `2026-10-06-work-order-attachments.md`. Customer notifications and shipping-zone/carrier behavior remain incomplete.
