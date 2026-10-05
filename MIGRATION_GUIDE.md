# Supabase to MongoDB migration

The application now uses a server-side MongoDB API for all business data,
authentication, roles and live updates. This is a **fresh database setup**;
existing Supabase records and passwords were intentionally not imported.
The old Supabase project is untouched.

1. Install dependencies with `npm install`.
2. Configure `MONGODB_URI` and `MONGODB_DB_NAME` in local `.env`.
   Never expose these through Vite-prefixed variables.
3. If the URI is already commented in the previous environment file, run
   `npm run configure-mongodb` to activate it and remove obsolete Supabase keys.
   The database name defaults to the URI's database or `co_management`.
4. Allow the API server's IP in Atlas and ensure the database user has schema,
   index and read/write permissions. A replica set is required for transactions
   and change streams.
5. Run `npm run setup-db` to create collections, validators, indexes, default
   plans and hourly-rate settings. It does not erase business records.
6. Run `npm run create-admin` to provision a new login. It refuses to overwrite
   existing users. Supabase authentication sessions are not transferable.
7. Run `npm run verify-schema`, `npm test` and `npm run build`.
8. Start both servers using `npm run dev`; sign in using the provisioned account.

The former login defaults can be used only if you explicitly choose them when
provisioning. Shared beta testing can prefill a provisioned account through
`VITE_BETA_LOGIN_EMAIL` and `VITE_BETA_LOGIN_PASSWORD` in local `.env`.
These login values are public in the browser; all testers share the account's
permissions. Remove both variables and rebuild before a private or production
deployment, and use a new strong password.

UUID-based public IDs, subscription dates, join-shaped API responses, daily
closure upserts and deletion cascades are preserved. Plan deletion leaves
subscriptions with a null plan reference; editing requires selecting a saved
plan again.

For Vercel, deploy the frontend with the included `api/index.mjs` function and
`vercel.json` routing. Add `MONGODB_URI` and `MONGODB_DB_NAME` in the Vercel
project's environment settings and redeploy; the ignored local `.env` is not
uploaded. Vercel uses 15-second dashboard polling rather than a permanent change
stream. `APP_ORIGIN` is optional; if set, it must match the exact public HTTPS
origin, including the correct Preview domain. Keep the frontend and API on the
same origin. See the Vercel checklist in [README.md](./README.md).

For traditional Node hosting, deploy the Node API and built frontend together,
set `NODE_ENV=production` and the HTTPS `APP_ORIGIN`, and run `npm start`.
A static-only deployment without an API function cannot run database login.

SQL files and the old `time_cost` migrations are archived historical references.
Do not run them for the MongoDB application. Checkout now validates and stores
`time_cost` directly through the API.

See [README.md](./README.md) for environment configuration, deployment,
connection monitoring and test commands.
