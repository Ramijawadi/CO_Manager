import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { connectDatabase, closeDatabase } from '../server/db.mjs';
import { hashPassword } from '../server/auth.mjs';

test('live MongoDB authentication, CRUD, reports, cascades and change streams', {
  skip: process.env.RUN_MONGODB_LIVE_TESTS !== '1',
  timeout: 120_000,
}, async () => {
  assert.ok(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD, 'Private admin credentials are required.');
  const base = process.env.API_URL || 'http://localhost:3001';
  const { db } = await connectDatabase();
  const created = new Map();
  const cookies = [];
  const tag = randomUUID();
  let cookie;
  let streamReader;
  const streamController = new AbortController();
  const remember = (table, row) => {
    const ids = created.get(table) || [];
    ids.push(row.id);
    created.set(table, ids);
    return row;
  };
  const request = async (path, method = 'GET', body, auth = cookie, expected = 200) => {
    const response = await fetch(`${base}/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', Origin: base, ...(auth ? { Cookie: auth } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status !== expected) {
      assert.fail(`${method} ${path}: expected ${expected}, got ${response.status}: ${await response.text()}`);
    }
    return response.status === 204 ? null : response.json();
  };
  const login = async (email, password) => {
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ email, password }),
    });
    assert.equal(response.status, 200);
    const value = response.headers.get('set-cookie');
    assert.match(value, /HttpOnly/i);
    assert.match(value, /SameSite=Strict/i);
    const tokenCookie = value.split(';')[0];
    cookies.push(tokenCookie);
    return { cookie: tokenCookie, session: await response.json() };
  };
  const cleanup = async () => {
    const errors = [];
    if (streamReader) {
      try {
        await streamReader.cancel();
      } catch (error) {
        if (error.name !== 'AbortError') errors.push(error);
      }
    }
    streamController.abort();
    const results = await Promise.allSettled([
      ...cookies.map(async tokenCookie => {
        const response = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Cookie: tokenCookie, Origin: base } });
        assert.ok([204, 401].includes(response.status), 'Test authentication session cleanup failed.');
      }),
      ...[...created].map(([table, ids]) => db.collection(table).deleteMany({ id: { $in: ids } })),
    ]);
    errors.push(...results.filter(result => result.status === 'rejected').map(result => result.reason));
    await closeDatabase();
    if (errors.length) throw new AggregateError(errors, 'Live test cleanup failed.');
  };

  try {
    await request('/customers', 'GET', undefined, null, 401);
    await request('/auth/login', 'POST', { email: process.env.ADMIN_EMAIL, password: `wrong-${tag}` }, null, 401);
    const admin = await login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
    cookie = admin.cookie;
    assert.equal(admin.session.user.role, 'admin');
    assert.equal(Object.hasOwn(admin.session.user, 'password_hash'), false);
    assert.deepEqual(await request('/auth/session'), admin.session);
    assert.equal((await request('/health')).status, 'ok');

    const crossOrigin = await fetch(`${base}/api/customers`, {
      method: 'POST', headers: { Cookie: cookie, Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: 'Denied' }),
    });
    assert.equal(crossOrigin.status, 403);
    await request('/users', 'GET', undefined, cookie, 404);
    await request('/customers', 'POST', { full_name: { $ne: null } }, cookie, 400);
    await request('/subscriptions', 'POST', {
      customer_id: randomUUID(), plan_id: 'plan-mensuel', start_date: '2026-01-01', end_date: '2026-01-31',
    }, cookie, 400);
    await request('/sessions', 'POST', { customer_id: randomUUID() }, cookie, 400);

    const streamResponse = await fetch(`${base}/api/events`, {
      headers: { Cookie: cookie }, signal: streamController.signal,
    });
    assert.equal(streamResponse.status, 200);
    streamReader = streamResponse.body.getReader();
    const initialEvent = await streamReader.read();
    assert.match(new TextDecoder().decode(initialEvent.value), /event: ready/);

    const customer = remember('customers', await request('/customers', 'POST', {
      full_name: `MongoDB test ${tag}`, email: `test-${tag}@example.com`, phone: '123', notes: 'Temporary',
    }, cookie, 201));
    const customerUpdate = await request(`/customers/${customer.id}`, 'PATCH', { full_name: `Updated ${tag}` });
    assert.equal(customerUpdate.email, customer.email);
    await request('/customers', 'POST', { full_name: 'Duplicate', email: customer.email }, cookie, 409);
    const product = remember('products', await request('/products', 'POST', {
      name: `Coffee ${tag}`, description: '', price: 2, stock: 10,
    }, cookie, 201));
    const plan = remember('plans', await request('/plans', 'POST', {
      name: `Plan ${tag}`, price: 25, duration_days: 7,
    }, cookie, 201));
    assert.equal((await request(`/products/${product.id}`, 'PATCH', { stock: 9 })).price, 2);
    assert.equal((await request(`/plans/${plan.id}`, 'PATCH', { price: 30 })).duration_days, 7);
    const today = new Date().toISOString().slice(0, 10);
    const subscription = remember('subscriptions', await request('/subscriptions', 'POST', {
      customer_id: customer.id, plan_id: plan.id, start_date: today, end_date: today,
    }, cookie, 201));
    assert.equal(subscription.status, 'active');
    await request(`/subscriptions/${subscription.id}`, 'PATCH', { end_date: '2000-01-01' }, cookie, 400);
    const active = await request(`/subscriptions?customer_id=${customer.id}&status=active&active_on=${today}&limit=1`);
    assert.equal(active[0].plans.id, plan.id);
    assert.equal(active[0].customers.email, customer.email);
    await request(`/subscriptions/${subscription.id}`, 'PATCH', { status: 'cancelled' });
    assert.equal((await request(`/subscriptions?customer_id=${customer.id}&status=active&active_on=${today}`)).length, 0);
    await request(`/subscriptions/${subscription.id}`, 'PATCH', { status: 'active' });

    const session = remember('sessions', await request('/sessions', 'POST', { customer_id: customer.id }, cookie, 201));
    assert.equal(session.time_cost, null);
    const item = remember('session_products', await request('/session_products', 'POST', {
      session_id: session.id, product_id: product.id, quantity: 2, total_price: 4,
    }, cookie, 201));
    const activeSessions = await request('/sessions?status=active');
    const joined = activeSessions.find(row => row.id === session.id);
    assert.equal(joined.customers.full_name, customerUpdate.full_name);
    assert.equal(joined.session_products[0].products.name, product.name);
    await request(`/sessions/${session.id}`, 'PATCH', { status: 'completed', exit_time: new Date().toISOString(), time_cost: -1 }, cookie, 400);
    const checkout = await request(`/sessions/${session.id}`, 'PATCH', {
      status: 'completed', exit_time: new Date().toISOString(), time_cost: 10.5,
    });
    assert.equal(checkout.time_cost, 10.5);
    await request(`/sessions/${session.id}`, 'PATCH', {
      status: 'completed', exit_time: new Date().toISOString(), time_cost: 10.5,
    }, cookie, 400);
    const report = await request(`/sessions?start=${today}&end=${today}`);
    assert.equal(report.find(row => row.id === session.id).session_products[0].total_price, 4);
    const dashboard = await request(`/dashboard/data?since=${today}T00%3A00%3A00.000Z&active_on=${today}`);
    assert.equal(dashboard.sessions.find(row => row.id === session.id).time_cost, 10.5);
    assert.equal(dashboard.session_products.find(row => row.id === item.id).quantity, 2);
    assert.ok(dashboard.activeSubscriptions >= 1);
    assert.equal(typeof (await request('/settings?limit=1'))[0].hourly_rate, 'number');

    const date = `${2200 + Math.floor(Math.random() * 500)}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')}`;
    assert.equal(await db.collection('daily_closures').countDocuments({ closure_date: date }), 0, 'Test date must not overwrite existing data.');
    const closure = remember('daily_closures', await request('/daily_closures', 'POST', {
      closure_date: date, total_visitors: 1, total_revenue: 14.5, product_sales: 4, time_revenue: 10.5,
    }, cookie, 201));
    const updatedClosure = await request('/daily_closures', 'POST', {
      closure_date: date, total_visitors: 2, total_revenue: 16.5, product_sales: 6, time_revenue: 10.5,
    }, cookie, 201);
    assert.equal(updatedClosure.id, closure.id);
    assert.equal(await db.collection('daily_closures').countDocuments({ closure_date: date }), 1);

    const demo = remember('users', {
      id: randomUUID(), email: `demo-${tag}@example.com`, password_hash: await hashPassword(tag), role: 'demo',
    });
    await db.collection('users').insertOne({ ...demo, created_at: new Date().toISOString() });
    const demoLogin = await login(demo.email, tag);
    assert.equal(demoLogin.session.user.role, 'demo');
    await request('/plans', 'GET', undefined, demoLogin.cookie);
    await request('/customers', 'POST', { full_name: 'Denied' }, demoLogin.cookie, 403);
    await request(`/products/${product.id}`, 'PATCH', { price: 100 }, demoLogin.cookie, 403);
    await request(`/plans/${plan.id}`, 'DELETE', undefined, demoLogin.cookie, 403);

    const deadline = Date.now() + 10_000;
    let sawSessionEvent = false;
    const eventTimeout = setTimeout(() => streamController.abort(), 10_000);
    try {
      while (!sawSessionEvent && Date.now() < deadline) {
        const event = await streamReader.read();
        if (event.done) break;
        sawSessionEvent = new TextDecoder().decode(event.value).includes('"table":"sessions"');
      }
    } finally {
      clearTimeout(eventTimeout);
    }
    assert.equal(sawSessionEvent, true, 'MongoDB writes must reach authenticated SSE clients.');

    await request(`/plans/${plan.id}`, 'DELETE', undefined, cookie, 204);
    assert.equal((await request(`/subscriptions?customer_id=${customer.id}`))[0].plan_id, null);
    await request(`/products/${product.id}`, 'DELETE', undefined, cookie, 204);
    assert.equal((await request(`/sessions?start=${today}&end=${today}`)).find(row => row.id === session.id).session_products.length, 0);
    await request(`/customers/${customer.id}`, 'DELETE', undefined, cookie, 204);
    assert.equal(await db.collection('sessions').countDocuments({ id: session.id }), 0);
    assert.equal(await db.collection('subscriptions').countDocuments({ id: subscription.id }), 0);
    assert.equal(await db.collection('session_products').countDocuments({ id: item.id }), 0);
    await request('/auth/logout', 'POST', undefined, cookie, 204);
    await request('/auth/session', 'GET', undefined, cookie, 401);
    console.log('Live workflow passed; temporary business records are being removed.');
  } finally {
    await cleanup();
  }
});
