# Work-order files and packing-slip evidence — 2026-10-06

## Implemented behavior

- Owners and the operations member assigned to a work order can upload or download its files. Other operations members are denied; a user from another tenant receives not-found for the same attachment ID.
- The owner or assigned operations member can remove a file. Removal is audited and tenant/assignment checked; deleting it releases one slot. If physical deletion fails, a tombstone remains for the worker to retry.
- Uploads accept PDF, PNG, JPEG, and WebP signatures, with a 10 MB per-file limit and a transaction-safe maximum of 20 files per work order. The client MIME type is not trusted.
- Files are saved outside the public asset tree under `UPLOAD_DIR`, using random storage keys and private directory/file modes. The database stores tenant/work-order ownership, purpose, original safe display name, content type, size, and SHA-256. Downloads recheck the hash and return attachment-only, `nosniff`, private/no-store headers.
- Metadata responses do not expose storage keys or hashes. Uploads are audited. Docker Compose assigns the web app a persistent `work_order_files` volume.
- Operations staff and owners can open a print-ready packing slip from dispatched orders. The tenant-scoped API includes only the latest physical dispatch quantities and necessary shipping details; payment status, totals and prices are not returned.

## Disposable production API acceptance

Ran the production build against a temporary single-node MongoDB replica set and an isolated upload directory. `tests/work-order-attachments.acceptance.mts` reported `WORK_ORDER_ATTACHMENT_ACCEPTANCE_OK` after verifying owner/assigned-operator uploads, denial for unassigned operators, invalid signature rejection, filename sanitization, metadata privacy, authenticated download bytes and headers, cross-tenant not-found, removal and slot release, worker retry of failed deletions, orphan removal after 24 hours, rejection of the 21st file, and packing-slip quantities/address with no payment or price fields.

The disposable app, database, and temporary upload files were stopped and removed after the run.

## Automated checks

- Node.js 24.19.0 `pnpm test`: 70 passed, 0 failed, 1 opt-in membership integration test skipped.
- `pnpm build`: passed, including TypeScript and production route compilation.

## Remaining limits

- Staff upload controls and the print page have not been visually checked in a browser or at responsive sizes.
- Malware scanning, a configurable retention policy for still-active uploads, and backup/restore procedures for the upload volume are not implemented. Worker orphan cleanup is age-based and checks up to 250 oldest files per sweep.
- This verifies internal work-order attachments only. Quote, support-case, customer-upload, and packing-document attachments remain incomplete.
