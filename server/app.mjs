import express from 'express';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z, ZodError } from 'zod';
import {
  schemas, loginSchema, registrationSchema, employeeStatusSchema, shiftCloseSchema,
  startShiftSchema, idSchema, validateDates, notificationListSchema,
  notificationActionSchema, adminNotificationSchema, operationalRequestSchema,
  requestListSchema, requestUpdateSchema,
} from './validation.mjs';
import { getFinancialYear } from './financial.mjs';
import {
  assertRentalAvailability, assertUtilityPaymentRental, lockRooms, tunisDate,
} from './room-management.mjs';
import {
  COOKIE_NAME, SESSION_DURATION, cookieOptions, newToken, readToken,
  tokenHash, publicUser, verifyPassword, hashPassword,
} from './auth.mjs';
import { createNotification, notifyAdmins, publicNotification } from './notifications.mjs';

const projection = { _id: 0, singleton: 0, _reference_version: 0 };
const RECENT_START_REQUESTS = 20;
const tunisMidnight = date => new Date(`${date}T00:00:00+01:00`);
const notFound = () => Object.assign(new Error('Record not found.'), { status: 404 });
const badRequest = message => Object.assign(new Error(message), { status: 400 });
const publicOperationalRequest = request => ({
  id: request.id,
  employee_id: request.employee_id,
  type: request.type,
  title: request.title,
  message: request.message,
  status: request.status,
  admin_id: request.admin_id ?? null,
  admin_response: request.admin_response ?? null,
  created_at: request.created_at,
  updated_at: request.updated_at,
});
const querySchema = z.object({
  status: z.enum(['active', 'completed', 'cancelled', 'expired']).optional(),
  customer_id: idSchema.optional(),
  since: z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString()).optional(),
  start: z.iso.date().optional(), end: z.iso.date().optional(),
  active_on: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict();
const employeeListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['pending', 'active', 'rejected', 'disabled']).optional(),
  search: z.string().trim().max(200).optional(),
}).strict();
const workSessionListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  employeeId: idSchema.optional(),
  status: z.enum(['active', 'completed']).optional(),
  start: z.iso.date().optional(),
  end: z.iso.date().optional(),
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
    subscription_payments: [['subscriptions', 'subscription_id']],
  }[table] || [];
  for (const [collection, field] of references) {
    if (document[field] === null && field === 'plan_id') continue;
    if (document[field] === null && table === 'subscription_payments') continue;
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
    const subscriptions = await db.collection('subscriptions').find({ customer_id: id }, { session }).toArray();
    await db.collection('subscription_payments').updateMany(
      { subscription_id: { $in: subscriptions.map(row => row.id) } },
      { $set: { subscription_id: null, updated_at: new Date().toISOString() } }, { session },
    );
    await db.collection('subscriptions').deleteMany({ customer_id: id }, { session });
  }
  if (table === 'subscriptions') await db.collection('subscription_payments').updateMany(
    { subscription_id: id }, { $set: { subscription_id: null, updated_at: new Date().toISOString() } }, { session },
  );
  if (table === 'sessions') await db.collection('session_products').deleteMany({ session_id: id }, { session });
  if (table === 'products') await db.collection('session_products').deleteMany({ product_id: id }, { session });
  if (table === 'plans') await db.collection('subscriptions').updateMany(
    { plan_id: id }, { $set: { plan_id: null, updated_at: new Date().toISOString() } }, { session },
  );
  await db.collection(table).deleteOne({ id }, { session });
}

