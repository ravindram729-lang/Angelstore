# Admin Login Root-Cause Fix — STEP342 → STEP343

## Audit
- `admin.html` sends `POST /api/auth/login`.
- `server.js` validates the username/password against the hashed `admin_credentials[0]` record before creating the admin session.
- The supplied STEP342 `data.json` contained an `admin_credentials` hash that did not match the local password values documented/used by the project, so the observed `Invalid username or password` was a credential-store mismatch.

## Small root-cause fix
- Replaced only the local `admin_credentials` record with a fresh scrypt hash using the exact parameters used by `server.js` (`N=16384, r=8, p=1`).
- Revoked stale `admin_sessions`.
- No token, payment, customer, document, queue, language-switch, or UI business logic was changed.

## Verification
- `node --check server.js` PASS
- `node --check app.js` PASS
- Node hash compatibility check PASS
- Isolated `POST /api/auth/login` smoke test PASS (HTTP 200)
