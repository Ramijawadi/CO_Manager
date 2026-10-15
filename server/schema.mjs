import { randomUUID } from 'node:crypto';
import { initialRooms } from './room-management.mjs';

export const collectionNames = [
  'customers', 'products', 'plans', 'sessions', 'session_products',
  'subscriptions', 'settings', 'daily_closures', 'users', 'auth_sessions', 'expenses', 'subscription_payments',
  'rooms', 'room_rentals', 'utility_payments',
];

const definitions = {
  customers: { required: ['full_name'], properties: { full_name: { bsonType: 'string', minLength: 1 } } },
  products: {
    required: ['name', 'price', 'stock'],
    properties: { name: { bsonType: 'string' }, price: { bsonType: 'number', minimum: 0 }, stock: { bsonType: 'number', minimum: 0 } },
  },
  plans: {
    required: ['name', 'duration_days', 'price'],
    properties: { name: { bsonType: 'string' }, duration_days: { bsonType: 'number', minimum: 1 }, price: { bsonType: 'number', minimum: 0 } },
  },
  expenses: {
    required: ['name', 'category', 'amount', 'expense_date'],
    properties: {
      name: { bsonType: 'string', minLength: 1, maxLength: 200 },
      category: { bsonType: 'string', minLength: 1, maxLength: 200 },
      amount: { bsonType: 'number', minimum: 1, maximum: 1_000_000_000_000, multipleOf: 1 },
      expense_date: { bsonType: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      notes: { bsonType: 'string', maxLength: 10000 },
    },
  },
  subscription_payments: {
    required: ['subscription_id', 'customer_name', 'plan_name', 'amount', 'payment_date'],
    properties: {
      subscription_id: { bsonType: ['string', 'null'] },
      customer_name: { bsonType: 'string' }, plan_name: { bsonType: 'string' },
      amount: { bsonType: 'number', minimum: 1, maximum: 1_000_000_000_000, multipleOf: 1 },
      payment_date: { bsonType: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      notes: { bsonType: 'string', maxLength: 10000 },
    },
  },
  sessions: {
    required: ['customer_id', 'entry_time', 'status', 'time_cost'],
    properties: { customer_id: { bsonType: 'string' }, entry_time: { bsonType: 'string' },
      status: { enum: ['active', 'completed', 'cancelled'] }, time_cost: { bsonType: ['number', 'null'], minimum: 0 } },
  },
  session_products: {
    required: ['session_id', 'product_id', 'quantity', 'total_price'],
    properties: { session_id: { bsonType: 'string' }, product_id: { bsonType: 'string' },
      quantity: { bsonType: 'number', minimum: 1 }, total_price: { bsonType: 'number', minimum: 0 } },
  },
  subscriptions: {
    required: ['customer_id', 'plan_id', 'start_date', 'end_date', 'status'],
    properties: { customer_id: { bsonType: 'string' }, plan_id: { bsonType: ['string', 'null'] },
      start_date: { bsonType: 'string' }, end_date: { bsonType: 'string' }, status: { enum: ['active', 'expired', 'cancelled'] } },
  },
  settings: { required: ['hourly_rate'], properties: { hourly_rate: { bsonType: 'number', minimum: 0 } } },
  daily_closures: {
    required: ['closure_date', 'total_visitors', 'total_revenue', 'product_sales', 'time_revenue'],
    properties: Object.fromEntries(['total_visitors', 'total_revenue', 'product_sales', 'time_revenue']
      .map(field => [field, { bsonType: 'number', minimum: 0 }])),
  },
  rooms: {
    required: ['room_number', 'name', 'archived'],
    properties: {
      room_number: { bsonType: 'string', minLength: 1, maxLength: 40 },
      name: { bsonType: 'string', maxLength: 200 },
      notes: { bsonType: 'string', maxLength: 10000 },
      archived: { bsonType: 'bool' },
    },
  },
  room_rentals: {
    required: ['room_id', 'tenant_name', 'entry_date', 'expected_departure_date', 'actual_departure_date', 'archived'],
    properties: {
      room_id: { bsonType: 'string' }, tenant_name: { bsonType: 'string', minLength: 1, maxLength: 200 },
      phone: { bsonType: 'string', maxLength: 40 },
      entry_date: { bsonType: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      expected_departure_date: { bsonType: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      actual_departure_date: { bsonType: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      notes: { bsonType: 'string', maxLength: 10000 }, archived: { bsonType: 'bool' },
    },
  },
  utility_payments: {
    required: ['rental_id', 'type', 'billing_period', 'status', 'payment_date', 'amount', 'archived'],
    properties: {
      rental_id: { bsonType: 'string' }, type: { enum: ['water', 'electricity'] },
      billing_period: { bsonType: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' },
      status: { enum: ['paid', 'unpaid'] },
      payment_date: { bsonType: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      amount: { bsonType: ['number', 'null'], minimum: 1, maximum: 1_000_000_000_000, multipleOf: 1 },
      invoice_reference: { bsonType: 'string', maxLength: 200 },
      notes: { bsonType: 'string', maxLength: 10000 }, archived: { bsonType: 'bool' },
    },
  },
  users: { required: ['email', 'password_hash', 'role'], properties: { email: { bsonType: 'string' },
    password_hash: { bsonType: 'string' }, role: { enum: ['admin', 'staff', 'demo'] } } },
  auth_sessions: { required: ['token_hash', 'user_id', 'expires_at'], properties: {
    token_hash: { bsonType: 'string' }, user_id: { bsonType: 'string' }, expires_at: { bsonType: 'date' },
  } },
};

export async function initializeDatabase(db) {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name));
  for (const name of collectionNames) {
    const validator = { $jsonSchema: {
      bsonType: 'object', required: ['id', ...definitions[name].required],
      properties: { id: { bsonType: 'string' }, ...definitions[name].properties },
    } };
    if (!existing.has(name)) await db.createCollection(name, { validator });
    else await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' });
    await db.collection(name).createIndex({ id: 1 }, { unique: true });
  }
  await Promise.all([
    db.collection('customers').createIndex({ email: 1 }, {
      unique: true, name: 'customers_email_key',
      partialFilterExpression: { email: { $type: 'string', $gt: '' } },
    }),
    db.collection('plans').createIndex({ name: 1 }, { unique: true }),
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('settings').createIndex({ singleton: 1 }, { unique: true }),
    db.collection('daily_closures').createIndex({ closure_date: 1 }, { unique: true }),
    db.collection('sessions').createIndex({ status: 1, entry_time: -1 }),
    db.collection('sessions').createIndex({ entry_time: -1 }),
    db.collection('sessions').createIndex({ customer_id: 1 }),
    db.collection('subscriptions').createIndex({ customer_id: 1, status: 1, end_date: 1 }),
    db.collection('subscriptions').createIndex({ plan_id: 1 }),
    db.collection('session_products').createIndex({ session_id: 1 }),
    db.collection('session_products').createIndex({ product_id: 1 }),
    db.collection('session_products').createIndex({ created_at: -1 }),
    db.collection('expenses').createIndex({ expense_date: -1, created_at: -1 }),
    db.collection('subscription_payments').createIndex({ subscription_id: 1 }),
    db.collection('subscription_payments').createIndex({ payment_date: -1, created_at: -1 }),
    db.collection('sessions').createIndex({ status: 1, exit_time: -1 }),
    db.collection('auth_sessions').createIndex({ token_hash: 1 }, { unique: true }),
    db.collection('auth_sessions').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
    db.collection('rooms').createIndex({ room_number: 1 }, { unique: true, name: 'rooms_room_number_key' }),
    db.collection('rooms').createIndex({ archived: 1, room_number: 1 }),
    db.collection('room_rentals').createIndex({ room_id: 1, entry_date: 1, expected_departure_date: 1 }),
    db.collection('room_rentals').createIndex({ tenant_name: 1 }),
    db.collection('room_rentals').createIndex({ phone: 1 }),
    db.collection('utility_payments').createIndex(
      { rental_id: 1, type: 1, billing_period: 1 },
      {
        unique: true, name: 'utility_rental_type_period_key',
        partialFilterExpression: { archived: false },
      },
    ),
    db.collection('utility_payments').createIndex({ status: 1, type: 1, billing_period: -1 }),
  ]);
  const now = new Date().toISOString();
  await db.collection('settings').updateOne({ singleton: true }, { $setOnInsert: {
    id: randomUUID(), singleton: true, hourly_rate: 1, created_at: now, updated_at: now,
  } }, { upsert: true });
  for (const plan of [{ name: 'Hebdomadaire', duration_days: 7, price: 25 }, { name: 'Mensuel', duration_days: 30, price: 80 }]) {
    await db.collection('plans').updateOne({ name: plan.name }, { $setOnInsert: {
      ...plan, id: randomUUID(), created_at: now,
    } }, { upsert: true });
  }
  for (const room of initialRooms()) {
    await db.collection('rooms').updateOne(
      { room_number: room.room_number }, { $setOnInsert: room }, { upsert: true },
    );
  }
}