export async function createApp({
  db, client, events, realtimeReady = () => true,
  notificationRealtimeReady = () => !serverless || Boolean(process.env.SOCKET_SERVER_URL),
  serverless = false, serveFrontend = true,
}) {
  const app = express();
  app.disable('x-powered-by');
  if (serverless) app.set('trust proxy', 1);
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      const expected = process.env.APP_ORIGIN || `${req.protocol}://${serverless ? req.host : req.get('host')}`;
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
  const pruneAttempts = () => {
    for (const [key, value] of loginAttempts) if (value.until <= Date.now()) loginAttempts.delete(key);
  };
  const consumeRateLimit = (key, maxAttempts, windowMs) => {
    if (serverless) pruneAttempts();
    const now = Date.now();
    let attempts = loginAttempts.get(key);
    if (!attempts || attempts.until <= now) {
      attempts = { count: 0, until: now + windowMs };
      loginAttempts.set(key, attempts);
    }
    return ++attempts.count <= maxAttempts;
  };
  if (!serverless) {
    const attemptCleanup = setInterval(pruneAttempts, 60_000);
    attemptCleanup.unref();
    app.on('close', () => clearInterval(attemptCleanup));
  }

  app.post('/api/auth/login', async (req, res) => {
    const credentials = loginSchema.parse(req.body);
    if (serverless) pruneAttempts();
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
    if (!user || !matches || (user.status && user.status !== 'active')) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    loginAttempts.delete(key);
    const token = newToken();
    await db.collection('auth_sessions').insertOne({
      id: randomUUID(), token_hash: tokenHash(token), user_id: user.id,
      expires_at: new Date(now + SESSION_DURATION),
    });
    res.cookie(COOKIE_NAME, token, cookieOptions());
    res.json({ user: publicUser(user) });
  });

  app.post('/api/auth/register', async (req, res) => {
    const registration = registrationSchema.parse(req.body);
    if (serverless) pruneAttempts();
    const key = `register:${req.ip}`;
    const nowMs = Date.now();
    let attempts = loginAttempts.get(key);
    if (!attempts || attempts.until <= nowMs) {
      attempts = { count: 0, until: nowMs + 60 * 60 * 1000 };
      loginAttempts.set(key, attempts);
    }
    if (++attempts.count > 10) {
      return res.status(429).json({ message: 'Too many registration attempts. Try again later.' });
    }
    const now = new Date().toISOString();
    const user = {
      id: randomUUID(),
      full_name: registration.fullName,
      email: registration.email.trim().toLowerCase(),
      phone: registration.phone || '',
      password_hash: await hashPassword(registration.password),
      role: 'employee',
      status: process.env.EMPLOYEE_APPROVAL_REQUIRED === 'true' ? 'pending' : 'active',
      created_at: now,
      updated_at: now,
    };
    await client.withSession(session => session.withTransaction(async () => {
      await db.collection('users').insertOne(user, { session });
      if (user.status === 'pending') {
        await notifyAdmins(db, {
          type: 'employee_approval',
          title: 'Nouvelle demande d’accès',
          message: `Le compte de ${user.full_name} attend votre approbation.`,
          priority: 'high',
          actionUrl: '/admin/employees',
          data: { employeeId: user.id },
          dedupeKey: `employee-approval:${user.id}`,
        }, { session });
      }
    }));
    const { password_hash: _passwordHash, ...safeUser } = user;
    res.status(201).json({ user: publicUser(safeUser), status: user.status });
  });

  const authenticate = async (req, res, next) => {
    const token = readToken(req);
    if (!token) return res.status(401).json({ message: 'Please sign in.' });
    const session = await db.collection('auth_sessions').findOne({
      token_hash: tokenHash(token), expires_at: { $gt: new Date() },
    });
    const user = session && await db.collection('users').findOne({ id: session.user_id });
    if (!user) return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
    if (user.status && user.status !== 'active') {
      await db.collection('auth_sessions').deleteOne({ id: session.id });
      return res.status(403).json({ message: 'This account is not active.' });
    }
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

  const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Administrator access is required.' });
    next();
  };
  const requireEmployee = (req, res, next) => {
    if (!['employee', 'staff'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Employee access is required.' });
    }
    next();
  };

  app.get('/api/notifications', async (req, res) => {
    const { page, limit, state, type } = notificationListSchema.parse(req.query);
    const filter = { recipient_id: req.user.id, archived_at: null };
    if (state === 'unread') filter.read_at = null;
    if (state === 'read') filter.read_at = { $ne: null };
    if (type) filter.type = type;
    const notifications = db.collection('notifications');
    const [items, total] = await Promise.all([
      notifications.find(filter, { projection }).sort({ created_at: -1 })
        .skip((page - 1) * limit).limit(limit).toArray(),
      notifications.countDocuments(filter),
    ]);
    res.json({
      items: items.map(publicNotification), page, limit, total, totalPages: Math.ceil(total / limit),
    });
  });

  app.get('/api/notifications/unread-count', async (req, res) => {
    const count = await db.collection('notifications').countDocuments({
      recipient_id: req.user.id, archived_at: null, read_at: null,
    });
    res.json({ count });
  });

  app.post('/api/notifications/socket-ticket', async (req, res) => {
    z.object({}).strict().parse(req.body ?? {});
    if (!notificationRealtimeReady()) return res.json({ mode: 'polling' });
    if (!consumeRateLimit(`socket-ticket:${req.authSession.id}`, 20, 60_000)) {
      return res.status(429).json({ message: 'Too many live-connection attempts. Try again in one minute.' });
    }
    const ticket = newToken();
    const expiresAt = new Date(Date.now() + 30_000);
    await db.collection('socket_tickets').insertOne({
      id: randomUUID(),
      ticket_hash: tokenHash(ticket),
      user_id: req.user.id,
      auth_session_id: req.authSession.id,
      expires_at: expiresAt,
    });
    res.json({
      mode: 'socket', ticket, expiresInMs: 30_000,
      ...(process.env.SOCKET_SERVER_URL ? { socketUrl: process.env.SOCKET_SERVER_URL } : {}),
    });
  });

  app.post('/api/notifications/read-all', async (req, res) => {
    z.object({}).strict().parse(req.body ?? {});
    const now = new Date().toISOString();
    const result = await db.collection('notifications').updateMany({
      recipient_id: req.user.id, archived_at: null, read_at: null,
    }, { $set: { read_at: now, updated_at: now } });
    res.json({ updated: result.modifiedCount });
  });

  app.patch('/api/notifications/:id/action', async (req, res) => {
    const { id } = req.params;
    idSchema.parse(id);
    const action = notificationActionSchema.parse(req.body?.action);
    const now = new Date().toISOString();
    const fields = action === 'read' ? { read_at: now }
      : action === 'unread' ? { read_at: null }
      : action === 'archive' ? { archived_at: now }
      : { archived_at: null };
    const notification = await db.collection('notifications').findOneAndUpdate(
      { id, recipient_id: req.user.id },
      { $set: { ...fields, updated_at: now } },
      { returnDocument: 'after', projection },
    );
    if (!notification) throw notFound();
    res.json(publicNotification(notification));
  });

  app.get('/api/employee/requests', requireEmployee, async (req, res) => {
    const requests = await db.collection('operational_requests').find(
      { employee_id: req.user.id },
    ).sort({ created_at: -1 }).limit(50).toArray();
    res.json({ items: requests.map(publicOperationalRequest) });
  });

  app.post('/api/employee/requests', requireEmployee, async (req, res) => {
    const input = operationalRequestSchema.parse(req.body);
    const existing = await db.collection('operational_requests').findOne({
      employee_id: req.user.id, idempotency_key: input.idempotencyKey,
    });
    if (existing) return res.json(publicOperationalRequest(existing));
    if (!consumeRateLimit(`employee-request:${req.user.id}`, 5, 15 * 60_000)) {
      return res.status(429).json({ message: 'Too many requests. Try again in 15 minutes.' });
    }

    const now = new Date().toISOString();
    const request = {
      id: randomUUID(),
      employee_id: req.user.id,
      type: input.type,
      title: input.title,
      message: input.message,
      status: 'open',
      admin_id: null,
      admin_response: null,
      idempotency_key: input.idempotencyKey,
      created_at: now,
      updated_at: now,
    };
    try {
      await client.withSession(session => session.withTransaction(async () => {
        await db.collection('operational_requests').insertOne(request, { session });
        await notifyAdmins(db, {
          type: 'operational_request',
          title: 'Nouvelle demande opérationnelle',
          message: `${req.user.name} : ${request.title}`,
          priority: 'normal',
          actionUrl: '/admin/requests',
          data: { requestId: request.id },
          dedupeKey: `operational-request:${request.id}`,
        }, { session });
      }));
    } catch (error) {
      if (error.code !== 11000) throw error;
      const repeated = await db.collection('operational_requests').findOne({
        employee_id: req.user.id, idempotency_key: input.idempotencyKey,
      });
      if (repeated) return res.json(publicOperationalRequest(repeated));
      throw error;
    }
    res.status(201).json(publicOperationalRequest(request));
  });

  app.get('/api/admin/requests', requireAdmin, async (req, res) => {
    const { page, limit, status } = requestListSchema.parse(req.query);
    const filter = status ? { status } : {};
    const requests = db.collection('operational_requests');
    const [items, total] = await Promise.all([
      requests.find(filter).sort({ created_at: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      requests.countDocuments(filter),
    ]);
    const employees = await db.collection('users').find({
      id: { $in: [...new Set(items.map(item => item.employee_id))] },
    }, { projection: { ...projection, password_hash: 0 } }).toArray();
    const byId = new Map(employees.map(employee => [employee.id, publicUser(employee)]));
    res.json({
      items: items.map(item => ({
        ...publicOperationalRequest(item), employee: byId.get(item.employee_id) || null,
      })),
      page, limit, total, totalPages: Math.ceil(total / limit),
    });
  });

  app.patch('/api/admin/requests/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    idSchema.parse(id);
    const input = requestUpdateSchema.parse(req.body);
    const now = new Date().toISOString();
    const updated = await client.withSession(session => session.withTransaction(async () => {
      const existing = await db.collection('operational_requests').findOne({ id }, { session });
      if (!existing) throw notFound();
      const shouldNotify = existing.status !== input.status || existing.admin_response !== input.response;
      const result = await db.collection('operational_requests').findOneAndUpdate(
        { id },
        { $set: {
          status: input.status, admin_response: input.response,
          admin_id: req.user.id, updated_at: now,
        } },
        { session, returnDocument: 'after', projection },
      );
      if (shouldNotify) {
        await createNotification(db, {
          recipientId: existing.employee_id,
          senderId: req.user.id,
          type: 'request_update',
          title: 'Mise à jour de votre demande',
          message: input.response,
          priority: input.status === 'rejected' ? 'high' : 'normal',
          actionUrl: '/notifications',
          data: { requestId: id, status: input.status },
          dedupeKey: `request-update:${id}:${now}`,
        }, { session });
      }
      return result;
    }));
    if (!updated) throw notFound();
    res.json(publicOperationalRequest(updated));
  });

  app.post('/api/admin/notifications', requireAdmin, async (req, res) => {
    const input = adminNotificationSchema.parse(req.body);
    const recipients = input.recipientId
      ? [await db.collection('users').findOne({ id: input.recipientId })]
      : await db.collection('users').find({
        role: { $in: ['employee', 'staff'] }, status: { $in: ['active', null] },
      }).toArray();
    if (input.recipientId && (!recipients[0] ||
        !['employee', 'staff'].includes(recipients[0].role) ||
        (recipients[0].status && recipients[0].status !== 'active'))) {
      throw badRequest('Choose an active employee account.');
    }
    if (!recipients.length) throw badRequest('There are no active employees to notify.');
    if (!consumeRateLimit(`admin-notifications:${req.user.id}`, 10, 60 * 60_000)) {
      return res.status(429).json({ message: 'Too many announcements. Try again in one hour.' });
    }
    const records = await client.withSession(session => session.withTransaction(async () => {
      const created = [];
      for (const recipient of recipients) {
        created.push(await createNotification(db, {
          recipientId: recipient.id,
          senderId: req.user.id,
          type: 'admin_announcement',
          title: input.title,
          message: input.message,
          priority: input.priority,
          actionUrl: input.actionUrl,
          dedupeKey: `admin-announcement:${input.idempotencyKey}:${recipient.id}`,
        }, { session }));
      }
      return created;
    }));
    res.status(201).json({ sent: records.length });
  });

  app.get('/api/employee/work-sessions', requireEmployee, async (req, res) => {
    const [active, history] = await Promise.all([
      db.collection('work_sessions').findOne({ employee_id: req.user.id, status: 'active' }),
      db.collection('work_sessions').find({ employee_id: req.user.id }).sort({ start_time: -1 }).limit(30).toArray(),
    ]);
    res.json({ active, history });
  });

  app.post('/api/employee/work-sessions', requireEmployee, async (req, res) => {
    const { requestId } = startShiftSchema.parse(req.body);
    const previousRequest = await db.collection('work_sessions').findOne({
      employee_id: req.user.id, start_request_ids: requestId,
    });
    if (previousRequest) return res.json(previousRequest);
    const active = await db.collection('work_sessions').findOne({
      employee_id: req.user.id, status: 'active',
    });
    if (active) {
      const associated = await db.collection('work_sessions').findOneAndUpdate(
        { id: active.id },
        { $push: { start_request_ids: { $each: [requestId], $slice: -RECENT_START_REQUESTS } } },
        { returnDocument: 'after', projection },
      );
      return res.json(associated || active);
    }
    const startTime = new Date();
    const workSession = {
      id: randomUUID(),
      employee_id: req.user.id,
      start_request_ids: [requestId],
      start_time: startTime,
      end_time: null,
      duration_minutes: null,
      status: 'active',
      created_at: startTime,
      updated_at: startTime,
    };
    try {
      await db.collection('work_sessions').insertOne(workSession);
    } catch (error) {
      if (error.code !== 11000) throw error;
      const repeatedRequest = await db.collection('work_sessions').findOne({
        employee_id: req.user.id, start_request_ids: requestId,
      });
      if (repeatedRequest) return res.json(repeatedRequest);
      const concurrentActive = await db.collection('work_sessions').findOne({
        employee_id: req.user.id, status: 'active',
      });
      if (!concurrentActive) throw error;
      const associated = await db.collection('work_sessions').findOneAndUpdate(
        { id: concurrentActive.id },
        { $push: { start_request_ids: { $each: [requestId], $slice: -RECENT_START_REQUESTS } } },
        { returnDocument: 'after', projection },
      );
      return res.json(associated || concurrentActive);
    }
    res.status(201).json(workSession);
  });

  app.post('/api/employee/work-sessions/:id/end', requireEmployee, async (req, res) => {
    z.object({}).strict().parse(req.body);
    const { id } = req.params;
    idSchema.parse(id);
    const current = await db.collection('work_sessions').findOne({
      id, employee_id: req.user.id,
    });
    if (!current) throw notFound();
    if (current.status === 'completed') return res.json(current);
    const endTime = new Date();
    const durationMinutes = Math.max(0, Math.round((endTime.getTime() - current.start_time.getTime()) / 60000));
    const completed = await db.collection('work_sessions').findOneAndUpdate(
      { id, employee_id: req.user.id, status: 'active' },
      { $set: {
        end_time: endTime, duration_minutes: durationMinutes, status: 'completed', updated_at: endTime,
      } },
      { returnDocument: 'after', projection },
    );
    if (!completed) {
      const retryResult = await db.collection('work_sessions').findOne({ id, employee_id: req.user.id });
      if (retryResult?.status === 'completed') return res.json(retryResult);
      throw notFound();
    }
    res.json(completed);
  });

  app.get('/api/admin/employees', requireAdmin, async (req, res) => {
    const { page, limit, status, search } = employeeListSchema.parse(req.query);
    const filter = { role: { $in: ['employee', 'staff'] } };
    if (status) filter.status = status;
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { full_name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }
    const users = db.collection('users');
    const [items, total] = await Promise.all([
      users.find(filter, { projection: { ...projection, password_hash: 0 } })
        .sort({ created_at: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      users.countDocuments(filter),
    ]);
    res.json({ items, page, limit, total, totalPages: Math.ceil(total / limit) });
  });

  app.patch('/api/admin/employees/:id/status', requireAdmin, async (req, res) => {
    const { id } = req.params;
    idSchema.parse(id);
    const input = employeeStatusSchema.parse(req.body);
    const now = new Date();
    const result = await client.withSession(session => session.withTransaction(async () => {
      const existing = await db.collection('users').findOne({
        id, role: { $in: ['employee', 'staff'] },
      }, { session });
      if (!existing) throw notFound();
      const statusChanged = (existing.status || 'active') !== input.status;
      const updated = await db.collection('users').findOneAndUpdate(
        { id, role: { $in: ['employee', 'staff'] } },
        { $set: { status: input.status, updated_at: now.toISOString() } },
        { session, returnDocument: 'after', projection: { ...projection, password_hash: 0 } },
      );
      await db.collection('auth_sessions').deleteMany({ user_id: id }, { session });
      await db.collection('admin_audit_logs').insertOne({
        id: randomUUID(), actor_id: req.user.id, action: 'employee.status_changed',
        target_type: 'user', target_id: id, reason: input.reason,
        before: { status: existing.status || 'active' }, after: { status: input.status },
        created_at: now,
      }, { session });
      if (statusChanged) {
        const statusMessages = {
          active: 'Votre compte employé est maintenant actif.',
          pending: 'Votre compte est en attente de validation.',
          rejected: 'Votre demande d’accès a été refusée.',
          disabled: 'Votre compte employé a été désactivé.',
        };
        await createNotification(db, {
          recipientId: id,
          senderId: req.user.id,
          type: 'account_status',
          title: 'État du compte mis à jour',
          message: statusMessages[input.status],
          priority: input.status === 'rejected' || input.status === 'disabled' ? 'high' : 'normal',
          data: { status: input.status },
          dedupeKey: `employee-status:${id}:${now.toISOString()}`,
        }, { session });
      }
      return updated;
    }));
    res.json(result);
  });

  app.get('/api/admin/work-sessions', requireAdmin, async (req, res) => {
    const { page, limit, employeeId, status, start, end } = workSessionListSchema.parse(req.query);
    if (start && end && start > end) throw badRequest('End date must be on or after the start date.');
    const filter = {};
    if (employeeId) filter.employee_id = employeeId;
    if (status) filter.status = status;
    if (start || end) {
      filter.start_time = {
        ...(start ? { $gte: tunisMidnight(start) } : {}),
        ...(end ? { $lt: new Date(tunisMidnight(end).getTime() + 86400000) } : {}),
      };
    }
    const shifts = db.collection('work_sessions');
    const [items, total] = await Promise.all([
      shifts.find(filter).sort({ start_time: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      shifts.countDocuments(filter),
    ]);
    const employees = await db.collection('users').find({
      id: { $in: [...new Set(items.map(item => item.employee_id))] },
    }, { projection: { ...projection, password_hash: 0 } }).toArray();
    const byId = new Map(employees.map(employee => [employee.id, employee]));
    res.json({
      items: items.map(item => ({ ...item, employee: byId.get(item.employee_id) || null })),
      page, limit, total, totalPages: Math.ceil(total / limit),
    });
  });

  app.post('/api/admin/work-sessions/:id/end', requireAdmin, async (req, res) => {
    const { id } = req.params;
    idSchema.parse(id);
    const { reason } = shiftCloseSchema.parse(req.body);
    const now = new Date();
    const result = await client.withSession(session => session.withTransaction(async () => {
      const existing = await db.collection('work_sessions').findOne({ id, status: 'active' }, { session });
      if (!existing) throw notFound();
      const updated = await db.collection('work_sessions').findOneAndUpdate(
        { id, status: 'active' },
        { $set: {
          end_time: now,
          duration_minutes: Math.max(0, Math.round((now.getTime() - existing.start_time.getTime()) / 60000)),
          status: 'completed',
          closed_by: req.user.id,
          close_reason: reason,
          updated_at: now,
        } },
        { session, returnDocument: 'after', projection },
      );
      await db.collection('admin_audit_logs').insertOne({
        id: randomUUID(), actor_id: req.user.id, action: 'work_session.admin_closed',
        target_type: 'work_session', target_id: id, reason,
        before: { status: 'active' }, after: { status: 'completed', end_time: now },
        created_at: now,
      }, { session });
      await createNotification(db, {
        recipientId: existing.employee_id,
        senderId: req.user.id,
        type: 'shift_admin_closed',
        title: 'Votre service a été clôturé',
        message: `Un administrateur a clôturé votre service. Motif : ${reason}`,
        priority: 'high',
        actionUrl: '/notifications',
        data: { workSessionId: id },
        dedupeKey: `shift-admin-closed:${id}`,
      }, { session });
      return updated;
    }));
    res.json(result);
  });

  app.get('/api/realtime/config', (_req, res) => res.json(
    serverless ? { mode: 'polling', intervalMs: 15000 } : { mode: 'streaming' },
  ));
  app.get('/api/events', (req, res) => {
    if (serverless) return res.status(409).json({ message: 'Use dashboard polling on this deployment.' });
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

  app.get('/api/reports/financial', async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Financial reports are available for administrators only.' });
    const { year } = z.object({ year: z.coerce.number().int().min(2000).max(9998) }).strict().parse(req.query);
    res.json(await getFinancialYear(db, year));
  });

  app.get('/api/:table', async (req, res) => {
    const { table } = req.params;
    if (!Object.hasOwn(schemas, table)) throw notFound();
    if (['settings', 'daily_closures'].includes(table) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'This resource is available for administrators only.' });
    }
    const query = querySchema.parse(req.query);
    const filter = {};
    if (query.status) filter.status = query.status;
    if (['rooms', 'room_rentals', 'utility_payments'].includes(table)) filter.archived = { $ne: true };
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
      : table === 'daily_closures' ? { closure_date: -1 } : table === 'sessions' ? { entry_time: -1 }
      : table === 'expenses' ? { expense_date: -1, created_at: -1 }
      : table === 'rooms' ? { room_number: 1 }
      : table === 'room_rentals' ? { entry_date: -1, created_at: -1 }
      : table === 'utility_payments' ? { billing_period: -1, created_at: -1 } : { created_at: -1 };
    const order = table === 'subscription_payments' ? { payment_date: -1, created_at: -1 } : sort;
    let cursor = db.collection(table).find(filter, { projection }).sort(order);
    if (query.limit) cursor = cursor.limit(query.limit);
    const rows = await cursor.toArray();
    if (table === 'settings' && !rows.length) {
      throw Object.assign(new Error('Database settings are missing. Run npm run setup-db.'), { status: 503 });
    }
    res.json(await joinRows(db, table, rows));
  });

  app.use('/api/:table', (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) && req.user.role === 'demo') {
      return res.status(403).json({ message: 'Demo accounts are read-only.' });
    }
    if (['settings', 'daily_closures'].includes(req.params.table) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'This operation is available for administrators only.' });
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
    if (table === 'rooms') Object.assign(document, {
      name: input.name || input.room_number, notes: input.notes ?? '', archived: false,
    });
    if (table === 'room_rentals') Object.assign(document, {
      phone: input.phone ?? '', actual_departure_date: input.actual_departure_date ?? null,
      notes: input.notes ?? '', archived: false,
    });
    if (table === 'utility_payments') Object.assign(document, {
      payment_date: input.payment_date ?? null, amount: input.amount ?? null,
      invoice_reference: input.invoice_reference ?? '', notes: input.notes ?? '', archived: false,
    });
    validateDates(document);
    const result = await client.withSession(session => session.withTransaction(async () => {
      if (table === 'room_rentals') {
        await lockRooms(db, [document.room_id], session);
        await assertRentalAvailability(db, document, null, session);
      }
      if (table === 'utility_payments') {
        await assertUtilityPaymentRental(db, document.rental_id, session);
      }
      await checkReferences(db, table, document, session);
      if (table === 'subscription_payments') {
        const subscription = await db.collection('subscriptions').findOne({ id: input.subscription_id }, { session });
        const [customer, plan] = await Promise.all([
          db.collection('customers').findOne({ id: subscription.customer_id }, { session }),
          subscription.plan_id ? db.collection('plans').findOne({ id: subscription.plan_id }, { session }) : null,
        ]);
        if (!customer) throw badRequest('The subscription customer no longer exists.');
        document.customer_name = customer.full_name;
        document.plan_name = plan?.name ?? 'Plan supprimé';
      }
      if (table === 'daily_closures') {
        return db.collection(table).findOneAndUpdate(
          { closure_date: input.closure_date },
          { $set: { ...input, updated_at: now }, $setOnInsert: { id: document.id, created_at: now } },
          { session, upsert: true, returnDocument: 'after', projection },
        );
      }
      await db.collection(table).insertOne(document, { session });
      if (table === 'room_rentals') {
        const period = document.entry_date.slice(0, 7);
        for (const type of ['water', 'electricity']) {
          await db.collection('utility_payments').insertOne({
            id: randomUUID(), rental_id: document.id, type, billing_period: period,
            status: 'unpaid', payment_date: null, amount: null, invoice_reference: '',
            notes: '', archived: false, created_at: now, updated_at: now,
          }, { session });
        }
      }
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
      if (['rooms', 'room_rentals', 'utility_payments'].includes(table) && existing.archived) {
        throw badRequest('Les enregistrements archivés ne peuvent pas être modifiés.');
      }
      if (table === 'sessions' && existing.status !== 'active') throw badRequest('This session has already ended.');
      const document = { ...existing, ...input };
      validateDates(document);
      if (table === 'room_rentals') {
        await lockRooms(db, [existing.room_id, document.room_id], session);
        await assertRentalAvailability(db, document, id, session);
      }
      if (table === 'utility_payments') {
        schemas.utility_payments.create.parse({
          rental_id: document.rental_id, type: document.type, billing_period: document.billing_period,
          status: document.status, payment_date: document.payment_date, amount: document.amount,
          invoice_reference: document.invoice_reference, notes: document.notes,
        });
        await assertUtilityPaymentRental(db, document.rental_id, session);
      }
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
    if (['rooms', 'room_rentals', 'utility_payments'].includes(table)) {
      await client.withSession(session => session.withTransaction(async () => {
        const record = await db.collection(table).findOne({ id, archived: { $ne: true } }, { session });
        if (!record) throw notFound();
        if (table === 'rooms') {
          await lockRooms(db, [id], session);
          const openRental = await db.collection('room_rentals').findOne({
            room_id: id, archived: { $ne: true }, actual_departure_date: null,
          }, { session });
          if (openRental) throw badRequest('Impossible d’archiver une chambre avec une location en cours ou prévue.');
        }
        if (table === 'room_rentals') await lockRooms(db, [record.room_id], session);
        if (table === 'room_rentals' && !record.actual_departure_date && record.entry_date <= tunisDate()) {
          throw badRequest('Enregistrez la date de sortie réelle avant d’archiver une location active.');
        }
        await db.collection(table).updateOne(
          { id }, { $set: { archived: true, updated_at: new Date().toISOString() } }, { session },
        );
      }));
      return res.status(204).end();
    }
    await client.withSession(session => session.withTransaction(() => deleteRecord(db, table, id, session)));
    res.status(204).end();
  });
  app.use('/api', (_req, res) => res.status(404).json({ message: 'API endpoint not found.' }));

  if (serveFrontend) {
    const dist = fileURLToPath(new URL('../dist/', import.meta.url));
    app.use(express.static(dist));
    app.get('/{*path}', (_req, res) => res.sendFile(`${dist}index.html`));
  } else {
    app.use((_req, res) => res.status(404).json({ message: 'API endpoint not found.' }));
  }
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
