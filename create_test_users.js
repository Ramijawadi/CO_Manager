import { randomBytes, randomUUID } from 'node:crypto';
import { connectDatabase, closeDatabase } from './server/db.mjs';
import { hashPassword } from './server/auth.mjs';
import { userSchema } from './server/validation.mjs';

// Creates one active test account per role. Existing accounts are never modified.
const domain = (process.env.TEST_USERS_DOMAIN || 'comanager.test').trim().toLowerCase();
const accounts = [
  { role: 'admin', full_name: 'Test Admin' },
  { role: 'employee', full_name: 'Test Employee' },
  { role: 'staff', full_name: 'Test Staff' },
  { role: 'demo', full_name: 'Test Demo' },
];

const generatePassword = () => `${randomBytes(9).toString('base64url')}#A1`;

try {
  const { db } = await connectDatabase();
  const created = [];
  for (const account of accounts) {
    const password = process.env.TEST_USERS_PASSWORD || generatePassword();
    const user = userSchema.parse({ email: `test-${account.role}@${domain}`, password, role: account.role });
    if (await db.collection('users').findOne({ email: user.email })) {
      console.log(`Skipped ${user.email}: account already exists (unchanged).`);
      continue;
    }
    const now = new Date().toISOString();
    await db.collection('users').insertOne({
      id: randomUUID(), email: user.email, role: user.role, full_name: account.full_name,
      status: 'active', password_hash: await hashPassword(user.password),
      created_at: now, updated_at: now,
    });
    created.push({ role: user.role, email: user.email, password: user.password });
  }
  if (created.length) {
    console.log('Test accounts created. Store these passwords now; they cannot be recovered later:');
    console.table(created);
  }
} catch (error) {
  console.error(`Test user creation failed: ${error.name === 'MongoServerError' ? 'Check database access or duplicate email.' : error.message}`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
