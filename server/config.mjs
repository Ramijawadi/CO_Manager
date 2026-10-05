import { config } from 'dotenv';

config({ quiet: true });

export class DatabaseConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DatabaseConfigError';
    this.code = 'INVALID_DATABASE_CONFIG';
  }
}

export function databaseConfig(env = process.env) {
  const uri = env.MONGODB_URI;
  const name = env.MONGODB_DB_NAME;
  if (!uri || !uri.trim()) {
    throw new DatabaseConfigError('MONGODB_URI is missing. Set it for this deployment environment and redeploy.');
  }
  if (/^["']|["']$/.test(uri.trim())) {
    throw new DatabaseConfigError('MONGODB_URI contains surrounding quotes. Paste only the URI value in Vercel and redeploy.');
  }
  if (uri !== uri.trim() || !/^mongodb(\+srv)?:\/\//.test(uri)) {
    throw new DatabaseConfigError('MONGODB_URI must start with mongodb:// or mongodb+srv://, with no variable-name prefix or surrounding whitespace.');
  }
  if (!name || !name.trim()) {
    throw new DatabaseConfigError('MONGODB_DB_NAME is missing. Set it for this deployment environment and redeploy.');
  }
  if (name !== name.trim() || /^["']|["']$/.test(name)) {
    throw new DatabaseConfigError('MONGODB_DB_NAME must contain only the database name, without surrounding quotes or whitespace.');
  }
  return { uri, name };
}
