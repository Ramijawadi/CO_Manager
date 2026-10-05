import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;
export const COOKIE_NAME = 'co_manager_session';

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  const [salt, hash] = encoded.split(':');
  if (!salt || !/^[a-f0-9]{128}$/.test(hash || '')) {
    throw new Error('Invalid stored password hash.');
  }
  const actual = await scrypt(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}

export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('hex');
export const publicUser = user => ({ id: user.id, email: user.email, role: user.role });

export function readToken(req) {
  const token = (req.headers.cookie || '').split(';')
    .map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export function cookieOptions() {
  return {
    httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' || process.env.VERCEL === '1',
    path: '/', maxAge: SESSION_DURATION,
  };
}
