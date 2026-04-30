// Seed a deterministic test account for browser walkthrough.
// Re-runnable: will just print existing credentials if already registered.
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const email = 'demo@nova.test';
const password = 'demodemo';
const name = 'Nova Demo';

async function register() {
  const r = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return { status: r.status };
}

const reg = await register();
const log = await login();
console.log(JSON.stringify({
  email, password, register: reg.status, login: log.status,
  note: reg.status === 409 ? 'user already exists — reusing' : 'created',
}, null, 2));
