import { randomUUID } from 'node:crypto';

export const collectionNames = [
  'customers', 'products', 'plans', 'sessions', 'session_products',
  'subscriptions', 'settings', 'daily_closures', 'users', 'auth_sessions',
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
    db.collection('auth_sessions').createIndex({ token_hash: 1 }, { unique: true }),
    db.collection('auth_sessions').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
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
}
