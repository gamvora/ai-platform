// E2E test: register → login → POST /api/image
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const email = `img-test-${Date.now()}@example.com`;
const password = 'TestPassword123!';

async function main() {
  let cookie = '';

  // Register
  const r1 = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: 'Img Test' }),
  });
  const setCookie = r1.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  console.log('register:', r1.status);

  // Generate image
  const r2 = await fetch(`${BASE}/api/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ prompt: 'a small red apple on a white table, photorealistic' }),
  });
  const text = await r2.text();
  console.log('image:', r2.status);
  console.log('body:', text.slice(0, 700));
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
