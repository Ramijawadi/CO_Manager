import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const planId = '12345678-1234-1234-1234-123456789abc';
const plan = { id: planId, name: 'Mensuel', duration_days: 30, price: 80, created_at: '' };
const input = {
  customer_id: '87654321-4321-4321-4321-cba987654321',
  plan_id: planId, start_date: '2026-10-03', end_date: '2026-11-02',
};

function loadApi(relativePath, dependencies) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
  });
  const exports = {};
  const require = name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  };
  new Function('require', 'exports', outputText)(require, exports);
  return exports;
}

function mockApi(result, error) {
  const calls = [];
  const dependency = {
    apiRequest: async (...args) => { calls.push(args); if (error) throw error; return result; },
    jsonBody: JSON.stringify,
  };
  return { calls, dependency };
}
const loadPlans = api => loadApi('../src/features/plans/api.ts', { '../../lib/api': api.dependency });
const loadSubscriptions = api => loadApi('../src/features/subscriptions/api.ts', {
  '../../lib/api': api.dependency, '../../utils/uuid': loadApi('../src/utils/uuid.ts', {}),
});

test('plans retain canonical saved UUIDs and use the MongoDB API', async () => {
  const api = mockApi([plan]);
  assert.deepEqual(await loadPlans(api).getPlans(), [plan]);
  assert.deepEqual(api.calls, [['/plans']]);
});
test('an empty database does not generate selectable placeholder plans', async () => {
  assert.deepEqual(await loadPlans(mockApi([])).getPlans(), []);
});
test('plan reads propagate network and permission errors instead of placeholders', async () => {
  for (const message of ['Failed to fetch', 'Permission denied']) {
    await assert.rejects(loadPlans(mockApi(null, new Error(message))).getPlans(), { message });
  }
});
test('failed plan writes do not report in-memory success', async () => {
  const api = loadPlans(mockApi(null, new Error('Permission denied')));
  await assert.rejects(api.createPlan({ name: 'Mensuel', duration_days: 30, price: 80 }), /Permission denied/);
  await assert.rejects(api.updatePlan(planId, { price: 90 }), /Permission denied/);
  await assert.rejects(api.deletePlan(planId), /Permission denied/);
});
test('plan writes use server endpoints and exact JSON payloads', async () => {
  const mock = mockApi();
  const api = loadPlans(mock);
  await api.createPlan({ name: 'Journalier', duration_days: 1, price: 5 });
  await api.updatePlan(planId, { price: 90 });
  await api.deletePlan(planId);
  assert.deepEqual(mock.calls, [
    ['/plans', { method: 'POST', body: JSON.stringify({ name: 'Journalier', duration_days: 1, price: 5 }) }],
    [`/plans/${planId}`, { method: 'PATCH', body: '{"price":90}' }],
    [`/plans/${planId}`, { method: 'DELETE' }],
  ]);
});
test('placeholder plan IDs are rejected before subscription creation or editing', async () => {
  const mock = mockApi();
  const api = loadSubscriptions(mock);
  for (const id of ['plan-mensuel', 'plan-hebdomadaire', 'plan-journalier', '']) {
    await assert.rejects(api.createSubscription({ ...input, plan_id: id }), /Invalid subscription plan/);
    await assert.rejects(api.updateSubscription(planId, { plan_id: id }), /Invalid subscription plan/);
  }
  assert.equal(mock.calls.length, 0);
});
test('subscription creation preserves saved UUIDs, dates and default active status', async () => {
  const saved = { ...input, id: planId, status: 'active' };
  const mock = mockApi(saved);
  assert.deepEqual(await loadSubscriptions(mock).createSubscription(input), saved);
  assert.deepEqual(JSON.parse(mock.calls[0][1].body), { ...input, status: 'active' });
});
test('cancellation still works without a plan ID', async () => {
  const saved = { ...input, id: planId, status: 'cancelled' };
  const mock = mockApi(saved);
  assert.deepEqual(await loadSubscriptions(mock).updateSubscription(planId, { status: 'cancelled' }), saved);
  assert.deepEqual(mock.calls[0], [`/subscriptions/${planId}`, { method: 'PATCH', body: '{"status":"cancelled"}' }]);
});
test('editing accepts a saved plan UUID and propagates server failures', async () => {
  const mock = mockApi(input);
  assert.deepEqual(await loadSubscriptions(mock).updateSubscription(planId, { plan_id: planId }), input);
  await assert.rejects(loadSubscriptions(mockApi(null, new Error('Database unavailable'))).createSubscription(input), /Database unavailable/);
});
test('active subscriptions are constrained to both ends of the date range', async () => {
  const mock = mockApi([input]);
  assert.deepEqual(await loadSubscriptions(mock).getActiveSubscription(input.customer_id), input);
  const query = new URL(`http://localhost${mock.calls[0][0]}`).searchParams;
  assert.equal(query.get('active_on'), new Date().toISOString().slice(0, 10));
  assert.equal(query.get('status'), 'active');
  assert.equal(query.get('customer_id'), input.customer_id);
  assert.equal(await loadSubscriptions(mockApi([])).getActiveSubscription(input.customer_id), null);
});
