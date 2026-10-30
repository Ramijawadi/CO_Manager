import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../server/app.mjs';
import { hashPassword, newToken, tokenHash, verifyPassword } from '../server/auth.mjs';

const uuid = () => randomUUID();

function makeDatabase() {
  const collections = new Map();
  const rows = name => {
    if (!collections.has(name)) collections.set(name, []);
    return collections.get(name);
  };
  const matches = (row, filter = {}) => Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return expected.some(condition => matches(row, condition));
    const value = row[key];
    if (Array.isArray(value) && !Array.isArray(expected)) return value.includes(expected);
    if (expected instanceof RegExp) return expected.test(value);
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      if ('$in' in expected && !expected.$in.includes(value)) return false;
      if ('$gt' in expected && !(value > expected.$gt)) return false;
      if ('$gte' in expected && !(value >= expected.$gte)) return false;
      if ('$lte' in expected && !(value <= expected.$lte)) return false;
      if ('$ne' in expected && value === expected.$ne) return false;
      if ('$regex' in expected && !new RegExp(expected.$regex, expected.$options).test(value)) return false;
      return true;
    }
    return value === expected;
  });
  const collection = name => ({
    findOne: async filter => rows(name).find(row => matches(row, filter)) ?? null,
    find: filter => {
      let result = rows(name).filter(row => matches(row, filter));
      const cursor = {
        sort(order) {
          const [[key, direction]] = Object.entries(order);
          result = [...result].sort((left, right) => {
            const a = left[key] instanceof Date ? left[key].getTime() : left[key];
            const b = right[key] instanceof Date ? right[key].getTime() : right[key];
            return (a < b ? -1 : a > b ? 1 : 0) * direction;
          });
          return cursor;
        },
        skip(count) { result = result.slice(count); return cursor; },
        limit(count) { result = result.slice(0, count); return cursor; },
        toArray: async () => result.map(row => ({ ...row })),
      };
      return cursor;
    },
    insertOne: async document => {
      if (name === 'users' && rows(name).some(row => row.email === document.email)) {
        throw Object.assign(new Error('duplicate email'), { code: 11000 });
      }
      if (name === 'work_sessions' && document.status === 'active' &&
          rows(name).some(row => row.employee_id === document.employee_id && row.status === 'active')) {
        throw Object.assign(new Error('duplicate active shift'), { code: 11000 });
      }
      if (name === 'operational_requests' && rows(name).some(row =>
        row.employee_id === document.employee_id && row.idempotency_key === document.idempotency_key)) {
        throw Object.assign(new Error('duplicate operational request'), { code: 11000 });
      }
      if (name === 'notifications' && rows(name).some(row =>
        row.recipient_id === document.recipient_id && row.dedupe_key === document.dedupe_key)) {
        throw Object.assign(new Error('duplicate notification'), { code: 11000 });
      }
      rows(name).push(document);
      return { insertedId: document.id };
    },
    findOneAndUpdate: async (filter, update) => {
      const row = rows(name).find(item => matches(item, filter));
      if (!row) return null;
      Object.assign(row, update.$set ?? {});
      for (const [key, value] of Object.entries(update.$inc ?? {})) row[key] = (row[key] ?? 0) + value;
      for (const [key, value] of Object.entries(update.$push ?? {})) {
        row[key] ??= [];
        row[key].push(...value.$each);
        if (value.$slice < 0) row[key] = row[key].slice(value.$slice);
      }
      return { ...row };
    },
    updateOne: async (filter, update) => {
      const row = rows(name).find(item => matches(item, filter));
      if (row) Object.assign(row, update.$set ?? {});
      return { matchedCount: row ? 1 : 0 };
    },
    updateMany: async (filter, update) => {
      const matching = rows(name).filter(row => matches(row, filter));
      for (const row of matching) Object.assign(row, update.$set ?? {});
      return { modifiedCount: matching.length };
    },
    deleteOne: async filter => {
      const index = rows(name).findIndex(row => matches(row, filter));
      if (index >= 0) rows(name).splice(index, 1);
      return { deletedCount: index >= 0 ? 1 : 0 };
    },
    deleteMany: async filter => {
      const before = rows(name).length;
      collections.set(name, rows(name).filter(row => !matches(row, filter)));
      return { deletedCount: before - rows(name).length };
    },
    countDocuments: async filter => rows(name).filter(row => matches(row, filter)).length,
  });
  return {
    collection,
    seed: (name, document) => rows(name).push(document),
    all: name => rows(name),
    command: async () => ({ ok: 1 }),
  };
}

