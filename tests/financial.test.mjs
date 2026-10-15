import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { createApp } from '../server/app.mjs';
import { getFinancialYear, summarizeFinancialYear } from '../server/financial.mjs';
import { schemas } from '../server/validation.mjs';
import { initializeDatabase } from '../server/schema.mjs';

const id = '12345678-1234-1234-1234-123456789abc';
const payment = { subscription_id: id, amount: 40001, payment_date: '2026-10-14', notes: 'Installment' };

test('payment schemas permit installments but reject invalid amounts, dates and reassignment', () => {
  assert.deepEqual(schemas.subscription_payments.create.parse(payment), payment);
  assert.deepEqual(schemas.subscription_payments.update.parse({ amount: 1001, notes: '' }), { amount: 1001, notes: '' });
  for (const amount of [0, -1, 0.5, Infinity, NaN, '40', 1_000_000_000_001]) {
    assert.throws(() => schemas.subscription_payments.create.parse({ ...payment, amount }));
  }
  for (const invalid of [{ payment_date: '2026-02-30' }, { customer_name: 'Override' }, { subscription_id: null }]) {
    assert.throws(() => schemas.subscription_payments.create.parse({ ...payment, ...invalid }));
  }
  assert.throws(() => schemas.subscription_payments.update.parse({ subscription_id: id }));
});

test('monthly/yearly totals include all income sources, losses, empty months and installments in millimes', () => {
  const result = summarizeFinancialYear(2026, {
    time_income: [{ _id: '2026-01', total: 10001 }],
    product_income: [{ _id: '2026-01', total: 1500 }, { _id: '2026-12', total: 1 }],
    subscription_income: [{ _id: '2026-01', total: 80002 }],
    expenses: [{ _id: '2026-01', total: 50000 }, { _id: '2026-02', total: 200000 }],
  });
  assert.equal(result.months.length, 12);
  assert.deepEqual(result.months[0], {
    month: '2026-01', time_income: 10001, product_income: 1500, subscription_income: 80002,
    expenses: 50000, income: 91503, net: 41503,
  });
  assert.equal(result.months[1].net, -200000);
  assert.equal(result.months[2].net, 0);
  assert.equal(result.months[11].net, 1);
  assert.deepEqual(result.totals, {
    time_income: 10001, product_income: 1501, subscription_income: 80002,
    expenses: 250000, income: 91504, net: -158496,
  });
  assert.deepEqual(summarizeFinancialYear(2024, {}).months.map(row => row.month),
    Array.from({ length: 12 }, (_, i) => `2024-${String(i + 1).padStart(2, '0')}`));
  assert.throws(() => summarizeFinancialYear(2026, { expenses: [{ _id: '2025-12', total: 1 }] }));
  assert.throws(() => summarizeFinancialYear(2026, { expenses: [{ _id: '2026-01', total: 0.5 }] }));
  assert.throws(() => summarizeFinancialYear(2026, {
    expenses: [{ _id: '2026-01', total: Number.MAX_SAFE_INTEGER }, { _id: '2026-02', total: 1 }],
  }), /supported amount/);
});

