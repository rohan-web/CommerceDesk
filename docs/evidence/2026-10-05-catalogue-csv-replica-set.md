# Catalogue CSV and tenant-scope verification

Date: 2026-10-05  
Runtime: Node.js 24.19.0, Next.js 16.3.6, MongoDB 8.2.2 replica set  
Database: isolated temporary local database; no customer or production data used.

## Automated checks

- `pnpm test` with `MONGODB_TEST_URI`: **57 passed, 0 failed, 0 skipped**. Includes a replica-set tenant-scope projection test.
- `pnpm test` without `MONGODB_TEST_URI`: **56 passed, 0 failed, 1 skipped**. The skipped test is the opt-in replica-set check.
- `pnpm build`: optimized Next.js production build and TypeScript check passed.

## HTTP workflow

The running app used a fresh disposable database and the normal first-owner setup/API session. Results:

| Scenario | Result |
| --- | ---: |
| One-time setup | 200 |
| Batch with one invalid row | 422; catalogue remained empty |
| Valid physical-product and service import | 201; both saved as unpublished drafts with zero stock |
| Authenticated catalogue read | 200; 2 rows |
| Tenant catalogue CSV export | 200; both rows present, including a quoted comma in a product name |
| Duplicate re-import | 409; catalogue remained at 2 rows |
| Export without a session | 401 |
| Import with a different origin | 403 |

The tests use the application route handlers through the local Next.js server. They do not establish desktop/mobile browser rendering, large-file performance, cross-tenant attack coverage, or CodeCanyon clean-install readiness.
