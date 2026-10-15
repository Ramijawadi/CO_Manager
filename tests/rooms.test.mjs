import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../server/app.mjs';
import { initializeDatabase } from '../server/schema.mjs';
import { schemas } from '../server/validation.mjs';
import { assertRentalAvailability, initialRooms, tunisDate } from '../server/room-management.mjs';

const uuid = '123e4567-e89b-12d3-a456-426614174000';

test('room schemas validate tenant dates and bill payment requirements', () => {
  const rental = {
    room_id: uuid, tenant_name: 'Nadia Ben Ali', phone: '+216 20 000 000',
    entry_date: '2026-10-15', expected_departure_date: '2026-11-15',
  };
  assert.deepEqual(schemas.room_rentals.create.parse(rental), rental);
  assert.throws(() => schemas.room_rentals.create.parse({ ...rental, expected_departure_date: '2026-10-14' }));
  assert.throws(() => schemas.room_rentals.create.parse({ ...rental, entry_date: '2026-02-30' }));
  assert.throws(() => schemas.utility_payments.create.parse({
    rental_id: uuid, type: 'water', billing_period: '2026-10', status: 'paid',
  }));
  assert.throws(() => schemas.utility_payments.create.parse({
    rental_id: uuid, type: 'gas', billing_period: '2026-10', status: 'unpaid',
  }));
  assert.throws(() => schemas.utility_payments.create.parse({
    rental_id: uuid, type: 'water', billing_period: '2026-13', status: 'unpaid',
  }));
  assert.throws(() => schemas.utility_payments.create.parse({
    rental_id: uuid, type: 'water', billing_period: '2026-10', status: 'unpaid', payment_date: '2026-10-15',
  }));
});

