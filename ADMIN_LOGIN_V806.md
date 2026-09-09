# Admin login v806

Auth routes are dispatched through the existing `api/[action].js` catch-all:
- `/api/admin-login` -> `lib/admin-api/login.js`
- `/api/admin-session` -> `lib/admin-api/session.js`
- `/api/admin-logout` -> `lib/admin-api/logout.js`

Dedicated auth function files were removed to avoid Vercel 404/routing conflicts. `ADMIN_PASSWORD` must exist in Vercel Environment Variables. `ADMIN_SESSION_SECRET` is optional and falls back to `ADMIN_PASSWORD`.
