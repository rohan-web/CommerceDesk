# Work-order acceptance evidence — 2026-10-06

## Scope

Service order lines create work orders in the same MongoDB transaction as order creation. Owners can assign an owner or operations teammate and set a due date. Operations users can access only work orders assigned to them, maintain a task checklist, and record service completion after all listed tasks are complete. Order fulfilment and payment status remain separate.

## Disposable replica-set API run

- Created an isolated owner workspace, an operations member/session, a customer, a service catalogue item, and a service order. Order creation returned 201 and generated one work order.
- Owner assignment and due-date updates returned 200.
- The operations account saw its assigned queue and the expected assignee identity.
- Added a task. Attempting final service completion while it was open returned 409.
- Completed the task, then recorded service completion as the assigned operator. The API returned 200, the order became `fulfilled`, and payment remained `unpaid`.
- The work-order list showed `completed` with the recorded quantity.
- The disposable app, MongoDB replica set, and their temporary database files were stopped and removed.

## Automated checks

- Node.js 24.19.0 `pnpm test`: 67 passed, 0 failed, 1 opt-in replica-set membership test skipped.
- `pnpm build`: passed, including TypeScript and production route compilation.

## Remaining acceptance

- At the time of this run, private attachments and packing slips were not yet implemented. They were added and separately verified later in [work-order file/packing-slip evidence](2026-10-06-work-order-attachments.md). Customer notifications remain outstanding.
- The work-order UI has not been visually checked in a browser or at responsive sizes. Cross-tenant and malicious-file tests remain pending with the secure upload workflow.
