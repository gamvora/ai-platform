// Authenticated page-render smoke test.
// Logs in via /api/auth/login, then does GET on every protected page and
// verifies it returns 200 with real HTML (not a redirect to /login).
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const email = 'demo@nova.test';
const password = 'demodemo';

const pages = [
  { name: 'Dashboard', path: '/dashboard' },
  { name: 'Chat',      path: '/chat' },
  { name: 'Image',     path: '/image' },
  { name: 'Edit',      path: '/edit' },
  { name: 'Video',     path: '/video' },
];

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    redirect: 'manual',
  });
  if (r.status !== 200) throw new Error(`login failed: ${r.status}`);
  const setCookie = r.headers.get('set-cookie') || '';
  // Extract the session cookie we set (name starts with "nova_"). Fallback: use raw header.
  const match = setCookie.match(/([a-z_]+=[^;]+)/i);
  if (!match) throw new Error(`no cookie in login response: ${setCookie}`);
  return match[1];
}

const cookie = await login();
console.log(`✓ Logged in — cookie captured (${cookie.slice(0, 30)}…)`);

let failures = 0;
for (const p of pages) {
  const r = await fetch(`${BASE}${p.path}`, {
    headers: { cookie, accept: 'text/html' },
    redirect: 'manual',
  });
  const ct = r.headers.get('content-type') || '';
  const loc = r.headers.get('location') || '';
  let snippet = '';
  let hasLoginRedirect = false;
  let hasSidebar = false;
  if (r.status === 200 && ct.includes('text/html')) {
    const html = await r.text();
    snippet = html.slice(0, 200).replace(/\s+/g, ' ');
    hasLoginRedirect = /redirect.*login/i.test(html);
    hasSidebar = /Nova AI|Dashboard|Chat|Image|Edit|Video/.test(html);
  }
  const ok = r.status === 200 && ct.includes('text/html') && hasSidebar && !hasLoginRedirect;
  console.log(
    `${ok ? '✓' : '✗'} ${p.name.padEnd(10)} ${p.path.padEnd(12)}  ${r.status}  ${loc ? `→ ${loc}` : ''}  ${ok ? 'OK' : 'FAIL'}`
  );
  if (!ok) { failures++; console.log(`    body: ${snippet}`); }
}

const summary = failures === 0
  ? `\n✅  All ${pages.length} authenticated pages render correctly.`
  : `\n❌  ${failures}/${pages.length} pages failed.`;
console.log(summary);
writeFileSync('./smoke-pages-result.txt', summary + '\n', 'utf8');
process.exit(failures === 0 ? 0 : 1);
