# Co-Management System

Management of customers, sessions, subscriptions, products, expenses, daily closures and
reports using React, TypeScript, Vite and MongoDB.

## Architecture

- Frontend: React 19, Ant Design, TanStack Query, Zustand, Recharts.
- Backend: a Node.js/Express API with the official MongoDB driver, running
  locally as a server or on Vercel as a cached Node.js Function.
- Authentication: MongoDB users with salted scrypt password hashes and opaque
  server-side sessions in HttpOnly, SameSite cookies. Session tokens are hashed
  in the database and expire after seven days.
- Live updates: MongoDB change streams delivered through authenticated
  server-sent events. All authenticated app views refresh their active query
  data on database changes and reconnection; the app reports a live-update
  error instead of pretending to connect. On Vercel, authenticated app views
  poll every 15 seconds instead of using permanent connections, with a distinct
  polling indicator.
- Notifications: recipient-scoped MongoDB records are the source of truth.
  Authenticated REST endpoints manage history and read state; Socket.IO delivers
  persisted changes to each recipient's private room on persistent Node hosting.
  Vercel uses REST polling unless a separate persistent Socket.IO host is configured.
- Exports: PDF through jsPDF and Excel through XLSX.

MongoDB credentials are used **only by the backend**, never by the browser.
Supabase is no longer required for data, login, roles or live updates.

## Getting started

Requires Node.js **22.12+** (or a newer supported version) and a MongoDB Atlas
cluster or replica set supporting transactions and change streams.
Allow the API server's IP in Atlas Network Access and give the database user
read/write and collection/index management permissions on the application database.

```bash
npm install
```

Create a local `.env` using `.env.example`:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.example.mongodb.net/
MONGODB_DB_NAME=co_management
PORT=3001
```

URL-encode reserved characters in the connection-string username/password.
Never use `VITE_MONGODB_URI` or commit `.env`.

For the previous local environment file that contains a **commented MongoDB
connection string**, `npm run configure-mongodb` activates it under
`MONGODB_URI`, sets the database name, and removes obsolete Supabase variables
and duplicate credential comments. It does not print credentials.

Initialize the database and provision an admin:

```bash
npm run setup-db
npm run create-admin
npm run verify-schema
npm run dev
```

The admin command prompts for an email and a password of at least ten characters.
Alternatively, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` privately in your local
process environment. The command refuses to overwrite existing accounts.
Administrators are provisioned only through this protected command; public
registration cannot assign the admin role. Employees register from the shared
login screen. Registration creates active accounts by default; set the
server-only environment variable `EMPLOYEE_APPROVAL_REQUIRED=true` to create
new accounts as pending until an administrator approves them. Set optional
`ADMIN_NAME` when provisioning to use a display name instead of the admin email.
For shared beta testing, the login screen can prefill `VITE_BETA_LOGIN_EMAIL`
and `VITE_BETA_LOGIN_PASSWORD` from local `.env`. When unset, the example
credentials are shown only as placeholders and are not submitted. Prefilled
values are public in the browser build: anyone can use the account and its
permissions. Remove both variables and rebuild before a private or production
deployment. Database credentials must still remain server-only.

Development starts the API on port 3001 and Vite together. Vite proxies `/api`
to the backend, including cookies and live events, and proxies `/socket.io` for
notification delivery. If changing the API port, also change the development
proxy targets in `vite.config.ts`.

### Notifications and real-time deployment

Run `npm run setup-db` after updating to create the validated `notifications`,
`operational_requests`, and `socket_tickets` collections and their recipient,
unread, idempotency, and ticket-expiry indexes.

The persistent Node server (`npm start`) attaches Socket.IO to the existing
Express HTTP server and watches MongoDB notification changes. It emits only
sanitized notification fields to server-derived private `user:<id>` rooms.
Socket authentication uses a one-use, 30-second ticket obtained over the
existing authenticated REST session; long-lived session cookies are never put
in a WebSocket URL. Set `APP_ORIGIN` (and, when needed, the comma-separated
`SOCKET_ALLOWED_ORIGINS`) to the exact browser origins permitted to connect.
The frontend polls notification history every 15 seconds while Socket.IO is
unavailable and refreshes from MongoDB after reconnecting.

Vercel's serverless handler does not host a persistent Socket.IO connection.
Without a socket service, keep `SOCKET_SERVER_URL` unset and notifications
continue through authenticated REST polling. To enable instant delivery on a
Vercel deployment, deploy this project's persistent Node server on a host that
supports WebSockets, point it at the same MongoDB database, and set:

- On the persistent host: `MONGODB_URI`, `MONGODB_DB_NAME`,
  `SOCKET_ALLOWED_ORIGINS=https://your-frontend.example.com`, and `APP_ORIGIN`
  to the frontend origin.
