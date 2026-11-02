# AngelStore CSC — Complete Audit & Fix Report

## Scope audited
- Customer service/sub-category selection
- 106 sub-services across 24 categories
- Service charge calculation and Admin charge overrides
- UPI payment + UTR + screenshot workflow
- Admin payment verification/rejection
- Verified-payment → Live Token gate
- Customer records/history
- Admin authentication and authorization
- Data exposure through static files
- Payment proof storage
- Token queue and duplicate-token protection
- Reports, offers, settings, notifications and application APIs
- Local Windows launcher flow

## Important missing/weak areas found
1. Customer payment proof was stored/exposed in a way that could become publicly reachable.
2. `data.json` was directly servable by the HTTP server, exposing customer/payment data.
3. Payment-proof files were publicly addressable instead of being protected by Admin authentication.
4. Customer record APIs could be queried using only a mobile number.
5. Customer token APIs exposed more customer information than required for a public queue.
6. Customer-side local fallback could bypass the real server workflow and could not reliably perform Admin verification.
7. Payment retries could create duplicate application records.
8. Admin verification depended too much on client-side UI state.
9. Service API returned an empty service list even though the catalog contained 106 sub-services.
10. Report generation used stale browser-local token data instead of the server dataset.
11. Reports had an empty daily dataset and a weak popular-service calculation.
12. Notifications were readable without Admin authentication.
13. Settings were readable without Admin authentication.
14. Several validation rules were client-side only.
15. Default authentication credentials were documented but needed a clear production warning and environment override.

## Fixes implemented
- Protected `data.json`, `.env` and `/uploads/*` from static serving.
- Added protected Admin-only payment-proof endpoint.
- Payment proof now has server-side file-content validation (PNG/JPEG/WEBP magic bytes) and 5 MB limit.
- Added server-side `proof_viewed_at` gate: Admin must open the proof before payment verification can be completed.
- Added signed, expiring Admin sessions and login rate limiting.
- Added signed Customer session tied to customer name/mobile/application.
- Customer payment/status/records/token APIs now require the Customer session where private data is involved.
- Public token queue returns only the fields required for queue display.
- Server validates all 106 catalog sub-services and recalculates the payable amount.
- Admin charge overrides are persisted and used in customer payment validation.
- Duplicate UTR protection is server-side.
- Duplicate token per payment protection is server-side.
- Customer payment requires a valid application and matching customer/service.
- Payment verification updates application status and audit log.
- Rejection reason is persisted.
- Added secure proof viewing and audit logging.
- `/api/services` now returns the actual catalog instead of an empty array.
- Reports support date filtering, daily counts, revenue and popular service.
- CSV report is generated from server data and requires Admin authentication.
- Notifications/settings are Admin-protected.
- Customer frontend no longer uses the insecure local-browser payment/token fallback.
- Customer payment retry reuses the current application/session instead of creating unnecessary duplicates.
- Admin receipt uses the actual payment service/customer data.

## Verified test results
- Service catalog: **106 sub-services / 24 categories**.
- Generated default charge rows: **106**.
- Server-side payable amount validation: passed.
- Duplicate UTR rejection: implemented server-side.
- Payment screenshot storage: passed.
- Direct `/data.json` access: blocked.
- Direct `/uploads/...` access: blocked.
- Unauthenticated payment-proof access: blocked.
- Unauthenticated customer-record access: blocked.
- Verified payment is required before token generation.
- One payment can generate only one token.

## Production limitation
Automatic UPI/bank verification is **not** implemented because it requires a real payment/bank provider API and credentials. The current workflow is intentionally manual: Admin opens the screenshot, checks the UTR against the actual transaction source, and then clicks Verify.

For public production deployment, also use HTTPS, a real database (PostgreSQL/MySQL), strong environment secrets, backups, server-side logging/monitoring, and a real OTP/customer authentication provider.

## Customer Panel Re-audit (2026-09-06)
- Fixed duplicate JavaScript declarations in customer.html that caused a fatal SyntaxError.
- Customer script syntax: PASS.
- Server syntax: PASS.
- Local customer page HTTP response: 200.
- Local backend health: PASS.
