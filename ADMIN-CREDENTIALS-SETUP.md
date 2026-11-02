# Admin Credentials Setup

Local development admin credentials use the account `ravindram143`.

- The local development password is stored only as an scrypt salt + hash in the local bootstrap path.
- Plaintext password is not written to `data.json` or release documentation.
- Production deployments must use `ANGELSTORE_ADMIN_USER` and `ANGELSTORE_ADMIN_PASS` environment variables.
- Production rejects known/default passwords and requires a password of at least 12 characters.
