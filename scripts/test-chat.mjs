// E2E test: register → login → POST /api/chat (verify Blackbox fix works).
const BASE = 'http://localhost:3000';

function parseSetCookie(setCookie) {
  if (!setCookie) return '';
  // fetch merges multiple Set-Cookie into a single comma-separated string.
  // Extract name=value segments (everything up to the first ';').
  const parts = [];
  const regex = /(?:^|,\s*)([^=;,\s]+)=([^;]+)/g;
  let m;
  const seen = new Set();
  while ((m = regex.exec(setCookie)) !== null) {
    // skip attribute names
    if (/^(Expires|Path|HttpOnly|Secure|SameSite|Max-Age|Domain)$/i.test(m[1])) continue;
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    parts.push(`${m[1]}=${m[2]}`);
  }
  return parts.join('; ');
}

const rand = Math.random().toString(36).slice(2, 8);
const email = `chat_test_${rand}@nova.test`;
const password = 'Password#1234';

console.log(`→ Registering ${email}`);
const regRes = await fetch(`${BASE}/api/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, name: 'Chat Tester' }),
});
console.log(`  register status: ${regRes.status}`);
const regBody = await regRes.text();
if (!regRes.ok) {
  console.log(`  register body: ${regBody.slice(0, 300)}`);
  process.exit(1);
}
const cookie = parseSetCookie(regRes.headers.get('set-cookie'));
console.log(`  cookie: ${cookie.slice(0, 50)}...`);

console.log(`\n→ POST /api/chat`);
const chatRes = await fetch(`${BASE}/api/chat`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    cookie,
  },
  body: JSON.stringify({
    message: 'Reply with exactly the word: NOVA-OK',
  }),
});
console.log(`  chat status: ${chatRes.status}`);
const chatBody = await chatRes.text();
console.log(`  chat body: ${chatBody.slice(0, 600)}`);

if (chatRes.ok) {
  console.log('\n✅ CHAT IS WORKING');
} else {
  console.log('\n❌ CHAT FAILED');
  process.exit(2);
}