test('employee registration, shifts, ownership, admin controls and account revocation', async t => {
  const db = makeDatabase();
  const adminId = uuid();
  const otherEmployeeId = uuid();
  db.seed('users', {
    id: adminId, email: 'admin@example.com', role: 'admin', status: 'active',
    full_name: 'Admin', password_hash: await hashPassword('admin-password-123'),
  });
  db.seed('users', {
    id: otherEmployeeId, email: 'other@example.com', role: 'employee', status: 'active',
    full_name: 'Other Employee', password_hash: await hashPassword('other-password-123'),
  });

  const createCookie = userId => {
    const token = newToken();
    db.seed('auth_sessions', {
      id: uuid(), token_hash: tokenHash(token), user_id: userId,
      expires_at: new Date(Date.now() + 60_000),
    });
    return `co_manager_session=${token}`;
  };
  const adminCookie = createCookie(adminId);
  const otherCookie = createCookie(otherEmployeeId);
  const client = { withSession: callback => callback({ withTransaction: operation => operation() }) };
  const app = await createApp({ db, client, serverless: true, serveFrontend: false });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (path, method = 'GET', body, cookie, expected = 200) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value = response.status === 204 ? null : await response.json();
    assert.equal(response.status, expected, JSON.stringify(value));
    return { value, response };
  };

  const registration = await request('/auth/register', 'POST', {
    fullName: 'Registered Employee', email: '  employee@example.com  ',
    phone: '+21600000000', password: 'employee-password-123',
  }, undefined, 201);
  assert.equal(registration.value.user.role, 'employee');
  assert.equal(registration.value.status, 'active');
  const createdUser = db.all('users').find(user => user.email === 'employee@example.com');
  assert.equal(createdUser.full_name, 'Registered Employee');
  assert.notEqual(createdUser.password_hash, 'employee-password-123');
  assert.equal(await verifyPassword('employee-password-123', createdUser.password_hash), true);
  await request('/auth/register', 'POST', {
    fullName: 'Escalation Attempt', email: 'escalate@example.com',
    password: 'employee-password-123', role: 'admin',
  }, undefined, 400);
  const previousApprovalSetting = process.env.EMPLOYEE_APPROVAL_REQUIRED;
  process.env.EMPLOYEE_APPROVAL_REQUIRED = 'true';
  let pendingRegistration;
  try {
    pendingRegistration = await request('/auth/register', 'POST', {
      fullName: 'Pending Employee', email: 'pending@example.com',
      password: 'employee-password-123',
    }, undefined, 201);
  } finally {
    if (previousApprovalSetting === undefined) delete process.env.EMPLOYEE_APPROVAL_REQUIRED;
    else process.env.EMPLOYEE_APPROVAL_REQUIRED = previousApprovalSetting;
  }
  assert.equal(pendingRegistration.value.status, 'pending');
  assert.equal(db.all('notifications').filter(item => item.type === 'employee_approval').length, 1);
  await request('/auth/login', 'POST', {
    email: 'pending@example.com', password: 'employee-password-123',
  }, undefined, 401);

  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: createdUser.email, password: 'employee-password-123' }),
  });
  assert.equal(login.status, 200);
  const employeeCookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await login.json()).user.role, 'employee');

  await request('/admin/employees', 'GET', undefined, employeeCookie, 403);
  await request('/settings', 'GET', undefined, employeeCookie, 403);
  await request('/reports/financial?year=2026', 'GET', undefined, employeeCookie, 403);
  await request('/admin/employees', 'GET', undefined, adminCookie, 200);
  await request('/admin/employees', 'GET', undefined, otherCookie, 403);

  const settingsId = uuid();
  await request('/session-pricing', 'GET', undefined, employeeCookie, 503);
  db.seed('settings', { id: settingsId, hourly_rate: 0, private_setting: 'admin-only' });
  await request('/session-pricing', 'GET', undefined, undefined, 401);
  for (const cookie of [adminCookie, employeeCookie]) {
    const pricing = await request('/session-pricing', 'GET', undefined, cookie);
    assert.deepEqual(pricing.value, { hourly_rate: 0 });
  }
  await request(`/settings/${settingsId}`, 'PATCH', { hourly_rate: 2 }, employeeCookie, 403);
  await request(`/settings/${settingsId}`, 'PATCH', { hourly_rate: 2 }, adminCookie);

  const product = (await request('/products', 'POST', {
    name: 'Coffee', price: 1500, stock: 10,
  }, adminCookie, 201)).value;
  const plan = (await request('/plans', 'POST', {
    name: 'Monthly', price: 80, duration_days: 30,
  }, adminCookie, 201)).value;
  const operationTables = ['customers', 'sessions', 'session_products', 'subscriptions', 'subscription_payments'];
  for (const role of ['employee', 'staff']) {
    const userId = uuid();
    db.seed('users', { id: userId, email: `${role}-operations@example.com`, role, status: 'active' });
    const cookie = createCookie(userId);
    const customer = (await request('/customers', 'POST', { full_name: 'Visitor' }, cookie, 201)).value;
    const session = (await request('/sessions', 'POST', { customer_id: customer.id }, cookie, 201)).value;
    const consumption = (await request('/session_products', 'POST', {
      session_id: session.id, product_id: product.id, quantity: 1, total_price: 1500,
    }, cookie, 201)).value;
    const subscription = (await request('/subscriptions', 'POST', {
      customer_id: customer.id, plan_id: plan.id, start_date: '2026-10-01', end_date: '2026-10-31',
    }, cookie, 201)).value;
    const payment = (await request('/subscription_payments', 'POST', {
      subscription_id: subscription.id, amount: 80000, payment_date: '2026-10-17',
    }, cookie, 201)).value;
    const records = [customer, session, consumption, subscription, payment];
    const before = structuredClone(operationTables.map(table => db.all(table)));
    await request(`/customers/${customer.id}`, 'PATCH', { full_name: 'Admin update' }, adminCookie, 403);
    await request(`/sessions/${session.id}`, 'PATCH', {
      status: 'completed', exit_time: new Date().toISOString(), time_cost: 2,
    }, adminCookie, 403);
    for (const [index, table] of operationTables.entries()) {
      await request(`/${table}`, 'GET', undefined, adminCookie);
      for (const forbiddenRole of ['admin', 'demo']) {
        let forbiddenCookie = adminCookie;
        if (forbiddenRole === 'demo') {
          const demoId = uuid();
          db.seed('users', { id: demoId, email: `${demoId}@example.com`, role: 'demo' });
          forbiddenCookie = createCookie(demoId);
          await request(`/${table}`, 'GET', undefined, forbiddenCookie);
        }
        await request(`/${table}`, 'POST', {}, forbiddenCookie, 403);
        await request(`/${table}/${records[index].id}`, 'PATCH', {}, forbiddenCookie, 403);
        await request(`/${table}/${records[index].id}`, 'DELETE', undefined, forbiddenCookie, 403);
      }
    }
    assert.deepEqual(operationTables.map(table => db.all(table)), before);
    await request(`/customers/${customer.id}`, 'PATCH', { full_name: 'Updated visitor' }, cookie);
    await request(`/subscriptions/${subscription.id}`, 'PATCH', { status: 'cancelled' }, cookie);
    await request(`/subscription_payments/${payment.id}`, 'PATCH', { amount: 40000 }, cookie);
    await request(`/sessions/${session.id}`, 'PATCH', {
      status: 'completed', exit_time: new Date().toISOString(), time_cost: 2,
    }, cookie);
    for (const [table, record] of [
      ['session_products', consumption], ['subscription_payments', payment],
      ['sessions', session], ['subscriptions', subscription], ['customers', customer],
    ]) {
      await request(`/${table}/${record.id}`, 'DELETE', undefined, cookie, 204);
    }
  }

  await request('/employee/work-sessions', 'POST', {}, employeeCookie, 400);
  const startRequestId = uuid();
  const overlappingStartRequestId = uuid();
  const started = await request('/employee/work-sessions', 'POST', { requestId: startRequestId }, employeeCookie, 201);
  const retryStart = await request('/employee/work-sessions', 'POST', { requestId: startRequestId }, employeeCookie, 200);
  assert.equal(retryStart.value.id, started.value.id);
  const overlappingStart = await request(
    '/employee/work-sessions', 'POST', { requestId: overlappingStartRequestId }, employeeCookie, 200,
  );
  assert.equal(overlappingStart.value.id, started.value.id);
  const otherHistory = await request('/employee/work-sessions', 'GET', undefined, otherCookie);
  assert.equal(otherHistory.value.active, null);
  await request(`/employee/work-sessions/${started.value.id}/end`, 'POST', {}, otherCookie, 404);
  const ended = await request(`/employee/work-sessions/${started.value.id}/end`, 'POST', {}, employeeCookie);
  assert.equal(ended.value.status, 'completed');
  assert.ok(ended.value.end_time);
  assert.ok(ended.value.duration_minutes >= 0);
  const retryEnd = await request(`/employee/work-sessions/${started.value.id}/end`, 'POST', {}, employeeCookie);
  assert.equal(retryEnd.value.end_time, ended.value.end_time);
  const lateRetryStart = await request(
    '/employee/work-sessions', 'POST', { requestId: startRequestId }, employeeCookie,
  );
  assert.equal(lateRetryStart.value.id, started.value.id);
  assert.equal(lateRetryStart.value.status, 'completed');
  const lateOverlappingStart = await request(
    '/employee/work-sessions', 'POST', { requestId: overlappingStartRequestId }, employeeCookie,
  );
  assert.equal(lateOverlappingStart.value.id, started.value.id);
  await request('/employee/work-sessions', 'GET', undefined, undefined, 401);

  const employeeRequestBody = {
    type: 'assistance', title: 'Matériel à vérifier', message: 'La caisse ne répond plus.',
    idempotencyKey: uuid(),
  };
  const employeeRequest = await request('/employee/requests', 'POST', employeeRequestBody, employeeCookie, 201);
  assert.equal(employeeRequest.value.idempotency_key, undefined);
  const repeatedEmployeeRequest = await request('/employee/requests', 'POST', employeeRequestBody, employeeCookie);
  assert.equal(repeatedEmployeeRequest.value.id, employeeRequest.value.id);
  assert.equal(db.all('operational_requests').length, 1);
  await request('/employee/requests', 'POST', {
    type: 'issue', title: ' ', message: 'Invalid submission.', idempotencyKey: uuid(),
  }, employeeCookie, 400);
  assert.equal(db.all('operational_requests').length, 1);
  assert.equal(db.all('notifications').filter(item => item.type === 'operational_request').length, 1);
  assert.equal(db.all('notifications').filter(item => item.type === 'operational_request').length, 1);
  const employeeNotifications = await request('/notifications?state=all', 'GET', undefined, employeeCookie);
  assert.deepEqual(employeeNotifications.value.items, []);
  const adminNotifications = await request('/notifications?state=unread', 'GET', undefined, adminCookie);
  assert.equal(adminNotifications.value.items.filter(item => item.type === 'operational_request').length, 1);
  const adminRequestList = await request('/admin/requests', 'GET', undefined, adminCookie);
  assert.equal(adminRequestList.value.items[0].employee.id, createdUser.id);
  await request('/admin/requests', 'GET', undefined, employeeCookie, 403);
  await request('/admin/notifications', 'POST', {
    recipientId: otherEmployeeId, title: 'Information', message: 'Fermeture à 18 h.',
    priority: 'normal', idempotencyKey: uuid(),
  }, employeeCookie, 403);
  const announcementKey = uuid();
  const announcementBody = {
    recipientId: otherEmployeeId, title: 'Information', message: 'Fermeture à 18 h.',
    priority: 'normal', idempotencyKey: announcementKey,
  };
  const announcement = await request('/admin/notifications', 'POST', announcementBody, adminCookie, 201);
  assert.equal(announcement.value.sent, 1);
  await request('/admin/notifications', 'POST', announcementBody, adminCookie, 201);
  assert.equal(db.all('notifications').filter(item => item.type === 'admin_announcement').length, 1);
  const otherNotifications = await request('/notifications?state=unread', 'GET', undefined, otherCookie);
  const announcementItem = otherNotifications.value.items.find(item => item.type === 'admin_announcement');
  assert.ok(announcementItem);
  await request(`/notifications/${announcementItem.id}/action`, 'PATCH', { action: 'read' }, employeeCookie, 404);
  await request(`/notifications/${announcementItem.id}/action`, 'PATCH', { action: 'read' }, otherCookie);
  const count = await request('/notifications/unread-count', 'GET', undefined, otherCookie);
  assert.equal(count.value.count, 0);
  await request(`/notifications/${announcementItem.id}/action`, 'PATCH', { action: 'unread' }, otherCookie);
  assert.equal((await request('/notifications/unread-count', 'GET', undefined, otherCookie)).value.count, 1);
  await request('/notifications/read-all', 'POST', {}, otherCookie);
  assert.equal((await request('/notifications/unread-count', 'GET', undefined, otherCookie)).value.count, 0);
  const updatedRequest = await request(`/admin/requests/${employeeRequest.value.id}`, 'PATCH', {
    status: 'resolved', response: 'La caisse a été redémarrée.',
  }, adminCookie);
  assert.equal(updatedRequest.value.status, 'resolved');
  assert.equal(db.all('notifications').filter(item => item.type === 'request_update').length, 1);
  const ticketFallback = await request('/notifications/socket-ticket', 'POST', {}, adminCookie);
  assert.equal(ticketFallback.value.mode, 'polling');

  const activeShift = await request('/employee/work-sessions', 'POST', { requestId: uuid() }, employeeCookie, 201);
  await request(`/admin/work-sessions/${activeShift.value.id}/end`, 'POST', {
    reason: 'Unauthorized close attempt.',
  }, employeeCookie, 403);
  await request(`/admin/work-sessions/${activeShift.value.id}/end`, 'POST', {
    reason: 'Employee left unexpectedly.',
  }, adminCookie);
  const audit = db.all('admin_audit_logs').find(row => row.target_id === activeShift.value.id);
  assert.equal(audit.actor_id, adminId);
  assert.equal(audit.reason, 'Employee left unexpectedly.');
  assert.equal(db.all('notifications').filter(item => item.type === 'shift_admin_closed').length, 1);
  const adminShiftHistory = await request(
    `/admin/work-sessions?employeeId=${createdUser.id}&status=completed`, 'GET', undefined, adminCookie,
  );
  const closedShift = adminShiftHistory.value.items.find(shift => shift.id === activeShift.value.id);
  assert.equal(closedShift.employee.id, createdUser.id);
  assert.equal(closedShift.close_reason, 'Employee left unexpectedly.');
  assert.equal(closedShift.closed_by, adminId);
  assert.ok(closedShift.start_time);
  assert.ok(closedShift.end_time);
  assert.ok(closedShift.duration_minutes >= 0);
  await request('/admin/work-sessions', 'GET', undefined, employeeCookie, 403);

  await request(`/admin/employees/${createdUser.id}/status`, 'PATCH', {
    status: 'disabled', reason: 'Contract ended.',
  }, adminCookie);
  assert.equal(db.all('users').find(user => user.id === createdUser.id).status, 'disabled');
  assert.equal(db.all('notifications').filter(item => item.type === 'account_status').length, 1);
  assert.equal(db.all('admin_audit_logs').length, 2);
  await request('/auth/session', 'GET', undefined, employeeCookie, 401);
  await request('/employee/work-sessions', 'GET', undefined, employeeCookie, 401);
});