test('rental availability rejects overlaps but allows a new rental after the actual departure', async () => {
  const today = tunisDate();
  const nextDay = new Date(`${today}T00:00:00.000Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const nextDate = nextDay.toISOString().slice(0, 10);
  const current = {
    id: uuid, room_id: 'room', entry_date: today, expected_departure_date: '2099-01-01',
    actual_departure_date: null, archived: false,
  };
  const db = { collection: () => ({ find: () => ({ toArray: async () => [current] }) }) };
  await assert.rejects(assertRentalAvailability(db, {
    room_id: 'room', entry_date: nextDate, expected_departure_date: '2099-02-01',
    actual_departure_date: null,
  }, null), { status: 409 });

  current.actual_departure_date = today;
  await assert.doesNotReject(assertRentalAvailability(db, {
    room_id: 'room', entry_date: nextDate, expected_departure_date: '2099-02-01',
    actual_departure_date: null,
  }, uuid));
  assert.equal(initialRooms().length, 14);
  assert.equal(initialRooms()[0].room_number, 'Chambre 01');
  assert.equal(initialRooms()[13].room_number, 'Chambre 14');
});

test('database setup creates room collections, indexes and 14 idempotent default rooms', async () => {
  const collections = new Map();
  const indexes = [];
  const insertedRooms = [];
  await initializeDatabase({
    listCollections: () => ({ toArray: async () => [] }),
    createCollection: async (name, options) => collections.set(name, options),
    collection: name => ({
      createIndex: async (key, options) => indexes.push({ name, key, options }),
      updateOne: async (filter, update, options) => {
        if (name === 'rooms' && options?.upsert) insertedRooms.push({ filter, update });
      },
    }),
  });
  assert.equal(insertedRooms.length, 14);
  assert.deepEqual(collections.get('rooms').validator.$jsonSchema.required,
    ['id', 'room_number', 'name', 'archived']);
  assert.ok(indexes.some(index => index.name === 'rooms' && index.key.room_number === 1 && index.options.unique));
  assert.ok(indexes.some(index => index.name === 'room_rentals' && index.key.room_id === 1));
  assert.ok(indexes.some(index => index.name === 'utility_payments' &&
    index.options.unique && index.options?.partialFilterExpression?.archived === false));
});

test('room rental and utility CRUD persists bills and blocks overlapping tenants', async t => {
  const collections = new Map();
  let role = 'staff';
  const room = { id: uuid, room_number: 'Chambre 01', name: 'Chambre 01', notes: '', archived: false };
  collections.set('rooms', new Map([[uuid, room]]));
  const getRows = name => {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name);
  };
  const matches = (row, filter = {}) => Object.entries(filter).every(([key, expected]) => {
    const value = row[key];
    if (expected && typeof expected === 'object') {
      if ('$ne' in expected && value === expected.$ne) return false;
      if ('$lte' in expected && !(value <= expected.$lte)) return false;
      if ('$gte' in expected && !(value >= expected.$gte)) return false;
      return true;
    }
    return value === expected;
  });
  function collectionFor(name) {
    return {
      find: (filter = {}) => {
        let result = [...getRows(name).values()].filter(row => matches(row, filter));
        const cursor = {
          sort(order) {
            const [[key, direction]] = Object.entries(order);
            result.sort((left, right) => String(left[key] ?? '').localeCompare(String(right[key] ?? '')) * direction);
            return cursor;
          },
          limit() { return cursor; },
          toArray: async () => result.map(row => ({ ...row })),
        };
        return cursor;
      },
      findOne: async filter => {
        const row = [...getRows(name).values()].find(item => matches(item, filter));
        return row ? { ...row } : null;
      },
      findOneAndUpdate: async (filter, update) => {
        const row = [...getRows(name).values()].find(item => matches(item, filter));
        if (!row) return null;
        Object.assign(row, update.$set ?? {});
        for (const [key, value] of Object.entries(update.$inc ?? {})) row[key] = (row[key] ?? 0) + value;
        return { ...row };
      },
      insertOne: async row => { getRows(name).set(row.id, { ...row }); },
      updateOne: async (filter, update) => {
        const row = [...getRows(name).values()].find(item => matches(item, filter));
        if (row) Object.assign(row, update.$set ?? {});
      },
      deleteOne: async filter => { getRows(name).delete(filter.id); },
    };
  }
  const db = {
    collection: name => {
      if (name === 'auth_sessions') return { findOne: async () => ({ id: 'session', user_id: 'user' }) };
      if (name === 'users') return { findOne: async () => ({ id: 'user', email: 'test@example.com', role }) };
      return collectionFor(name);
    },
  };
  const client = { withSession: callback => callback({
    withTransaction: callback => callback(),
  }) };
  const app = await createApp({ db, client, serverless: true, serveFrontend: false });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (path, method = 'GET', body, expected = 200) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: `co_manager_session=${'a'.repeat(64)}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = response.status === 204 ? null : await response.json();
    assert.equal(response.status, expected, JSON.stringify(result));
    return result;
  };
  const today = tunisDate();
  const extraRoom = await request('/rooms', 'POST', {
    room_number: 'Chambre 15', name: 'Petite chambre', notes: 'Étage 1',
  }, 201);
  assert.equal(extraRoom.name, 'Petite chambre');
  const updatedRoom = await request(`/rooms/${extraRoom.id}`, 'PATCH', { name: 'Chambre calme' });
  assert.equal(updatedRoom.name, 'Chambre calme');
  assert.equal((await request('/rooms')).length, 2);
  await request(`/rooms/${extraRoom.id}`, 'DELETE', undefined, 204);
  assert.equal((await request('/rooms')).length, 1);

  const rental = await request('/room_rentals', 'POST', {
    room_id: uuid, tenant_name: 'Nadia Ben Ali', phone: '+216 20 000 000',
    entry_date: today, expected_departure_date: '2099-01-01', notes: '',
  }, 201);
  assert.equal(rental.tenant_name, 'Nadia Ben Ali');
  const initialBills = await request('/utility_payments');
  assert.equal(initialBills.length, 2);
  assert.ok(initialBills.every(payment => payment.status === 'unpaid'));
  const water = initialBills.find(payment => payment.type === 'water');
  const paidWater = await request(`/utility_payments/${water.id}`, 'PATCH', {
    status: 'paid', payment_date: today, amount: 2500,
  });
  assert.equal(paidWater.amount, 2500);

  await request('/room_rentals', 'POST', {
    room_id: uuid, tenant_name: 'Another tenant', entry_date: today,
    expected_departure_date: '2099-02-01',
  }, 409);
  await request(`/room_rentals/${rental.id}`, 'PATCH', {
    actual_departure_date: today,
  });
  await request(`/room_rentals/${rental.id}`, 'DELETE', undefined, 204);
  assert.equal(getRows('utility_payments').size, 2, 'rental bills are retained after rental archival');
  const tomorrow = new Date(`${today}T00:00:00.000Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const nextRental = await request('/room_rentals', 'POST', {
    room_id: uuid, tenant_name: 'New tenant', entry_date: tomorrow.toISOString().slice(0, 10),
    expected_departure_date: '2099-02-01',
  }, 201);
  assert.ok(nextRental.id);
  await request(`/rooms/${uuid}`, 'DELETE', undefined, 400);
  await request(`/room_rentals/${nextRental.id}`, 'PATCH', {
    actual_departure_date: nextRental.entry_date,
  });
  await request(`/room_rentals/${nextRental.id}`, 'DELETE', undefined, 204);

  role = 'demo';
  await request('/rooms', 'POST', { room_number: 'Chambre 15' }, 403);
  role = 'staff';
  await request(`/rooms/${uuid}`, 'DELETE', undefined, 204);
  assert.ok(getRows('utility_payments').size >= 4, 'rental bills are retained after room archival');
});
