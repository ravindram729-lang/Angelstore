# Angelstore STEP648/649 — Final Fix & Release Report

**Date:** 24 October 2026  
**Scope:** Uploaded STEP648 source package, isolated test storage only.  
**Original ZIP / production deployment:** untouched. No live deployment or production data was changed.

## Code and package fixes applied

1. **Recharge catalog is Admin-managed only.** Removed external recharge URL/token execution paths from the active backend and removed their environment settings. Admin can add/edit plans through the Admin panel; customer plans are read from the saved Admin catalog.
2. **Removed hard-coded sample plan prices from fresh installs.** The customer page no longer displays fabricated fallback plan prices when the Admin catalog is empty. It explains that the Admin needs to configure plans.
3. **Legacy sample cleanup.** Known seeded sample rows from earlier builds are removed on startup only when they have not been edited by an Admin. Edited/Admin-managed rows are preserved; the migration is recorded in the audit log.
4. **Manual recharge flow is explicit.** Operator selection is manual. The old initiation endpoint now returns a clear manual-only response; payment remains pending until Admin verification and manual processing.
5. **Production startup checks strengthened.** Production now requires a high-diversity auth secret, a non-default Admin username, a strong Admin password, explicit HTTPS CORS origins, and an absolute persistent-storage path.
6. **No assumed production hostname.** Live deployment verification now requires the owner to provide exact backend/frontend HTTPS URLs instead of assuming a production domain.
7. **Render configuration improved.** The unrelated `angelcsc.in` origin was removed from this separate Angelstore project configuration. Persistent disk, scheduled backup, off-site backup and alert configuration fields are included; owner-controlled endpoint/token values remain blank by design.
8. **Reliable E2E command.** `npm run e2e` and `npm run step522` now start the app on a temporary local port with temporary storage and test-only credentials, then stop the server and delete the test data. They do not use the normal project `data.json`.
9. **Release hygiene.** Removed obsolete server/frontend source snapshots, local login-recovery note, and an old nested snapshot folder from the release package. No `.env`, `data.json`, SQLite or database files are included.

## Verification run

- JavaScript syntax check: PASS.
- Release artifact audit: PASS.
- Isolated full E2E: **77/77 steps PASS** (customer/admin/staff sessions, payment verification, token lifecycle, QC, receipt PDF ownership, manual recharge catalog and Admin-only plan management).
- Regression script sweep: **47/47 commands PASS**.
- `STEP480` release readiness: **NOT READY** for two environment/deployment gates only:
  - Production operations configuration is not supplied in this offline package run (the owner must set the real off-site backup destination/token and alert destination, plus confirm persistent storage and production credentials).
  - Live deployment verification is not run because exact deployed backend/frontend URLs were not supplied. The verifier now intentionally refuses to guess them.

## Required before production release

1. In the actual Render service, set unique Admin username/password and a high-entropy `ANGELSTORE_AUTH_SECRET`; keep `NODE_ENV=production`.
2. Confirm the persistent disk is mounted at `/var/data/angelstore` and set `ANGELSTORE_STORAGE_DIR=/var/data/angelstore`.
3. Set `ANGELSTORE_CORS_ORIGIN` to the exact deployed frontend HTTPS origin only.
4. Configure an authenticated off-site backup destination and alert destination in the host dashboard. Never put their credentials into this ZIP or source control.
5. Run `npm run preflight` and `npm run ops-audit` with the actual host environment.
6. Set `ANGELSTORE_PROD_BACKEND_URL` and `ANGELSTORE_PROD_FRONTEND_URL`, then run `npm run deployment-verify` from a network that can reach those hosts.
7. Test persistence after a controlled restart and perform a real restore drill before using live customer data.

## Release statement

This package includes the code-level fixes that can be safely made offline. It is **not labelled production-ready** until the two hosting gates above pass. No production credentials, real payment, real customer records, or hosting dashboard access were used.