function reportingDatabase() {
  const calls = [];
  const fixtures = {
    sessions: [
      { status: 'completed', entry_time: '2025-12-30T10:00:00.000Z', exit_time: '2025-12-31T23:00:00.000Z', time_cost: 1.001 },
      { status: 'completed', exit_time: '2026-01-31T23:00:00.000Z', time_cost: 2.0005 },
      { status: 'completed', exit_time: '2026-12-31T22:59:59.999Z', time_cost: 3 },
      { status: 'completed', exit_time: '2026-12-31T23:00:00.000Z', time_cost: 100 },
      { status: 'completed', exit_time: '2025-12-31T22:59:59.999Z', time_cost: 100 },
      { status: 'active', exit_time: '2026-01-01T12:00:00.000Z', time_cost: 100 },
      { status: 'cancelled', exit_time: '2026-01-01T12:00:00.000Z', time_cost: 100 },
    ],
    session_products: [
      { created_at: '2026-01-31T23:00:00.000Z', total_price: 1500 },
      { created_at: '2026-12-31T23:00:00.000Z', total_price: 9999 },
    ],
    subscription_payments: [
      { payment_date: '2026-02-01', amount: 40001 },
      { payment_date: '2026-02-15', amount: 40001 },
      { payment_date: '2025-12-31', amount: 99999 },
      { payment_date: '2027-01-01', amount: 99999 },
    ],
    expenses: [
      { expense_date: '2026-02-01', amount: 100000 },
      { expense_date: '2026-12-31', amount: 5000 },
      { expense_date: '2027-01-01', amount: 99999 },
    ],
  };
  return {
    calls,
    db: { collection: name => ({
      aggregate: pipeline => {
        calls.push({ name, pipeline });
        const [{ $match: match }, { $group: group }] = pipeline;
        const field = Object.keys(match).find(key => key !== 'status');
        const groups = new Map();
        const timestamp = Object.hasOwn(group._id, '$dateToString');
        for (const row of fixtures[name]) {
          if (match.status && row.status !== match.status) continue;
          if (row[field] < match[field].$gte || row[field] >= match[field].$lt) continue;
          const month = timestamp
            ? new Date(Date.parse(row[field]) + 3600000).toISOString().slice(0, 7)
            : row[field].slice(0, 7);
          const amount = name === 'sessions' ? Math.round(row.time_cost * 1000)
            : name === 'session_products' ? row.total_price : row.amount;
          groups.set(month, (groups.get(month) ?? 0) + amount);
        }
        return { toArray: async () => [...groups].map(([_id, total]) => ({ _id, total })) };
      },
    }) },
  };
}

test('financial aggregation uses checkout dates, Tunisia boundaries and excludes archives and plan prices', async () => {
  const { db, calls } = reportingDatabase();
  const result = await getFinancialYear(db, 2026);
  assert.equal(result.months[0].time_income, 1001);
  assert.equal(result.months[1].time_income, 2001);
  assert.equal(result.months[1].product_income, 1500);
  assert.equal(result.months[1].subscription_income, 80002);
  assert.equal(result.months[1].net, -16497);
  assert.equal(result.months[11].net, -2000);
  assert.equal(result.totals.net, -17496);
  assert.deepEqual(calls.map(call => call.name), ['sessions', 'session_products', 'subscription_payments', 'expenses']);
  const sessionPipeline = calls[0].pipeline;
  assert.deepEqual(sessionPipeline[0], { $match: { status: 'completed', exit_time: {
    $gte: '2025-12-31T23:00:00.000Z', $lt: '2026-12-31T23:00:00.000Z',
  } } });
  assert.deepEqual(sessionPipeline[1].$group._id, { $dateToString: {
    format: '%Y-%m', date: { $toDate: '$exit_time' }, timezone: 'Africa/Tunis',
  } });
  assert.deepEqual(sessionPipeline[1].$group.total, {
    $sum: { $floor: { $add: [{ $multiply: ['$time_cost', 1000] }, 0.5] } },
  });
  assert.deepEqual(calls[1].pipeline[1].$group.total, { $sum: '$total_price' });
  assert.deepEqual(calls[2].pipeline[0].$match.payment_date, { $gte: '2026-01-01', $lt: '2027-01-01' });
  assert.deepEqual(calls[3].pipeline[1].$group._id, { $substrBytes: ['$expense_date', 0, 7] });
});