- In Vercel's API environment: `SOCKET_SERVER_URL=https://your-socket-host.example.com`.

Redeploy the Vercel frontend/API and restart the persistent host after setting
these variables. The authenticated Vercel ticket endpoint supplies the public
socket URL to the browser; the persistent server consumes the one-use ticket
and reads the same MongoDB change stream. For deployments with multiple
Socket.IO instances, configure a shared Socket.IO adapter before scaling; the
default in-memory rooms are intended for one persistent instance.

Notification endpoints include `GET /api/notifications`,
`GET /api/notifications/unread-count`, `PATCH /api/notifications/:id/action`,
`POST /api/notifications/read-all`, `POST /api/notifications/socket-ticket`,
`POST /api/admin/notifications`, `GET/POST /api/employee/requests`, and
`GET/PATCH /api/admin/requests`. All history and mutation operations are scoped
to the authenticated recipient; administrators do not gain access to employee
notification histories. Automatic notifications cover pending employee
approvals, account-status changes, admin-closed shifts, operational requests,
and admin responses. Normal shift start/end events intentionally do not generate
noise.

## Data model and behavior

The **Frais** sidebar page manages expense records with a name, category,
date, amount and optional notes. Internet, electricity, water, rent,
maintenance and supplies are suggested categories; users can enter their own.
When editing an expense, the category dropdown always shows the full list,
regardless of the saved or typed value. Select another category directly,
or type a custom category.
The table supports search, category filtering, sorting, pagination and a total
for all matching records. Admin and staff can create, edit and delete expenses;
demo accounts can only read them. Expenses do not change revenue reports or
daily closures.

### Gestion des chambres

The authenticated **Gestion des chambres** page manages rooms, tenant rentals,
and separate water/electricity bills. Run `npm run setup-db` once after updating
to create the validated `rooms`, `room_rentals`, and `utility_payments`
collections and indexes. Setup idempotently initializes **Chambre 01** through
**Chambre 14** without replacing existing rooms or records.

Room availability and occupancy statistics are derived from rental records.
Rental date ranges are validated on the API, and MongoDB transactions lock a
room while checking for overlapping rentals. Creating a rental also creates
unpaid water and electricity records for its entry month. Further bills are
tracked independently by rental, utility type, and billing month; payment
amounts are stored in integer millimes. Paid bills require a payment date.
Room, rental, and utility deletion is implemented as archiving so the rental
and payment history remains in MongoDB. Admin and staff accounts can manage
these records; demo accounts remain read-only.

The API uses the existing authenticated collection endpoints:
`/api/rooms`, `/api/room_rentals`, and `/api/utility_payments` (GET, POST,
PATCH by ID, and DELETE by ID; DELETE archives these records). No new
environment variables or additional database are required. For local setup,
run `npm run setup-db` followed by `npm run dev`; verify with `npm test` and
`npm run build`. Deploy using the existing deployment workflow after applying
the same repeatable `npm run setup-db` initialization against the configured
MongoDB database.

Expense `amount` is stored and exchanged by the API in integer millimes
(1500 = 1.500 DT), with positive amounts and up to three decimal places in
the form. Run `npm run setup-db` once after this update to create the
`expenses` collection, validator and date index without replacing existing
business records.

### Monthly and yearly financial statistics

**Rapports > Bilan financier** (admin only) compares income, expenses and net
profit/loss for any selected month or year, including a 12-month annual
breakdown and Excel export. Empty months remain visible. Results use the
Tunisia calendar (Africa/Tunis, UTC+1):

- Completed session time charges count on checkout (`exit_time`), not arrival.
- Product sales count on the consumption record's `created_at`.
- Subscription income counts only actual payments recorded under
  **Abonnements > Paiements**, on their `payment_date`.
- Expenses count on `expense_date`.
- Net result = all three income sources minus expenses. Daily closure archives
  are never added again, avoiding double-counting.

Payment management supports separate installments, edits and deletion of
mistaken entries, with a stored amount in integer millimes. Customer and plan
names are saved with each payment; cancellation or deletion of a subscription
does not erase its payments or change its recorded amounts. Deleting a customer
also retains payments. Historical subscriptions are not automatically marked
paid: enter their actual payment dates/amounts before relying on past balances.
Session and product income assumes recorded charges/sales were collected;
there is no session debt, refund, tax or depreciation tracking. These are
operational profit/loss statistics, not a complete accounting ledger.

After updating, run `npm run setup-db` once to create validated
`subscription_payments` storage and the reporting indexes. Existing business
records are not replaced.

Expanded session consumption tables keep their headers fixed while product rows
scroll, with five products per page. The sessions area also scrolls so expanded
panels and pagination remain accessible on smaller screens.

