# Angelstore CSC — STEP331 Backend/API/Database/Security Fix Report

## Scope
Fixes applied to the STEP330 project after backend/API/database/security audit. No customer cart/order functionality was added.

## P1 fixes

### 1. Payment proof filename compatibility
- New payment proof uploads now use `crypto.randomUUID()` filenames.
- Retrieval, integrity checks, backup, storage counts and restore accept both the new UUID format and the legacy 36-hex-character format.
- This preserves existing legacy proofs while fixing the mismatch between upload and proof/backup validators.
- Payment records now use the canonical `proof_sha256` field consistently; `screenshot_sha256` is retained for compatibility.

### 2. OCR execution
- Added the missing `child_process` import.
- Image documents now execute the existing Tesseract command when Tesseract is installed.
- OCR text is stored with `ocr_status` and `ocr_text`.
- Verified with a real PNG test: `ocr_status=completed`, extracted text returned.

### 3. Backup authentication-session sanitization
- Backup database snapshots no longer contain active `admin_sessions`, `staff_sessions`, or `customer_sessions`.
- Backups are marked with `meta.backup_sanitized=true`.
- Restore already clears active sessions again after loading a backup.
- Credential hashes are intentionally retained because they are required for an operational restore; they are not plaintext passwords.

### 4. Cross-process JSON write protection
- Added an inter-process lock file around database writes.
- Added an optimistic `meta.write_revision` check.
- A stale process now refuses to overwrite a newer database revision instead of silently losing the newer write.
- Successful saves increment the revision and record `last_saved_at`.
- This is a lost-write protection layer; it is not a replacement for a transactional relational database.

### 5. Database integrity improvements
- Payment proof integrity checks now use either `proof_sha256` or legacy `screenshot_sha256`.
- Existing document checksum validation remains enabled.
- Backup/restore proof validation now uses the same compatibility rule as normal storage.

## Verification

- `node --check server.js` — PASS
- `node --check storage.js` — PASS
- `npm run check` — PASS
- `npm run release-audit` — PASS
- Cross-process write test — PASS: one writer succeeds and the stale writer is rejected with a revision conflict; no silent overwrite occurs.
- OCR end-to-end test — PASS: real Tesseract 5.5.0 executed and returned OCR text.
- New payment proof upload test — PASS: UUID filename created and stored.
- Backup sanitization test — PASS: active admin/staff/customer sessions absent from backup snapshot.

## Remaining architectural work

1. Move from JSON storage to a transactional relational database for true multi-process transactions and foreign keys.
2. Use shared/distributed rate limiting for multi-instance deployments.
3. Move browser session tokens to secure HttpOnly/Secure/SameSite cookies.
4. Encrypt sensitive backup archives at rest/off-site with a separately managed encryption key.
5. Add field-level financial ledger transactions and reconciliation.

## Important limitation
The new JSON revision/lock layer prevents silent concurrent overwrites, but it does not provide database transactions, row locks, foreign keys, or automatic merge/retry semantics. A real relational database remains the correct production-scale architecture.