async function startApp(db, t) {
  const client = { withSession: callback => callback({ withTransaction: callback => callback() }) };
  const app = await createApp({ db, client, serverless: true, serveFrontend: false });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  return async (path, method = 'GET', body, expected = 200, auth = true) => {
    const response = await fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(auth ? { Cookie: `co_manager_session=${'a'.repeat(64)}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = response.status === 204 ? null : await response.json();
    assert.equal(response.status, expected, JSON.stringify(result));
    return result;
  };
}

test('financial endpoint requires an admin, validates year and returns all twelve months', async t => {
  let role = 'admin';
  const reporting = reportingDatabase();
  const request = await startApp({ collection: name => {
    if (name === 'auth_sessions') return { findOne: async () => ({ user_id: id }) };
    if (name === 'users') return { findOne: async () => ({ id, email: 'test@example.com', role }) };
    return reporting.db.collection(name);
  } }, t);
  const path = '/reports/financial?year=2026';
  await request(path, 'GET', undefined, 401, false);
  const report = await request(path);
  assert.equal(report.year, 2026);
  assert.equal(report.months.length, 12);
  assert.equal(report.totals.net, -17496);
  for (const query of ['year=bad', 'year=1999', 'year=9999', 'year=2026.5', '', 'year=2026&unknown=1', 'year=2026&year=2027']) {
    await request(`/reports/financial?${query}`, 'GET', undefined, 400);
  }
  for (role of ['staff', 'demo']) await request(path, 'GET', undefined, 403);
});

test('payment CRUD supports installments, snapshots names and retains income after subscription deletion', async t => {
  let role = 'admin';
  const rows = new Map();
  const subscription = { id, customer_id: id, plan_id: id };
  const db = { collection: name => {
    if (name === 'auth_sessions') return { findOne: async () => ({ user_id: id }) };
    if (name === 'users') return { findOne: async () => ({ id, email: 'test@example.com', role }) };
    if (name === 'customers') return { findOne: async () => ({ id, full_name: 'Saved customer' }) };
    if (name === 'plans') return { findOne: async () => ({ id, name: 'Saved plan', price: 80 }) };
    if (name === 'subscriptions') return {
      findOne: async () => subscription,
      findOneAndUpdate: async filter => filter.id === id ? subscription : null,
      deleteOne: async () => {},
    };
    assert.equal(name, 'subscription_payments');
    return {
      find: () => ({ sort() { return this; }, toArray: async () => [...rows.values()] }),
      findOne: async filter => rows.get(filter.id),
      insertOne: async row => { rows.set(row.id, { ...row }); },
      findOneAndUpdate: async (filter, { $set }) => {
        const row = { ...rows.get(filter.id), ...$set };
        rows.set(filter.id, row);
        return row;
      },
      updateMany: async (filter, { $set }) => {
        for (const row of rows.values()) if (row.subscription_id === filter.subscription_id) Object.assign(row, $set);
      },
      deleteOne: async filter => { rows.delete(filter.id); },
    };
  } };
  const request = await startApp(db, t);
  await request('/subscription_payments', 'POST', { ...payment, subscription_id: '87654321-4321-4321-4321-cba987654321' }, 400);
  const first = await request('/subscription_payments', 'POST', payment, 201);
  const second = await request('/subscription_payments', 'POST', { ...payment, payment_date: '2026-11-14' }, 201);
  assert.notEqual(first.id, second.id);
  assert.equal(first.customer_name, 'Saved customer');
  assert.equal(first.plan_name, 'Saved plan');
  assert.equal(first.amount, 40001);
  assert.equal((await request('/subscription_payments')).length, 2);
  const updated = await request(`/subscription_payments/${first.id}`, 'PATCH', { amount: 30001, notes: '' });
  assert.equal(updated.customer_name, first.customer_name);
  assert.equal(updated.notes, '');
  await request(`/subscription_payments/${first.id}`, 'PATCH', { subscription_id: id }, 400);
  await request(`/subscription_payments/${first.id}`, 'PATCH', {}, 400);
  role = 'demo';
  await request('/subscription_payments', 'POST', payment, 403);
  await request(`/subscription_payments/${first.id}`, 'PATCH', { amount: 1 }, 403);
  await request(`/subscription_payments/${first.id}`, 'DELETE', undefined, 403);
  role = 'staff';
  await request(`/subscriptions/${id}`, 'DELETE', undefined, 204);
  assert.equal((await request('/subscription_payments'))[0].subscription_id, null);
  const detached = await request(`/subscription_payments/${first.id}`, 'PATCH', { amount: 25001 });
  assert.equal(detached.subscription_id, null);
  assert.equal(detached.plan_name, 'Saved plan');
  assert.equal(detached.amount, 25001);
  await request(`/subscription_payments/${first.id}`, 'DELETE', undefined, 204);
  await request(`/subscription_payments/${first.id}`, 'DELETE', undefined, 404);
  assert.equal((await request('/subscription_payments')).length, 1);
});

test('database setup validates payments and creates reporting and reference indexes', async () => {
  const collections = new Map();
  const indexes = [];
  await initializeDatabase({
    listCollections: () => ({ toArray: async () => [] }),
    createCollection: async (name, options) => collections.set(name, options),
    collection: name => ({
      createIndex: async (key, options) => indexes.push({ name, key, options }),
      updateOne: async () => {},
    }),
  });
  const schema = collections.get('subscription_payments').validator.$jsonSchema;
  assert.ok(schema.required.includes('amount'));
  assert.ok(schema.required.includes('payment_date'));
  assert.equal(schema.properties.amount.multipleOf, 1);
  assert.deepEqual(schema.properties.subscription_id.bsonType, ['string', 'null']);
  assert.ok(indexes.some(index => index.name === 'subscription_payments' && index.key.subscription_id === 1));
  assert.ok(indexes.some(index => index.name === 'subscription_payments' && index.key.payment_date === -1));
  assert.ok(indexes.some(index => index.name === 'sessions' && index.key.exit_time === -1 && index.key.status === 1));
});

function loadModule(path, dependencies = {}) {
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
  });
  const exports = {};
  new Function('require', 'exports', outputText)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}

test('financial frontend preserves negative balances and payment API converts millimes exactly once', async () => {
  const report = summarizeFinancialYear(2026, {
    subscription_income: [{ _id: '2026-10', total: 40001 }], expenses: [{ _id: '2026-10', total: 50000 }],
  });
  const requests = [];
  const dependency = {
    apiRequest: async (path, options = {}) => {
      requests.push({ path, ...options });
      if (path.startsWith('/reports/financial')) return report;
      const row = { ...payment, id, customer_name: 'Customer', plan_name: 'Plan' };
      return options.method ? { ...row, ...(options.body ? JSON.parse(options.body) : {}) } : [row];
    },
    jsonBody: JSON.stringify,
  };
  const financial = loadModule('features/reports/financialApi.ts', { '../../lib/api': dependency });
  const result = await financial.getFinancialReport(2026);
  assert.equal(result.totals.net, -9.999);
  assert.equal(result.months[9].subscription_income, 40.001);
  assert.equal(requests[0].path, '/reports/financial?year=2026');
  const payments = loadModule('features/subscriptions/paymentsApi.ts', {
    '../../lib/api': dependency, '../../lib/productMoney': loadModule('lib/productMoney.ts'),
  });
  assert.equal((await payments.getSubscriptionPayments())[0].amount, 40.001);
  assert.equal((await payments.createSubscriptionPayment({ ...payment, amount: 0.001 })).amount, 0.001);
  assert.equal(JSON.parse(requests.at(-1).body).amount, 1);
  await payments.updateSubscriptionPayment(id, { amount: 1.001 });
  assert.equal(JSON.parse(requests.at(-1).body).amount, 1001);
  await payments.updateSubscriptionPayment(id, { notes: '' });
  assert.deepEqual(JSON.parse(requests.at(-1).body), { notes: '' });
  await payments.deleteSubscriptionPayment(id);
  assert.equal(requests.at(-1).method, 'DELETE');
});