Setup creates validated collections, unique UUID indexes, query indexes, a
singleton hourly-rate setting (1 DT), and default plans:
Hebdomadaire (7 days, 25 DT), Mensuel (30 days, 80 DT).
Setup is repeatable and does not replace existing passwords or business records.
It reapplies missing default plans; do not use it as a routine server startup task.

Employee accounts use the `employee` role; existing `staff` accounts remain
valid and retain their established operational access. Existing accounts
without a status are treated as active and are not rewritten. Employee shifts
are stored separately in `work_sessions` (not the customer `sessions`
collection), with a partial unique index preventing multiple active shifts
per employee. Administrators can approve/disable employee accounts, inspect
shift history, and close a shift only with a required reason recorded in
`admin_audit_logs`. Shift-start retries use request IDs, and shift-end retries
are idempotent. Run `npm run setup-db` after updating to safely create the
new validated collections and indexes without deleting existing records.
Reports and platform settings remain administrator-only; employee access to
existing operational modules is preserved.

Public document IDs remain UUID strings so subscription forms and existing
frontend contracts continue to work. Referenced customers, catalog products,
plans and subscriptions can be queried independently. Session product records
remain separate because consumption has no fixed bound and is also queried
independently for sales analytics; joined API responses retain `customers`,
`plans`, `session_products` and `products` fields expected by the UI.

Product `price` and session-product `total_price` are stored and exchanged by
the API in millimes (1500 = 1.500 DT). Frontend feature APIs convert them to
dinars for forms, checkout, dashboard calculations and report exports, and
convert product writes back to integer millimes. Product displays use
`1dt.500`; enter `1.500` in the product form's DT field. Time charges, subscription
prices and daily-closure totals remain in dinars. Existing archived daily
closures are not automatically recalculated.

API writes enforce strict input schemas, finite nonnegative money values,
integer quantities, existing referenced records and date ranges. Multi-document
writes use transactions. Customer/session/product deletion preserves the former
cascade behavior; deleting a plan sets affected subscriptions' `plan_id` to null.
Daily closures are upserted by date. Demo accounts are read-only on the server;
admin and staff/employee accounts retain the existing business write permissions.

**This migration starts fresh.** It does not copy Supabase records or passwords,
and it does not delete or alter the old Supabase project. Legacy SQL files are
historical references, not MongoDB setup instructions.

## Scripts and validation

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start backend and frontend together |
| `npm run dev:api` | Watch the API server |
| `npm run dev:web` | Start Vite only |
| `npm run setup-db` | Initialize collections, validators, indexes and defaults |
| `npm run create-admin` | Create an admin with a hashed password |
| `npm run verify-schema` | Read-only collection, index and admin verification |
| `npm test` | Offline backend and subscription regression tests |
| `npm run build` | Type-check and build the frontend |
| `npm start` | Run the API and serve the existing production build |
| `npm run lint` | Run repository ESLint checks |

With a running API and private `ADMIN_EMAIL` / `ADMIN_PASSWORD` variables,
`node test_login.js` verifies admin login and revokes the test session.
An optional end-to-end test, `tests/mongodb-live.test.mjs`, runs only with
`RUN_MONGODB_LIVE_TESTS=1`; it creates uniquely named temporary records and
removes only those records in cleanup.

## Localization

The interface uses `i18next` with `react-i18next`. French remains the default;
the selected French or Arabic language is saved in local storage. Add Arabic
translations in `src/i18n.ts` and wrap new user-facing text in `t(...)`.
Compact FR / AR buttons on the login screen and app header switch languages
directly, with the current language highlighted.
Standard subscription plan names are translated at display time using
`src/features/plans/labels.ts` in subscriptions, payments, and settings.
Stored names and IDs remain unchanged; custom names without a translation keep
their original text. Add translations for custom names in `src/i18n.ts`.
Arabic switches the document and Ant Design to right-to-left layout and updates
the Ant Design and Day.js locales.

## Deployment

### Vercel (frontend and API together)

`vercel.json` builds the Vite frontend into `dist` and routes all `/api/*`
requests to `api/index.mjs` **before** the SPA fallback. The function restores
the API route and query string, reuses a cached Express app and MongoClient
across warm invocations, and never starts a listener or background change stream.
Static assets are served by Vercel; frontend routes fall back to `index.html`.
The adapter clears Vercel's pre-parsed query so Express validates the restored
query string without the internal `__path` rewrite parameter. If a dashboard or
filtered list returns JSON 400 mentioning `Unrecognized key: "__path"`, redeploy
with the updated adapter; keep strict API validation enabled.

1. Import the repository with the project root set to this directory. Use the
   Vite preset, `npm run build`, and output directory `dist` (configured in
   `vercel.json`). Select Node.js 22.x or a newer supported Node.js version.
