import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'dotenv';

const path = new URL('../.env', import.meta.url);
const source = readFileSync(path, 'utf8');
const existing = parse(source);
const commentedUri = source.split(/\r?\n/)
  .map(line => line.replace(/^\s*#\s*/, '').trim())
  .find(line => /^mongodb(\+srv)?:\/\//.test(line));
const uri = existing.MONGODB_URI || commentedUri;
if (!uri) throw new Error('No MongoDB connection string found in .env.');
const url = new URL(uri);
if (!url.username || !url.password || uri.includes('<')) {
  throw new Error('The MongoDB connection string must contain valid credentials.');
}
const name = existing.MONGODB_DB_NAME || decodeURIComponent(url.pathname.slice(1)) || 'co_management';
const lines = source.split(/\r?\n/).filter(line =>
  !/^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY|MONGODB_URI|MONGODB_DB_NAME)\s*=/.test(line)
  && !/^\s*#\s*(mongodb|username\s*:|passwor[d]?\s*:)/i.test(line));
writeFileSync(path, `${lines.join('\n').trim()}\nMONGODB_URI=${JSON.stringify(uri)}\nMONGODB_DB_NAME=${name}\n`);
console.log('Configured server-only MongoDB variables in .env. Credentials were not printed.');
