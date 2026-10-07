# First-release requirement traceability

This ledger tracks the stable requirement IDs in the supplied `CommerceDesk_First_Release_Specification.docx`. All in-scope requirements remain release-blocking. “Partial” means source code covers some behavior but one or more specified capabilities or acceptance evidence is missing. Nothing here is a release sign-off.

| ID | Current status | Current code/evidence | Main remaining work |
| --- | --- | --- | --- |
| ACC-01 | Partial | Tenant-scoped routes and permission checks in `src/server/tenant-scope.ts`; regression tests and CSV replica-set evidence | Full cross-tenant/API/attachment/export attack matrix and all-route audit |
| ACC-02 | Partial | Member revocation and workspace session invalidation in member routes | Verify all protected endpoints and existing-session revocation in acceptance runs |
| ACC-03 | Not started | No agency template system found | Configuration-only templates; prove no records or secrets copy |
| COM-01 | Partial | Integer minor-unit calculation, configured tax modes, pickup and flat delivery | Shipping zones; complete examples and acceptance across all currencies/tax rounding rules |
| COM-02 | Partial | Server pricing, order snapshots, CSV validation, customer access via private links | Verified customer accounts/company authorization; complete import validation and history checks |
| COM-03 | Partial | Atomic tracked-stock reservations, unpaid-hold release, manual ledger refund bounds | Concurrent oversell proof; service/component rules; return-linked restocking acceptance |
| COM-04 | Not started | Native storefront exists; no WooCommerce connector | One-store-per-tenant connection, authority boundaries, sync health and no second stock ledger |
| COM-05 | Partial | Responsive UI source and keyboard-focused storefront dialogs | Search/filter/sort/pagination states, preserve checkout errors, browser/device/accessibility acceptance |
| CRM-01 | Partial | Shared web inbox, private links, internal notes, takeover/resume | WhatsApp/provider events, deduplication, delivery failures/retry, attachments, opt-out policies |
| CRM-02 | Partial | Conversation/deal assignments and activity/audit records | Verify reassign audit, channel-aware outbound restrictions and opt-out enforcement |
| QUO-01 | Partial | Physical/service lines, revisions, expiry, deposits and discount approval | Alternative packages, optional lines, attachments, complete permission matrix and editor acceptance |
| QUO-02 | Partial | Immutable revisions, private expiry links and acceptance history | Verify identity/time/totals and reject superseded/expired links in database acceptance |
| QUO-03 | Partial | Approval threshold, revision requests and idempotent conversion | Stock/service recheck, shortage handling and full customer workflow evidence |
| PAY-01 | Partial | Tenant Stripe Checkout and manual payment ledger | Separate platform subscription billing ledger; document no marketplace payouts |
| PAY-02 | Partial | Signed, deduplicated Stripe event handling; redirects do not mark payment received | Real Stripe test events and delayed/out-of-order webhook transaction acceptance |
| PAY-03 | Partial | Deposits, balances, bounded partial refunds and audit records | Immutable reversal workflow, sequential commercial documents, full permission/evidence matrix |
| OPS-01 | Partial | Separate payment/order/fulfilment state and stock holds; operations-only partial physical dispatch with atomic stock deduction; separate service quantity completion with immutable notes/events; work-order generation, owner assignment, operations-only assigned queues, due dates, task-gated completion, synchronized service quantities, private work-order attachments with deletion/worker cleanup, and print packing slips for the latest dispatch. Replica-set evidence: `docs/evidence/2026-10-06-partial-dispatch.md`, `docs/evidence/2026-10-06-service-completion.md`, `docs/evidence/2026-10-06-work-orders.md`, and `docs/evidence/2026-10-06-work-order-attachments.md`. | Customer notifications, malware/active-file retention controls, browser/print acceptance, and broader malicious-file/security acceptance |
| BKG-01 | Partial | Tenant timezone, buffers, capacity checks, temporary holds and DST tests | Replica-set contention and customer timezone acceptance |
| BKG-02 | Partial | Reschedule/cancel links and policy cutoffs implemented | Confirm reserve-new-before-release-old; deposits/staff overrides and end-to-end acceptance |
| SUP-01 | Partial | Support queue, portal requests/replies, return authorization and receipt | Photo requests/attachments, owner assignment/resolution/reopen and integrated refund approval |
| AI-01 | Not started | No tenant OpenAI settings or ingestion workspace found | Credentials, sources/ingestion state, permissions, escalation, test console, caps and pinned versions |
| AI-02 | Not started | No permissioned AI tool executor found | Implement each listed tool and trace cited records safely |
| AI-03 | Partial | Server owns price, stock and permissions; quote discount approval exists | AI-specific approval, customer confirmation, adversarial retrieved-content tests |
| AI-04 | Not started | No AI test console found | Redacted trace, fallback/handover and usage-stop behavior |
| AUT-01 | Not started | Worker currently expires storefront reservations only | Rule editor, required triggers, conditions, delays, actions and execution history |
| AUT-02 | Not started | No configurable automation action runner found | Message/task/assignment/field/webhook actions, stop conditions and recursion bounds |
| AUT-03 | Partial | Persistent BullMQ reservation-expiry job, retry and database sweep | General business events, idempotent retries, visible failures and approval lifecycle |
| PLT-01 | Not started | No agency workspace or template screens found | Assigned clients, templates, invitations and scoped health views |
| PLT-02 | Not started | No platform administration or plan billing found | Platform overview, plans, subscription history, usage/jobs/audit and logged support sessions |
| PLT-03 | Not started | No subscription lifecycle found | Trial/active/past-due/suspended/cancelled transitions and restricted access behavior |
| INT-01 | Partial | Tenant-scoped Stripe and SMTP settings; both credential sets encrypted; SMTP owner screen verifies TLS/auth after rejecting private/reserved DNS answers. Team invitations use an encrypted MongoDB outbox; password-reset source adds an encrypted outbox payload and escaped template. Reset acceptance, current post-refactor build, replica-set SMTP worker, and live provider delivery are unverified. | Quote/order/appointment notifications; replica-set/fake-server acceptance for reset and invitation mail; provider diagnostics/reconciliation; live Stripe and SMTP sandbox acceptance; buyer disclosures |
| DAT-01 | Partial | Tenant IDs, unique/idempotency indexes and MongoDB transactions on critical mutations | External mapping/event index audit, retention and anonymization policy, cross-system consistency tests |
| DAT-02 | Partial | Tenant dashboard metrics are derived from stored records | Reconcile definitions, dates/timezone/currency against a known fixture and exported records |
| REC-01 | Not started | No external WooCommerce order mapping found | Lost-response retry returns the existing external order |
| REC-02 | Not started | No external sync health/history found | Last successful sync and pending change diagnostics |
| REC-03 | Partial | Stripe webhook receipts deduplicated and reconciled | Prove delayed/out-of-order provider facts never overwrite newer confirmed state |
| REC-04 | Not started | No provider failure operations screen found | Authorized staff inspect/retry recoverable sync failures without database access |
| OPS-02 | Partial | Health route, structured logs, worker failure logging, tenant metrics | Worker/provider diagnostics, storage/usage, audit search/export, controlled private file downloads |
| SEC-01 | Partial | Permission checks, validation, rate limits, protected sessions, webhook signatures, MFA, private work-order uploads/downloads/deletion, file signature checks, integrity hashes, tenant/assignee authorization, worker cleanup; password-reset source includes a 30-minute hashed one-time token, password update, session revocation, audit, and MFA preservation. Database acceptance and current post-refactor build are unverified. | Password-reset replica-set acceptance, malware scanning, active-file retention policy, broader SSRF protections, secret rotation and audited support access |
| SEC-02 | Partial | Unit tests cover selected request, money, permissions and TOTP rules | Required hostile callback, tenant/customer/upload, role-escalation and malicious-content test matrix; no high/critical findings |
| DEP-01 | Partial | Docker Compose web/worker/Mongo replica set/Redis and environment example | Clean install, dependency matrix, health/setup connection tests and supported hosting guide |
| DEP-02 | Not started | No verified second-instance backup/restore record found | Back up database/files, restore elsewhere, migration/version checks, tested update and rollback |
| DEP-03 | Partial | Setup route and native-mode app exist | Independent clean buyer install must reach login and working native checkout using docs only |

## Release-level evidence still required

- The specification’s E2E-01 through E2E-12 scenarios each need a deterministic test where applicable, a recorded interface walkthrough, and saved record/event evidence. Their complete scenario text and results must be mapped into a separate execution ledger before sign-off.
- Gate B requires real provider test-environment evidence for Stripe payments/refunds, WhatsApp send/receive, WooCommerce sync/recovery, SMTP delivery and AI tool execution. Mocks do not satisfy this gate.
- Gate C requires load results on a documented reference host, responsive checks at 360/768/1440 px, current Chrome/Firefox/Safari keyboard and accessibility review, and dashboard reconciliation against known data.
- Gates D–F require the complete buyer archive/documentation/licence inventory, honest role-specific demo with safe reset, and three external pilot installations including an agency and established business.