test('a customer can have only one unfinished active subscription, including future renewals', async t => {
  const db = makeDatabase();
  const employeeId = uuid();
  const token = newToken();
  db.seed('users', { id: employeeId, email: 'subscriptions@example.com', role: 'employee', status: 'active' });
  db.seed('auth_sessions', {
    id: uuid(), token_hash: tokenHash(token), user_id: employeeId,
    expires_at: new Date(Date.now() + 60_000),
  });
  const customerId = uuid();
  const otherCustomerId = uuid();
  const planId = uuid();
  db.seed('customers', { id: customerId, full_name: 'Subscriber' });
  db.seed('customers', { id: otherCustomerId, full_name: 'Other subscriber' });
  db.seed('plans', { id: planId, name: 'Monthly', price: 80, duration_days: 30 });
  const transactionSession = {};
  const lockEvents = [];
  const instrumentedDb = {
    ...db,
    collection(name) {
      const collection = db.collection(name);
      return {
        ...collection,
        async findOneAndUpdate(filter, update, options) {
          if (name === 'customers' && update.$inc?._reference_version) {
            assert.equal(options.session, transactionSession);
            lockEvents.push(filter.id);
          }
          return collection.findOneAndUpdate(filter, update, options);
        },
        async findOne(filter, options) {
          if (name === 'subscriptions' && filter.end_date) {
            assert.equal(options.session, transactionSession);
            assert.equal(lockEvents.at(-1), filter.customer_id, 'Acquire the customer write lock before checking conflicts.');
          }
          return collection.findOne(filter, options);
        },
      };
    },
  };
  const client = {
    withSession: callback => callback(Object.assign(transactionSession, { withTransaction: operation => operation() })),
  };
  const app = await createApp({ db: instrumentedDb, client, serverless: true, serveFrontend: false });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const date = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const base = `http://127.0.0.1:${server.address().port}/api/subscriptions`;
  const request = async (suffix, method, body, expected) => {
    const response = await fetch(`${base}${suffix}`, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: `co_manager_session=${token}` },
      body: JSON.stringify(body),
    });
    const value = await response.json();
    assert.equal(response.status, expected, JSON.stringify(value));
    if (expected === 409) assert.match(value.message, /possède déjà un abonnement en cours/);
    return value;
  };
  const input = {
    customer_id: customerId, plan_id: planId, start_date: date(-30), end_date: date(0),
  };
  const first = await request('', 'POST', input, 201);
  await request('', 'POST', input, 409);
  await request('', 'POST', { ...input, start_date: date(1), end_date: date(31) }, 409);
  assert.equal(db.all('subscriptions').length, 1);
  await request(`/${first.id}`, 'PATCH', { plan_id: planId }, 200);

  const other = await request('', 'POST', { ...input, customer_id: otherCustomerId }, 201);
  await request(`/${other.id}`, 'PATCH', { customer_id: customerId }, 409);
  assert.equal(db.all('subscriptions').find(row => row.id === other.id).customer_id, otherCustomerId);
  await request(`/${first.id}`, 'PATCH', { status: 'cancelled' }, 200);
  const future = await request('', 'POST', { ...input, start_date: date(1), end_date: date(31) }, 201);
  await request('', 'POST', { ...input, start_date: date(32), end_date: date(62) }, 409);
  await request(`/${first.id}`, 'PATCH', { status: 'active' }, 409);
  assert.equal(db.all('subscriptions').find(row => row.id === first.id).status, 'cancelled');
  await request(`/${future.id}`, 'PATCH', { status: 'expired' }, 200);
  await request(`/${first.id}`, 'PATCH', { status: 'active' }, 200);

  const historical = await request('', 'POST', { ...input, end_date: date(-1) }, 201);
  await request(`/${historical.id}`, 'PATCH', { end_date: date(30) }, 409);
  assert.equal(db.all('subscriptions').find(row => row.id === historical.id).end_date, date(-1));
  await request(`/${first.id}`, 'PATCH', { end_date: date(-1) }, 200);
  const renewed = await request('', 'POST', { ...input, start_date: date(0), end_date: date(30) }, 201);
  assert.equal(renewed.status, 'active');
  await request(`/${renewed.id}`, 'PATCH', { status: 'cancelled' }, 200);
  await request(`/${future.id}`, 'PATCH', { status: 'active' }, 200);
});
