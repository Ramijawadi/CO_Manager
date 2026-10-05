import { config } from 'dotenv';

config({ quiet: true });

export function databaseConfig() {
  const uri = process.env.MONGODB_URI;
  const name = process.env.MONGODB_DB_NAME;
  if (!uri || !/^mongodb(\+srv)?:\/\//.test(uri) || !name) {
    throw new Error('Set server-only MONGODB_URI and MONGODB_DB_NAME in .env.');
  }
  return { uri, name };
}
