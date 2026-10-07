# SMTP settings implementation evidence — 2026-10-06

## Implemented

- Workspace owners can configure an SMTP hostname, port 465/TLS or 587/required STARTTLS, username, app password, sender name, and sender address at `/settings/email`.
- The API checks the SMTP server and credentials before saving a replacement. It preserves existing credentials when the password field is left blank, and never returns the password to the client.
- Passwords are encrypted with the existing `APP_ENCRYPTION_KEY`; connection create/update and removal are audited without recording credentials.
- SMTP DNS results are checked for public routable addresses and pinned to the selected IP for the connection attempt; private, local, and reserved addresses are rejected. TLS certificate validation is enabled and TLS 1.2 or newer is required.
- Verification attempts are limited per workspace to eight in each 15-minute window.
- Team invitations are placed in a tenant-scoped MongoDB outbox. The private invitation URL is encrypted inside the outbox payload; the recipient, template identifier, status, attempt count, next attempt, safe error code and provider message ID form the delivery log.
- The worker polls the outbox, locks due records, uses bounded exponential retry for transient SMTP failures, marks permanent/final failures, and can recover stale worker leases. Owners can inspect the last 50 delivery records and retry a failed invitation. SMTP cannot be disconnected while messages are queued or sending.
- The invitation template escapes HTML, strips header newlines, and refuses to send links that expired while queued. A stable Message-ID is reused across attempts; SMTP remains at-least-once if a worker stops after provider acceptance but before saving the sent status.
- Nodemailer transport timeouts are bounded and the transport is closed after verification.

## Verification

- `pnpm test`: 78 passed, 0 failed, 1 opt-in MongoDB test skipped (2026-10-06, Node.js 24.19.0).
- Unit tests cover public/private SMTP host checks, mixed DNS answers, pinned IP and TLS settings, transport cleanup, recipient send configuration, email template escaping/header normalization, and retry delays.
- `pnpm build`: optimized Next.js production build and TypeScript check passed (2026-10-06, Node.js 24.19.0); email routes, history screen, retry endpoint and worker compile.
- `git diff --check`: passed; only normal LF-to-CRLF warnings were reported for Windows checkouts.
- `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types tests/email-delivery.acceptance.mts`, with `MONGODB_TEST_URI=mongodb://127.0.0.1:27018/commercedesk_email_test?directConnection=true`: passed against a one-use local MongoDB instance. SMTP responses were mocked; the test verified encrypted invite URL storage, transient retry/backoff, recipient rejection, failed-message retry, and stale-worker recovery. It cleaned its test records; the disposable Mongo process and temporary data directory were removed afterward.

## Not verified / still required

- No actual tenant SMTP account was configured, so provider authentication and delivery have not been tested against a real server.
- The outbox/worker/retry routes were not run against a disposable MongoDB replica set or fake SMTP server; their database state transitions were tested against standalone MongoDB only.
- Password resets, quote/order/appointment notices and their templates are not implemented. SMTP settings/email history have not received browser/mobile visual acceptance.
