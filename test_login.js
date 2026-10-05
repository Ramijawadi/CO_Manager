import './server/config.mjs';

try {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD locally before running this script.');
  }
  const base = process.env.API_URL || 'http://localhost:3001';
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
  });
  if (!response.ok) throw new Error((await response.json()).message);
  const { user } = await response.json();
  if (user.role !== 'admin') throw new Error('Login succeeded, but the account is not an admin.');
  const logout = await fetch(`${base}/api/auth/logout`, {
    method: 'POST', headers: { Cookie: response.headers.get('set-cookie').split(';')[0] },
  });
  if (!logout.ok) throw new Error('Could not revoke the test login session.');
  console.log('MongoDB admin login and logout succeeded.');
} catch (error) {
  console.error(`Login verification failed: ${error.message}`);
  process.exitCode = 1;
}
