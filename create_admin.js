import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { connectDatabase, closeDatabase } from './server/db.mjs';
import { hashPassword } from './server/auth.mjs';
import { userSchema } from './server/validation.mjs';

const prompt = createInterface({ input: process.stdin, output: process.stdout });
try {
  const email = process.env.ADMIN_EMAIL || await prompt.question('Admin email: ');
  const password = process.env.ADMIN_PASSWORD || await prompt.question('Admin password (at least 10 characters; input is visible): ');
  const user = userSchema.parse({ email: email.trim().toLowerCase(), password, role: 'admin' });
  const { db } = await connectDatabase();
  if (await db.collection('users').findOne({ email: user.email })) {
    throw new Error('An account already exists for this email. No password was changed.');
  }
  await db.collection('users').insertOne({
    id: randomUUID(), email: user.email, role: user.role,
    password_hash: await hashPassword(user.password), created_at: new Date().toISOString(),
  });
  console.log('Admin account created. Password is stored only as a salted scrypt hash.');
} catch (error) {
  console.error(`Admin creation failed: ${error.name === 'MongoServerError' ? 'Check database access or duplicate email.' : error.message}`);
  process.exitCode = 1;
} finally {
  prompt.close();
  await closeDatabase();
}
