# CommerceDesk CodeCanyon release checklist

Internal release gate for the CommerceDesk first release. This checklist is not evidence that the package is ready to submit. Mark an item complete only after attaching or linking the evidence produced by the release build.

## Buyer documentation

- [ ] Provide the help file in English as HTML or PDF.
- [ ] Write for a buyer who has not worked with the source before; explain installation, initial configuration, everyday use, and customization.
- [ ] Document every environment variable, external service, and credential required to run the application. Never include real secrets in the download.
- [ ] Include database setup, demo or seed data, production startup, upgrade, backup, and recovery instructions.
- [ ] Include screenshots or diagrams for setup and the main workflows.
- [ ] Make the documentation publicly accessible without requiring an item purchase key.
- [ ] List third-party code and media assets with their licenses and attribution requirements.

## Download package

- [ ] Build the source from a clean checkout using the documented commands.
- [ ] Include only the files needed to install, run, customize, and verify CommerceDesk.
- [ ] Exclude developer machine settings, local secrets, temporary output, private customer data, and unused dependencies.
- [ ] Organize the archive so buyers can identify the application source, help file, license information, and any demo assets.
- [ ] Confirm the final archive opens, installs, and runs on a clean machine using only the help file.
- [ ] Keep the archive below Envato's recommended 2 GB size limit.

## Product and security checks

- [ ] Re-run the documented unit, integration, build, and end-to-end checks from the final source state; save the full outputs.
- [ ] Test a clean first-run install, tenant isolation, role permissions, authentication recovery, and all first-release workflows using separate demo tenants.
- [ ] Confirm transactional stock reservations, order and payment state changes, webhooks, retries, and duplicate-request handling against the supported providers.
- [ ] Verify customer-facing pages and admin workflows at desktop and mobile sizes, keyboard navigation, reduced-motion preference, and supported browsers.
- [ ] Review logs and the production bundle for secrets, development-only routes, test data, and internal diagnostics.
- [ ] Record supported runtime versions, database version, browser support, known limitations, and any required external accounts.

## Marketplace presentation

- [ ] Prepare a concise title, accurate feature description, setup requirements, version history, tags, and support details.
- [ ] Create original preview screenshots at the current Envato minimum dimensions and verify they show the actual release build.
- [ ] If a live preview is provided, test the full preview inside an embedded frame and ensure it works without buyer-only configuration.
- [ ] Confirm all included fonts, icons, illustrations, and other assets may be redistributed with this item.
- [ ] Produce and checksum the final ZIP only after the release gates above are complete.

## Evidence to attach before submission

| Gate | Evidence |
| --- | --- |
| Clean install | Date, OS/runtime versions, and completed install steps |
| Automated checks | Commands, full output, and final commit identifier |
| Workflow acceptance | Requirement-to-test matrix, including tenant and role coverage |
| Security review | Findings, fixes, and final recheck |
| Visual review | Desktop/mobile screenshots and accessibility notes |
| Package review | Archive tree, size, checksum, and clean-install result |
| Help file | Public URL plus packaged HTML/PDF path |
| Asset rights | Dependency and attribution inventory |

## Current verification ledger

Historical checks are not release evidence for later edits. Replace these notes with results from the final source state before submission.