2. In **Project Settings > Environment Variables**, add `MONGODB_URI` and
   `MONGODB_DB_NAME=co_management` for Production and any Preview environments
   you use. Local `.env` is ignored by Git and is **not deployed**. Paste the URI
   as its actual value, without surrounding quotes or a `MONGODB_URI=` prefix.
   Set `VITE_API_URL=/api` as well. All frontend requests, including local live
   events, use this same-origin base (also the default when unset). Absolute URLs
   and other bases are rejected to prevent production requests to a development
   server. Local development still uses Vite's `/api` proxy to port 3001.
   Vite embeds this public setting at build time, so redeploy after changing it.
3. Ensure Atlas permits network connections from your Vercel deployment.
   Prefer static egress/secure networking and a restricted Atlas access list.
   Use a least-privilege database user; never expose its credentials via `VITE_`.
4. The database must already be initialized and contain the admin. The existing
   local setup is sufficient if Vercel points to the same cluster/database.
   For a different database, run setup and admin provisioning locally against
   that database first. Do not run setup or create accounts on each invocation.
5. `APP_ORIGIN` is optional: by default the function uses the request's public
   host and trusted proxy protocol, so custom domains and Preview URLs work.
   If set, it must exactly match the HTTPS origin used by testers, with no
   trailing slash. A production-only origin on Preview will block its login.
   Secure, HttpOnly cookies are enabled for Vercel.
6. For beta prefilled login only, set `VITE_BETA_LOGIN_EMAIL` and
   `VITE_BETA_LOGIN_PASSWORD` in Vercel as well. These are public build values,
   **not database credentials**. Every tester shares that account's permissions.
7. Redeploy after saving environment variables or deployment configuration.
   Open `https://your-deployment/api/health`; expect JSON `{"status":"ok"}`.
   `/api/auth/session` should return JSON 401 before login, not frontend HTML.
   Then test login and a direct frontend route such as `/settings`.

Missing or malformed database environment variables return a specific JSON 503
message and `DatabaseConfigError` in the function logs, without exposing their
values. Correct the named setting for the deployment's environment and redeploy.
Other initialization failures retain a generic response; inspect the function's
error name and code for authentication or Atlas connectivity failures.

Dashboard polling does not require MongoDB change streams on Vercel; writes
still require transaction/replica-set support. Polling failures are indicated
as errors rather than a successful live connection. Login attempt counters
are per warm function instance; use Vercel Firewall rate limits for
deployment-wide login protection. Monitor Atlas Connections, connection
checkout failures and cold-start latency before adjusting the default pool:
each warm function instance owns its own MongoClient/pools.

### Traditional Node hosting

Build with `npm run build`, then run `npm start` on a Node-capable host.
Set the server-only MongoDB variables, the host's `PORT`,
`NODE_ENV=production`, and `APP_ORIGIN=https://your-public-host`.
Production requires HTTPS because authentication cookies are Secure.
Keep the frontend and API on the same public origin. A static-only frontend
deployment is no longer sufficient; the host/proxy must support long-lived SSE
connections without buffering. Atlas change streams propagate updates across
multiple API instances.

The backend reuses one MongoClient and the driver's default pool settings.
No custom pool sizes or timeouts are assumed without workload measurements.
Monitor Atlas Connections, connection churn, API latency, and driver
`connectionCheckOutFailed` / `connectionCreated` events before tuning pool
settings; account for each API instance's pools and replica-set monitoring
connections. Restart the API if its change stream reports a terminal error.

## Troubleshooting

- **Login or database unavailable:** ensure the API is running, `.env` has the
  server-only MongoDB variables, Atlas permits the server IP, and the database
  user has the required permissions.
- **No admin / missing settings:** run setup and admin provisioning, then verify
  the schema. A database name typo points to a different, empty database.
- **Invalid subscription plan:** reload plans and select a saved UUID-backed
  plan. Failed reads/writes are surfaced; local placeholder plans are not used.
- **Live updates unavailable:** check replica-set/change-stream support and the
  API logs, then restart the API. A reconnect refreshes active app data.
- **Session checkout:** `time_cost` starts as null and is stored as a finite,
  nonnegative number when a session completes. No SQL column migration is needed.

See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) and [QUICK_FIX.md](./QUICK_FIX.md)
for the new setup and troubleshooting workflow.

## Project structure

- `server/`: connection reuse, schema setup, API validation, auth and live updates.
- `api/`: Vercel Function entrypoint (the shared Express API).
- `vercel.json`: API routing, static assets and SPA fallback for Vercel.
- `src/lib/`: HTTP and authentication clients.
- `src/features/`: customers, sessions, plans, subscriptions, products, analytics.
- `src/pages/`, `src/components/`, `src/hooks/`, `src/store/`: frontend UI/state.
- `tests/`: offline regression coverage and opt-in live workflow coverage.
- `migrations/` and SQL files: archived Supabase schema/migrations.

This project is private and proprietary.
