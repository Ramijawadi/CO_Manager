# Quick fix: MongoDB startup and login

The old Supabase schema-cache / `time_cost` column fixes no longer apply.
The application needs both its Node API and Vite frontend.

```bash
npm install
npm run configure-mongodb
npm run setup-db
npm run create-admin
npm run verify-schema
npm run dev
```

`configure-mongodb` is only necessary when converting the previous `.env` with
a commented connection string. Otherwise set `MONGODB_URI` and
`MONGODB_DB_NAME` directly using `.env.example`. Never put credentials in
`VITE_` variables.

If startup fails, check Atlas Network Access, database-user permissions,
connection-string encoding and the database name. Run setup only against the
intended application database. The admin command refuses to overwrite an
existing account.

If login fails, use the account provisioned in MongoDB, not a Supabase session.
On Vercel, deploy the included `api/index.mjs` and `vercel.json` with the
frontend, set `MONGODB_URI` and `MONGODB_DB_NAME` in the project's environment
settings, and redeploy. Check `/api/health` returns JSON, not the frontend page.
The local ignored `.env` is not deployed. Dashboard updates use 15-second
polling on Vercel; local Node hosting keeps streaming updates.
If live updates fail, verify replica-set/change-stream support and check API
logs; restart the API after resolving the cause.

For checkout issues, verify the session is active and `time_cost` is a finite,
nonnegative number. No SQL migration is required.

See [README.md](./README.md) and [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md).
