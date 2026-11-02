# STEP645 — Bank & Demat Partner Referral Services

## Scope
Additive feature only. Existing Angelstore payment, receipt, token, UPPCL, recharge, application and customer/admin workflows are not replaced or removed.

## Customer
### Bank Account Opening
- Kotak Mahindra Bank
- IndusInd Bank
- Admin-added banks
- Each active bank uses its configured HTTPS referral link.
- If a referral link is not configured, the card remains visible but the Open Account action is disabled.

### Demat Account Opening
- 5paisa
- Lemonn
- Ventura
- Upstox
- Admin-added Demat partners
- Each active partner uses its configured HTTPS referral link.
- If a referral link is not configured, the Open Demat action is disabled.

## Admin
### Bank Account Opening
Admin can Add / Edit / Delete:
- Bank Name
- Account Type
- Referral Link
- Logo URL (optional)
- Active / Inactive

### Demat Partner Management
Admin can Add / Edit / Delete:
- Partner Name
- Account Type / Plan
- Referral Link
- Logo URL (optional)
- Active / Inactive

## Explicitly excluded
- Angelstore payment
- Angelstore receipt
- Angelstore approval/rejection
- Bank/Demat application status workflow
- Angelstore token generation
- Angelstore completion workflow

## Security
- Referral links are restricted to HTTPS.
- Admin CRUD endpoints require the existing Admin authentication/CSRF flow.
- Customer endpoints expose only active partner catalog records.
- Existing data file is preserved; no existing records are rewritten by this feature.

## Verification performed
- `node --check server.js` — PASS
- `node --check partner-services.js` — PASS
- Local server startup — PASS
- `GET /api/partner-banks` — PASS; Kotak Mahindra Bank and IndusInd Bank returned.
- `GET /api/demat-partners` — PASS; 5paisa, Lemonn, Ventura and Upstox returned.
- Admin catalog GET without authentication — correctly returned 401.
- Existing `data.json` restored unchanged after smoke testing.

## STEP645 FIX1 — Functional and URL-validation corrections

### Issues fixed
- Fixed customer sidebar navigation for dynamically injected Bank Account Opening and Demat Account Opening buttons. These buttons are added after the existing customer navigation binding runs, so they now explicitly call the customer page navigation handler.
- Hardened referral URL validation on the backend and frontend: referral URLs must parse as HTTPS URLs with a hostname and may not contain embedded username/password credentials or whitespace/control characters.
- Hardened logo URL/path validation: allow valid HTTPS URLs or safe root-relative paths; reject protocol-relative paths (`//...`) and backslash-based paths.
- Updated logo rendering to use the same safe URL/path rules in customer and admin views.
- Added a STEP645 regression test and `npm run step645` command.
- Bumped the partner-services script query version in both panels so browsers fetch the fixed script.

### Verification after FIX1
- `node --check server.js` — PASS
- `node --check app.js` — PASS
- `node --check partner-services.js` — PASS
- `node STEP645_PARTNER_REFERRAL_REGRESSION_TEST.js` — PASS (5 assertions)
- Isolated local API smoke — PASS: health endpoint, 2 seeded bank records, 4 seeded Demat records, unauthenticated admin endpoint returns 401, customer page served with updated script version.
- Original uploaded ZIP was not modified; tests ran from an extracted working copy and isolated temporary storage.

### Still requires configuration / live verification
- The default six partner records still have blank referral links. Real referral links must be supplied by the authorized bank/Demat partner programs; none were fabricated.
- Authenticated Add/Edit/Delete flows and full browser/device end-to-end behavior were not verified in this fix pass.
- No production deployment was performed.
