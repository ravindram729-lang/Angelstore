# Admin Panel STEP330 — Priority Fix Report

Date: 2026-09-24

## Scope
Fixed the P1 Admin Panel issues identified in the end-to-end audit. Cart/Order functionality was not added.

## Fixes

1. **Token “अगला बुलाएँ”**
   - Admin can call the next oldest pending token without first selecting a token ID.
   - Existing active-token protection remains enforced.

2. **Dashboard period correctness**
   - Dashboard request/customer/completion figures now use today's token date instead of all historical tokens.
   - Live queue rendering still uses the full queue.

3. **Manual UPI/Bank payment workflow**
   - Manual payment entry now requires a service.
   - UPI/Bank entries require a payment screenshot/proof.
   - PNG/JPEG/WEBP proof is validated and stored using the existing secure image pipeline.
   - Payment records retain proof URL and SHA-256.
   - Service is retained on manual payments so a verified payment can correctly gate token generation.

4. **Payment filters**
   - All / UPI / Cash buttons now actually filter the payment table.

5. **Reports CSV date range**
   - CSV download now receives the selected From/To dates.
   - Backend filters the exported token rows using the same range logic as the report UI.

6. **Customer Management**
   - Admin customer list now starts from canonical `db.customers` records and merges payment/token activity.
   - Service count is based on unique services rather than counting payment + token rows as separate services.

7. **Monitoring Persistence display**
   - Admin Monitoring now displays the real persistence configuration value instead of always showing “Configured”.

## Verification

- `npm run check` — PASS
- `node FINAL-RELEASE-AUDIT.js` — PASS (`ok: true`)
- Admin login against isolated test storage — PASS
- Manual cash payment + service linkage — PASS
- Verified payment → token issue — PASS
- “Next” with no selected token → oldest pending token called — PASS
- Manual UPI payment with proof → proof stored — PASS
- Protected payment proof endpoint — PASS
- Verify before proof viewed — BLOCKED as intended
- Proof viewed → Verify — PASS
- CSV report with date range — PASS
- Test storage was isolated and not used for the project data

## Remaining Admin work

The following were not part of this P1 fix batch and remain for later priority work:

- Dynamic Service Detail/sub-service navigation
- SOP version history
- Structured rejection modal
- Receipt Save/Print naming cleanup
- Persistent branding settings
- Finance correction/reversal workflows
- Home Service/Delivery completion proof
- HttpOnly cookie migration
- Unified error UI
- Admin realtime updates
- Full browser E2E suite
