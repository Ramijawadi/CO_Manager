import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { createInstance } from 'i18next';
import dayjs from 'dayjs';
import * as jsxRuntime from 'react/jsx-runtime';

const planId = '12345678-1234-1234-1234-123456789abc';
const plan = { id: planId, name: 'Mensuel', duration_days: 30, price: 80, created_at: '' };
const input = {
  customer_id: '87654321-4321-4321-4321-cba987654321',
  plan_id: planId, start_date: '2026-10-03', end_date: '2026-11-02',
};

function loadApi(relativePath, dependencies) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX },
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

function subscriptionForm(subscriptions, query = {}, initialValues) {
  const errors = [];
  const submissions = [];
  const customer = { id: input.customer_id, full_name: 'Subscriber' };
  const form = {
    setFields: fields => errors.push(...fields),
    submit() {},
  };
  const { default: Component } = loadApi('../src/features/subscriptions/SubscriptionForm.tsx', {
    react: { useEffect() {} },
    'react/jsx-runtime': jsxRuntime,
    antd: {
      Alert: 'alert', Button: 'button', Modal: 'modal', Select: 'select', DatePicker: 'date-picker',
      Form: Object.assign('form', { useForm: () => [form], useWatch: () => planId, Item: 'form-item' }),
    },
    '@tanstack/react-query': {
      useQuery: ({ queryKey, enabled }) => {
        if (queryKey[0] === 'plans') return { data: [plan], isFetching: false };
        assert.equal(enabled, true);
        return { data: subscriptions, isPending: false, isFetching: false, ...query };
      },
    },
    '../plans/api': {},
    './api': {},
    dayjs: { default: dayjs },
    '../../utils/uuid': loadApi('../src/utils/uuid.ts', {}),
    '../../i18n': { getNumberLocale: () => 'fr-TN' },
    '../expenses/types': { formatExpenseAmount: String },
    '../plans/labels': { translatePlanName: name => name },
    'react-i18next': { useTranslation: () => ({ t: text => text, i18n: { resolvedLanguage: 'fr' } }) },
  });
  const modal = Component({
    open: true, customers: [customer], initialValues,
    onSubmit: values => submissions.push(values),
  });
  const fields = modal.props.children.find(child => child?.props?.form === form);
  const select = fields.props.children[0].props.children;
  return {
    modal, select, errors, submissions,
    submit: () => fields.props.onFinish({ customer_id: customer.id, plan_id: planId, start_date: dayjs() }),
  };
}

test('subscription form blocks ongoing and future subscriptions, including same-day expiry', () => {
  const today = new Date().toISOString().slice(0, 10);
  for (const [startDate, endDate] of [[today, today], ['2999-01-01', '2999-01-31']]) {
    const form = subscriptionForm([{
      ...input, id: 'existing-subscription', status: 'active', start_date: startDate, end_date: endDate,
    }]);
    assert.equal(form.select.props.options[0].disabled, true);
    assert.match(form.select.props.options[0].label, /Abonnement en cours/);
    form.submit();
    assert.equal(form.submissions.length, 0);
    assert.match(form.errors[0].errors[0], /possède déjà un abonnement en cours/);
  }
});

test('subscription form permits expired history, cancelled subscriptions, other customers and self-edits', () => {
  const current = { ...input, id: 'current-subscription', status: 'active', end_date: '2999-01-31' };
  for (const [subscriptions, initialValues] of [
    [[], undefined],
    [[{ ...current, end_date: '2000-01-01' }], undefined],
    [[{ ...current, status: 'cancelled' }], undefined],
    [[{ ...current, status: 'expired' }], undefined],
    [[{ ...current, customer_id: planId }], undefined],
    [[current], current],
  ]) {
    const form = subscriptionForm(subscriptions, {}, initialValues);
    assert.equal(form.select.props.options[0].disabled, false);
    form.submit();
    assert.equal(form.submissions.length, 1);
    assert.deepEqual(form.errors, []);
  }
});

test('subscription form cannot submit when ongoing subscriptions cannot be verified', () => {
  for (const query of [
    { isPending: true }, { isFetching: true }, { error: new Error('Database unavailable') },
  ]) {
    const form = subscriptionForm([], query);
    assert.equal(form.modal.props.okButtonProps.disabled, true);
    assert.equal(form.select.props.disabled, true);
    form.submit();
    assert.equal(form.submissions.length, 0);
    assert.equal(form.errors[0].errors[0], 'Impossible de vérifier les abonnements en cours');
    if (query.error) {
      const alert = form.modal.props.children.find(child => child?.props?.type === 'error');
      assert.equal(alert.props.description, query.error.message);
      assert.ok(alert.props.action);
    }
  }
});

test('standard subscription names translate in Arabic without changing saved names', async () => {
  let resources;
  const setup = {
    use() { return this; },
    init(options) { resources = options.resources; },
  };
  loadApi('../src/i18n.ts', {
    i18next: { __esModule: true, default: setup },
    'i18next-browser-languagedetector': { default: {} },
    'react-i18next': { initReactI18next: {} },
  });
  const i18n = createInstance();
  await i18n.init({ resources, lng: 'ar', fallbackLng: 'fr' });
  const { translatePlanName } = loadApi('../src/features/plans/labels.ts', {});
  for (const [name, expected] of [
    ['Mensuel', 'شهري'], ['mensuel', 'شهري'], [' MENSUEL ', 'شهري'],
    ['Hebdomadaire', 'أسبوعي'], ['hebdomadaire', 'أسبوعي'],
    ['Annuel', 'سنوي'], ['ans', 'سنة'], ['an', 'سنة'],
    ['Trimestre', 'ثلاثة أشهر'], ['trimestriel', 'ربع سنوي'],
    ['Semestriel', 'نصف سنوي'], ['Journalier', 'يومي'],
    ['Bimensuel', 'مرتين في الشهر'], ['Bimestriel', 'كل شهرين'],
  ]) {
    assert.equal(translatePlanName(name, i18n.t.bind(i18n)), expected);
    await i18n.changeLanguage('fr');
    assert.equal(translatePlanName(name, i18n.t.bind(i18n)), name);
    await i18n.changeLanguage('ar');
  }
  for (const name of ['Flex Premium', 'اشتراك خاص', 'constructor', '']) {
    assert.equal(translatePlanName(name, i18n.t.bind(i18n)), name);
  }
});
