// E2E test: register → POST /api/video
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const email = `vid-test-${Date.now()}@example.com`;

async function main() {
  let cookie = '';
  const r1 = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPass123!', name: 'Vid' }),
  });
  const setCookie = r1.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  console.log('register:', r1.status);

  const r2 = await fetch(`${BASE}/api/video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ prompt: 'a cat walking in a garden, short 4-second clip' }),
  });
  console.log('video:', r2.status);
  const text = await r2.text();
  console.log('body:', text.slice(0, 800));
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
