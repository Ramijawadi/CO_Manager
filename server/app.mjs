import express from 'express';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z, ZodError } from 'zod';
import { schemas, loginSchema, idSchema, validateDates } from './validation.mjs';
import {
  COOKIE_NAME, SESSION_DURATION, cookieOptions, newToken, readToken,
  tokenHash, publicUser, verifyPassword, hashPassword,
} from './auth.mjs';

const projection = { _id: 0, singleton: 0, _reference_version: 0 };
const notFound = () => Object.assign(new Error('Record not found.'), { status: 404 });
const badRequest = message => Object.assign(new Error(message), { status: 400 });
const querySchema = z.object({
  status: z.enum(['active', 'completed', 'cancelled', 'expired']).optional(),
  customer_id: idSchema.optional(),
  since: z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString()).optional(),
  start: z.iso.date().optional(), end: z.iso.date().optional(),
  active_on: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict();

export async function joinRows(db, table, rows) {
  const ids = field => [...new Set(rows.map(row => row[field]).filter(Boolean))];
  const lookup = async (collection, values) => {
    if (!values.length) return new Map();
    const documents = await db.collection(collection).find({ id: { $in: values } }, { projection }).toArray();
    return new Map(documents.map(document => [document.id, document]));
  };
  if (table === 'sessions') {
    const [customers, items] = await Promise.all([
      lookup('customers', ids('customer_id')),
      db.collection('session_products').find({ session_id: { $in: ids('id') } }, { projection }).toArray(),
    ]);
    const joinedItems = await joinRows(db, 'session_products', items);
    const bySession = new Map();
    for (const item of joinedItems) {
      const list = bySession.get(item.session_id) || [];
      list.push(item);
      bySession.set(item.session_id, list);
    }
    return rows.map(row => ({ ...row, customers: customers.get(row.customer_id) || null,
      session_products: bySession.get(row.id) || [] }));
  }
  if (table === 'session_products') {
    const products = await lookup('products', ids('product_id'));
    return rows.map(row => ({ ...row, products: products.get(row.product_id) || null }));
  }
  if (table === 'subscriptions') {
    const [customers, plans] = await Promise.all([
      lookup('customers', ids('customer_id')), lookup('plans', ids('plan_id')),
    ]);
    return rows.map(row => ({ ...row, customers: customers.get(row.customer_id) || null,
      plans: plans.get(row.plan_id) || null }));
  }
  return rows;
}

async function checkReferences(db, table, document, session) {
  const references = {
    sessions: [['customers', 'customer_id']],
    session_products: [['sessions', 'session_id'], ['products', 'product_id']],
    subscriptions: [['customers', 'customer_id'], ['plans', 'plan_id']],
  }[table] || [];
  for (const [collection, field] of references) {
    if (document[field] === null && field === 'plan_id') continue;
    // A write lock makes concurrent parent deletion conflict and retry the transaction.
    const parent = await db.collection(collection).findOneAndUpdate(
      { id: document[field] }, { $inc: { _reference_version: 1 } }, { session, returnDocument: 'after' },
    );
    if (!parent) throw badRequest(`The referenced ${collection} record does not exist.`);
    if (table === 'session_products' && collection === 'sessions' && parent.status !== 'active') {
      throw badRequest('Products can only be added to active sessions.');
    }
  }
}

async function deleteRecord(db, table, id, session) {
  const record = await db.collection(table).findOne({ id }, { session });
  if (!record) throw notFound();
  if (table === 'customers') {
    const sessions = await db.collection('sessions').find({ customer_id: id }, { session }).toArray();
    await db.collection('session_products').deleteMany({ session_id: { $in: sessions.map(row => row.id) } }, { session });
    await db.collection('sessions').deleteMany({ customer_id: id }, { session });
    await db.collection('subscriptions').deleteMany({ customer_id: id }, { session });
  }
  if (table === 'sessions') await db.collection('session_products').deleteMany({ session_id: id }, { session });
  if (table === 'products') await db.collection('session_products').deleteMany({ product_id: id }, { session });
  if (table === 'plans') await db.collection('subscriptions').updateMany(
    { plan_id: id }, { $set: { plan_id: null, updated_at: new Date().toISOString() } }, { session },
  );
  await db.collection(table).deleteOne({ id }, { session });
}

export async function createApp({ db, client, events, realtimeReady = () => true }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      const expected = process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`;
      if (origin && origin !== expected) return res.status(403).json({ message: 'Cross-origin requests are not allowed.' });
      if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ message: 'Cross-site requests are not allowed.' });
    }
    next();
  });
  app.get('/api/health', async (_req, res) => {
    await db.command({ ping: 1 });
    res.json({ status: 'ok' });
  });

  const dummyHash = await hashPassword(newToken());
  const loginAttempts = new Map();
  const attemptCleanup = setInterval(() => {
    for (const [key, value] of loginAttempts) if (value.until <= Date.now()) loginAttempts.delete(key);
  }, 60_000);
  attemptCleanup.unref();
  app.on('close', () => clearInterval(attemptCleanup));

  app.post('/api/auth/login', async (req, res) => {
    const credentials = loginSchema.parse(req.body);
    const key = req.ip;
    const now = Date.now();
    let attempts = loginAttempts.get(key);
    if (!attempts || attempts.until <= now) {
      attempts = { count: 0, until: now + 15 * 60 * 1000 };
      loginAttempts.set(key, attempts);
    }
    if (++attempts.count > 20) return res.status(429).json({ message: 'Too many login attempts. Try again in 15 minutes.' });
    const user = await db.collection('users').findOne({ email: credentials.email.toLowerCase() });
    const matches = await verifyPassword(credentials.password, user?.password_hash || dummyHash);
    if (!user || !matches) return res.status(401).json({ message: 'Invalid email or password.' });
    loginAttempts.delete(key);
    const token = newToken();
    await db.collection('auth_sessions').insertOne({
      id: randomUUID(), token_hash: tokenHash(token), user_id: user.id,
      expires_at: new Date(now + SESSION_DURATION),
    });
    res.cookie(COOKIE_NAME, token, cookieOptions());
    res.json({ user: publicUser(user) });
  });

  const authenticate = async (req, res, next) => {
    const token = readToken(req);
    if (!token) return res.status(401).json({ message: 'Please sign in.' });
    const session = await db.collection('auth_sessions').findOne({
      token_hash: tokenHash(token), expires_at: { $gt: new Date() },
    });
    const user = session && await db.collection('users').findOne({ id: session.user_id });
    if (!user) return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
    req.user = publicUser(user);
    req.authSession = session;
    next();
  };
  app.use('/api', authenticate);
  app.get('/api/auth/session', (req, res) => res.json({ user: req.user }));
  app.post('/api/auth/logout', async (req, res) => {
    await db.collection('auth_sessions').deleteOne({ id: req.authSession.id });
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
    res.status(204).end();
  });

  app.get('/api/events', (req, res) => {
    if (!realtimeReady()) return res.status(503).json({ message: 'Live updates are unavailable.' });
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    res.write('event: ready\ndata: {}\n\n');
    const listener = table => res.write(`data: ${JSON.stringify({ table })}\n\n`);
    events.on('change', listener);
    const heartbeat = setInterval(async () => {
      try {
        const session = await db.collection('auth_sessions').findOne({
          id: req.authSession.id, expires_at: { $gt: new Date() },
        });
        if (!session || !realtimeReady()) return res.end();
        res.write(': heartbeat\n\n');
      } catch (error) {
        console.error(`Live session verification failed (${error.name}).`);
        res.end();
      }
    }, 30_000);
    req.on('close', () => { clearInterval(heartbeat); events.off('change', listener); });
  });

  app.get('/api/dashboard/data', async (req, res) => {
    const { since, active_on } = querySchema.pick({ since: true, active_on: true }).required().parse(req.query);
    const [sessions, items, subscriptions] = await Promise.all([
      db.collection('sessions').find({ entry_time: { $gte: since } }, { projection }).toArray(),
      db.collection('session_products').find({ created_at: { $gte: since } }, { projection }).toArray(),
      db.collection('subscriptions').countDocuments({
        status: 'active', start_date: { $lte: active_on }, end_date: { $gte: active_on },
      }),
    ]);
    const activeSessions = await db.collection('sessions').countDocuments({ status: 'active' });
    res.json({ sessions, session_products: items, activeSubscriptions: subscriptions, activeSessions });
  });

  app.get('/api/:table', async (req, res) => {
    const { table } = req.params;
    if (!Object.hasOwn(schemas, table)) throw notFound();
    const query = querySchema.parse(req.query);
    const filter = {};
    if (query.status) filter.status = query.status;
    if (query.customer_id) filter.customer_id = query.customer_id;
    if (query.since) filter[table === 'sessions' ? 'entry_time' : 'created_at'] = { $gte: query.since };
    if (query.start || query.end) {
      if (table !== 'sessions') throw badRequest('Date ranges are only supported for session reports.');
      if (query.start && query.end && query.start > query.end) throw badRequest('Report end date must be on or after its start date.');
      filter.entry_time = {
        ...(query.start ? { $gte: `${query.start}T00:00:00.000Z` } : {}),
        ...(query.end ? { $lt: new Date(Date.parse(`${query.end}T00:00:00Z`) + 86400000).toISOString() } : {}),
      };
    }
    if (query.active_on) {
      if (table !== 'subscriptions') throw badRequest('active_on is only supported for subscriptions.');
      filter.start_date = { $lte: query.active_on };
      filter.end_date = { $gte: query.active_on };
    }
    const sort = table === 'products' ? { name: 1 } : table === 'plans' ? { price: 1 }
      : table === 'daily_closures' ? { closure_date: -1 } : table === 'sessions' ? { entry_time: -1 } : { created_at: -1 };
    let cursor = db.collection(table).find(filter, { projection }).sort(sort);
    if (query.limit) cursor = cursor.limit(query.limit);
    const rows = await cursor.toArray();
    if (table === 'settings' && !rows.length) {
      throw Object.assign(new Error('Database settings are missing. Run npm run setup-db.'), { status: 503 });
    }
    res.json(await joinRows(db, table, rows));
  });

  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) && req.user.role === 'demo') {
      return res.status(403).json({ message: 'Demo accounts are read-only.' });
    }
    next();
  });
  app.post('/api/:table', async (req, res) => {
    const { table } = req.params;
    if (!Object.hasOwn(schemas, table) || !schemas[table].create) throw notFound();
    const input = schemas[table].create.parse(req.body);
    const now = new Date().toISOString();
    const document = { ...input, id: randomUUID(), created_at: now, updated_at: now };
    if (table === 'customers') Object.assign(document, {
      email: input.email ?? '', phone: input.phone ?? '', notes: input.notes ?? '', status: input.status ?? '',
    });
    if (table === 'products') document.description = input.description ?? '';
    if (table === 'subscriptions') document.status = input.status ?? 'active';
    if (table === 'sessions') Object.assign(document, { entry_time: now, exit_time: null, status: 'active', time_cost: null });
    validateDates(document);
    const result = await client.withSession(session => session.withTransaction(async () => {
      await checkReferences(db, table, document, session);
      if (table === 'daily_closures') {
        return db.collection(table).findOneAndUpdate(
          { closure_date: input.closure_date },
          { $set: { ...input, updated_at: now }, $setOnInsert: { id: document.id, created_at: now } },
          { session, upsert: true, returnDocument: 'after', projection },
        );
      }
      await db.collection(table).insertOne(document, { session });
      const { _id, ...publicDocument } = document;
      return publicDocument;
    }));
    res.status(201).json(result);
  });
  app.patch('/api/:table/:id', async (req, res) => {
    const { table, id } = req.params;
    idSchema.parse(id);
    if (!Object.hasOwn(schemas, table) || !schemas[table].update) throw notFound();
    const input = schemas[table].update.parse(req.body);
    if (!Object.keys(input).length) throw badRequest('At least one field must be updated.');
    const result = await client.withSession(session => session.withTransaction(async () => {
      const existing = await db.collection(table).findOne({ id }, { session });
      if (!existing) throw notFound();
      if (table === 'sessions' && existing.status !== 'active') throw badRequest('This session has already ended.');
      const document = { ...existing, ...input };
      validateDates(document);
      await checkReferences(db, table, document, session);
      return db.collection(table).findOneAndUpdate(
        { id }, { $set: { ...input, updated_at: new Date().toISOString() } },
        { session, returnDocument: 'after', projection },
      );
    }));
    res.json(result);
  });
  app.delete('/api/:table/:id', async (req, res) => {
    const { table, id } = req.params;
    if (!Object.hasOwn(schemas, table) || ['settings', 'daily_closures'].includes(table)) throw notFound();
    idSchema.parse(id);
    await client.withSession(session => session.withTransaction(() => deleteRecord(db, table, id, session)));
    res.status(204).end();
  });
  app.use('/api', (_req, res) => res.status(404).json({ message: 'API endpoint not found.' }));

  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  app.use(express.static(dist));
  app.get('/{*path}', (_req, res) => res.sendFile(`${dist}index.html`));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return res.end();
    if (error instanceof ZodError) return res.status(400).json({
      message: error.issues.map(issue => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; '),
    });
    if (error.code === 11000) return res.status(409).json({
      message: error.message.includes('customers_email_key')
        ? 'A customer with this email address already exists.' : 'A record with this unique value already exists.',
    });
    if (error.status && error.status < 500) return res.status(error.status).json({ message: error.message });
    console.error(`API request failed (${error.name}, code: ${error.code || 'unknown'}).`);
    res.status(error.status || 500).json({ message: 'Database request failed. Check the API server and MongoDB connection.' });
  });
  return app;
}
