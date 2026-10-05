import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, verifyPassword, newToken, tokenHash, readToken, publicUser } from '../server/auth.mjs';
import { schemas, idSchema, validateDates } from '../server/validation.mjs';
import { joinRows } from '../server/app.mjs';

const id = '12345678-1234-1234-1234-123456789abc';

test('passwords use salted hashes, reject wrong passwords and never appear in public users', async () => {
  const first = await hashPassword('test-password-2026');
  const second = await hashPassword('test-password-2026');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('test-password-2026', first), true);
  assert.equal(await verifyPassword('wrong-password', first), false);
  assert.deepEqual(publicUser({ id, email: 'admin@example.com', role: 'admin', password_hash: first }), {
    id, email: 'admin@example.com', role: 'admin',
  });
  await assert.rejects(verifyPassword('test', 'malformed'), /Invalid stored password/);
});
test('session tokens are unpredictable, hashed and read only from valid cookies', () => {
  const token = newToken();
  assert.equal(token.length, 64);
  assert.notEqual(token, newToken());
  assert.notEqual(tokenHash(token), token);
  assert.equal(readToken({ headers: { cookie: `other=a; co_manager_session=${token}` } }), token);
  assert.equal(readToken({ headers: { cookie: 'co_manager_session=invalid' } }), null);
  assert.equal(readToken({ headers: {} }), null);
});
test('saved UUID compatibility is retained while placeholder IDs are rejected', () => {
  assert.equal(idSchema.parse(id), id);
  assert.throws(() => idSchema.parse('plan-mensuel'));
});
test('server rejects operator injection, unknown fields, invalid prices and quantities', () => {
  assert.throws(() => schemas.customers.create.parse({ full_name: { $ne: null } }));
  assert.throws(() => schemas.customers.create.parse({ full_name: 'Name', role: 'admin' }));
  assert.throws(() => schemas.plans.create.parse({ name: 'Plan', price: -1, duration_days: 1 }));
  assert.throws(() => schemas.plans.create.parse({ name: 'Plan', price: Infinity, duration_days: 1 }));
  assert.throws(() => schemas.session_products.create.parse({ session_id: id, product_id: id, quantity: 1.5, total_price: 2 }));
  assert.throws(() => schemas.sessions.update.parse({ status: 'completed', exit_time: new Date().toISOString(), time_cost: NaN }));
});
test('partial subscription cancellation does not reapply create-time defaults', () => {
  assert.deepEqual(schemas.subscriptions.update.parse({ status: 'cancelled' }), { status: 'cancelled' });
  assert.deepEqual(schemas.customers.update.parse({ full_name: 'Updated' }), { full_name: 'Updated' });
});
test('invalid subscription and checkout dates cannot be persisted', () => {
  assert.throws(() => validateDates({ start_date: '2026-10-10', end_date: '2026-10-01' }), /end date/);
  assert.throws(() => validateDates({ entry_time: '2026-10-05T12:00:00.000Z', exit_time: '2026-10-05T11:00:00.000Z' }), /exit time/);
  assert.doesNotThrow(() => validateDates({ start_date: '2026-10-01', end_date: '2026-10-10' }));
  assert.throws(() => validateDates({ entry_time: '2026-10-05T12:00:00.000Z', exit_time: '2026-10-05T13:00:00+02:00' }), /exit time/);
  assert.equal(schemas.sessions.update.parse({
    status: 'completed', exit_time: '2026-10-05T14:00:00+02:00', time_cost: 10,
  }).exit_time, '2026-10-05T12:00:00.000Z');
});
test('joins retain the frontend session and subscription output shapes', async () => {
  const rows = {
    customers: [{ id: 'customer', full_name: 'Customer' }],
    products: [{ id: 'product', name: 'Coffee', price: 2 }],
    plans: [{ id: 'plan', name: 'Monthly' }],
    session_products: [{ id: 'item', session_id: 'session', product_id: 'product', quantity: 2, total_price: 4 }],
  };
  const db = { collection: name => ({ find: filter => ({
    toArray: async () => rows[name].filter(row => Object.entries(filter).every(([key, value]) => value.$in.includes(row[key]))),
  }) }) };
  const sessions = await joinRows(db, 'sessions', [{ id: 'session', customer_id: 'customer' }]);
  assert.equal(sessions[0].customers.full_name, 'Customer');
  assert.equal(sessions[0].session_products[0].products.name, 'Coffee');
  const subs = await joinRows(db, 'subscriptions', [{ id: 'subscription', customer_id: 'customer', plan_id: 'plan' }]);
  assert.equal(subs[0].plans.name, 'Monthly');
  const removed = await joinRows(db, 'subscriptions', [{ id: 'subscription', customer_id: 'customer', plan_id: null }]);
  assert.equal(removed[0].plans, null);
});
