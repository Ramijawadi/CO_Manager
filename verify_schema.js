import { connectDatabase, closeDatabase } from './server/db.mjs';
import { collectionNames } from './server/schema.mjs';

try {
  const { db } = await connectDatabase();
  await db.command({ ping: 1 });
  const collections = await db.listCollections().toArray();
  for (const name of collectionNames) {
    const collection = collections.find(row => row.name === name);
    if (!collection?.options.validator?.$jsonSchema) throw new Error(`Missing collection or validator: ${name}`);
    const indexes = await db.collection(name).indexes();
    if (!indexes.some(index => index.key.id === 1 && index.unique)) throw new Error(`Missing unique UUID index: ${name}`);
    console.log(`${name}: collection, validator and unique UUID index verified.`);
  }
  const sessionIndexes = await db.collection('auth_sessions').indexes();
  if (!sessionIndexes.some(index => index.key.expires_at === 1 && index.expireAfterSeconds === 0)) {
    throw new Error('Missing authentication session expiry index.');
  }
  if (!await db.collection('settings').findOne({ singleton: true })) throw new Error('Settings are missing. Run npm run setup-db.');
  if (!await db.collection('users').findOne({ role: 'admin' })) throw new Error('An admin account is missing. Run npm run create-admin.');
  const roomIndexes = await db.collection('rooms').indexes();
  if (!roomIndexes.some(index => index.key.room_number === 1 && index.unique)) {
    throw new Error('Missing unique room number index.');
  }
  for (let room = 1; room <= 14; room++) {
    const roomNumber = `Chambre ${String(room).padStart(2, '0')}`;
    if (!await db.collection('rooms').findOne({ room_number: roomNumber })) {
      throw new Error(`Default room is missing: ${roomNumber}. Run npm run setup-db.`);
    }
  }
  const utilityIndexes = await db.collection('utility_payments').indexes();
  if (!utilityIndexes.some(index => index.key.rental_id === 1 && index.key.type === 1 &&
    index.key.billing_period === 1 && index.unique)) {
    throw new Error('Missing unique utility billing period index.');
  }
  console.log('All MongoDB schema checks passed. Verification made no writes.');
} catch (error) {
  console.error(`Schema verification failed (${error.name}). ${error.name === 'Error' ? error.message : 'Check MongoDB connection and database permissions.'}`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
