# Create Superuser (Super Admin)

## Quick start

From the **repo root**, with **venv activated** and **`DATABASE_URL`** set in `.env`:

```bash
# Interactive (prompts for everything)
python scripts/create_superuser.py

# Non-interactive (CI / one-liner)
python scripts/create_superuser.py --email you@example.com --password YourPass@123 --name "Your Name" --company "Your Agency"
```

## What the script does

1. **Auto-repairs schema** — adds any columns the ORM expects but the DB is missing (`clients.account_mode`, `agencies.credits`, `users.last_login_at`, etc.). Safe to run repeatedly.
2. **New email** — inserts `User` with `is_superuser=True`, bcrypt-hashed password, then creates an **Agency** (`agency_admin` membership) and a **Default Brand** client.
3. **Existing email** — offers to promote to superuser, optionally reset password, and creates agency/client only if missing.

## After running

1. Start the portal: `pnpm run dev` in `apps/agency-portal`.
2. Open `/login`, sign in with the email and password you chose.
3. **Admin** link appears in the sidebar (superuser-only).

## Admin invites & Resend (magic link email)

- **`GET /admin/invites` returning 500** is almost always a **missing `magic_tokens` table**, not Resend. Restart the API after pulling latest code: the gateway auto-creates this table on first admin invite/list call. Or run `python scripts/create_superuser.py` once (it also ensures `magic_tokens`).
- **`RESEND_API_KEY`** (in repo root `.env`, same file the Python services load) is only needed to **deliver** the email. Without it, invites are still **saved** in the DB; the API response includes `invite_link` — copy it from server logs or network response and open it in a browser.
- **`FRONTEND_URL`** must match your portal origin (e.g. `http://localhost:3000`) so links point at the right host. Optional: **`MAGIC_LINK_PATH`** (default `/verify`) if your verify route path changes.

### Resend setup (short)

1. Create an API key at [resend.com](https://resend.com).
2. Add to `.env`: `RESEND_API_KEY=re_...`
3. Use a **verified domain** (or Resend’s test sender) and update `from` in `services/admin_service/email.py` if it is not your domain.
4. Restart **uvicorn** (API gateway) so the env var loads.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Script hangs | A stale DB connection holds a lock. Restart PostgreSQL or run: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle in transaction';` |
| `DATABASE_URL` not found | Ensure `.env` exists at the repo root with a valid `DATABASE_URL` |
| Password rejected at login | Re-run the script with the same email — it will offer to set a new password |
| No **Admin** in sidebar | Sign out and sign in again (stale session) |
| **500 on `/admin/invites`** | Missing `magic_tokens` — restart API after update or run `create_superuser.py` |
