import { connectDatabase, closeDatabase } from './db.mjs';
import { initializeDatabase } from './schema.mjs';

try {
  const { db } = await connectDatabase();
  await initializeDatabase(db);
  console.log('MongoDB collections, validators, indexes, default plans and settings are ready.');
} catch (error) {
  console.error(`MongoDB setup failed (${error.name}). Check credentials, Atlas network access and database permissions.`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