| Check | Known result | Release action |
| --- | --- | --- |
| Unit suite | 27 tests passed on the 2026-09-30 working tree using Node.js 24, including spring/fall DST slot rules, 23/25-hour closure bounds, skipped local dates, cancellation cutoff boundaries, deal pipeline rules, permissions and interval capacity | Re-run and retain the complete output after the final changes |
| Production build | TypeScript check and optimized Next.js 16.3.6 build passed on the 2026-09-30 working tree using Node.js 24, including support/return workflows, appointment customer link issue and management routes, date closures, week calendar, staff appointments, owner team-access, invite acceptance, deal pipeline and deal-task routes/pages | Re-run from a clean install after the final changes |
| Current unit suite | 78 passed, 0 failed, and one opt-in integration test skipped on 2026-10-06 with Node.js 24.19.0; includes private-file checks, SMTP DNS/transport safety, invitation template escaping and retry-schedule checks | Rerun from final source state and retain output |
| Current production build | Optimized Next.js build and TypeScript check passed on 2026-10-06 with Node.js 24.19.0 after email outbox, invitation delivery, status history and retry controls | Rerun from a clean install before submission |
| Service completion API flow | Mixed physical/service order, partial and final service quantities, duplicate replay, changed-payload conflict, unchanged payment state, and response privacy passed against a disposable MongoDB replica set; [recorded evidence](evidence/2026-10-06-service-completion.md) | Verify staff UI in desktop/mobile browsers and complete assigned work-order lifecycle |
| Work-order API flow | Work-order generation, owner assignment, operator queue scoping, due date, task-gated completion, and order/payment synchronization passed against a disposable MongoDB replica set; [recorded evidence](evidence/2026-10-06-work-orders.md) | Verify UI at desktop/mobile sizes and complete the broader first-release work-order requirements |
| Private work-order attachment and packing-slip flow | Production API/worker acceptance against a disposable replica set covered owner/assigned-operator upload/download/delete, cross-tenant and unassigned denial, signature validation, safe names, private headers, metadata privacy, the 20-file cap, deletion slot release, failed-delete retry, aged orphan cleanup, packing-slip quantities/address, and exclusion of payment/price fields; [recorded evidence](evidence/2026-10-06-work-order-attachments.md) | Verify browser/print UI, malware/active-file retention policy, and upload-volume backup/restore |
| SMTP invitation outbox flow | Disposable local MongoDB acceptance verified encrypted private-link payload, transient retry, accepted/rejected recipient handling, manual-retry state, and stale-worker recovery with SMTP responses mocked; [recorded evidence](evidence/2026-10-06-smtp-settings.md) | Repeat against a replica set and test SMTP server; then verify live-provider delivery |
| Catalogue CSV live API flow | Setup, invalid-batch atomicity, create-only import, export, duplicate protection, authentication and origin checks passed against a disposable MongoDB replica set; [recorded evidence](evidence/2026-10-05-catalogue-csv-replica-set.md) | Repeat tenant-isolation/browser acceptance |
| Catalogue CSV import/export | Tenant-scoped CSV routes with whole-batch validation; imports create unpublished drafts with zero opening stock, limits 500 rows / 1 MB; CSV escaping is formula-safe; API/database acceptance unverified | Exercise validation, tenant isolation, duplicate conflicts, and large-file limits against replica-set MongoDB and desktop/mobile browsers |
| Shared web inbox | Tenant-scoped conversation/message model, private customer link page, staff replies/notes, assignment, takeover, close/reopen, and link rotation; route/database and browser acceptance unverified | Exercise on replica-set MongoDB and desktop/mobile browsers; then implement WhatsApp provider integration |
| Database end-to-end flows | Not completed; Docker was unavailable in the earlier environment | Run against a disposable database and exercise the required first-release workflows |
| Variant workspace and storefront changes | Added after the last recorded build | Verify catalogue loading, variant management, reservation and release, order snapshots, and mobile rendering |
| Appointment scheduling | Added DST-aware slot generation, capacity checks, transactional hold/reschedule routes, editable weekday settings, staff actions, and worker expiry sweep; domain tests pass | Exercise on a Mongo replica set under concurrent create/reschedule requests; verify UI against real tenant data, including role denial and hold expiry |
| Team invitations | Hashed 48-hour invite tokens, owner-only member management, role changes, transactional acceptance, last-owner protection, and session invalidation on revocation are implemented | Exercise invite acceptance, existing-account proof, duplicate acceptance, role changes, last-owner guard, and tenant isolation against a disposable database |
| Sales pipeline | Configurable per-tenant stages, deals, assignment, values, due dates, lost reasons, audited history and assigned follow-up tasks are implemented; stage-domain unit checks pass | Exercise cross-tenant and assigned-owner authorization, task lifecycle, stage migration, and pipeline rendering with real workspace records |
| Support and returns | Tenant-scoped staff support queue, immutable case-event timeline, linked fulfilled-order return requests, authorization/decline, partial receipt and explicit tracked-stock movement are implemented; successful TypeScript check and production build on 2026-09-30 | Exercise role and tenant boundaries, quantity limits under concurrency, partial receipt, duplicate receipt requests, inventory movement reconciliation, and confirm refunds remain a separate payment-ledger action |
| Appointment closures | Staff can create, remove and save all-day closure ranges in the business timezone; local-day conversion has unit cases for 23-hour, 25-hour and skipped calendar dates | Check closure application in public availability, ambiguous dates on DST boundaries, tenant timezone changes, mobile editor layout, and appointment rescheduling around closures |
| Visual appointment calendar | Staff appointment panel shows a navigable business-timezone week with overlapping bookings laid out in lanes and a retained action list; production build passes | Review populated and empty weeks at desktop/mobile sizes, verify week navigation loads the matching range, and check booking labels around DST changes |
| Customer appointment changes | Staff can issue a copyable, expiring private link for a confirmed appointment. Token hashes are stored, reissue revokes the old link, public availability is throttled, and cancel/reschedule enforce the policy cutoff with transactional capacity checks | Exercise link rotation, expiry, same-origin rejection, cancellation deadline, conflicting concurrent reschedules, timezone changes, and terminal-action token revocation in a replica-set environment |

## Envato references

- [Code item preparation and technical requirements](https://help.author.envato.com/hc/en-us/articles/360000471583-Code-Item-Preparation-Technical-Requirements)
- [Item presentation requirements](https://help.author.envato.com/hc/en-us/articles/360000424863-Item-Presentation-Requirements)
- [Common rejection factors for code items](https://help.author.envato.com/hc/en-us/articles/360000536823-Common-Rejection-Factors-for-Code-Items)
