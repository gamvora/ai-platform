// Node-based smoke test for all pages.
const BASE = 'http://localhost:3000';
const urls = [
  '/',
  '/login',
  '/register',
  '/chat',
  '/dashboard',
  '/image',
  '/video',
];

let allOk = true;
for (const u of urls) {
  try {
    const r = await fetch(`${BASE}${u}`, { redirect: 'manual' });
    const status = r.status;
    const ok = status >= 200 && status < 400;
    if (!ok) allOk = false;
    console.log(`${ok ? 'OK ' : 'ERR'} ${status}  ${u}`);
  } catch (e) {
    allOk = false;
    console.log(`ERR  -  ${u}  ${e.message}`);
  }
}
process.exit(allOk ? 0 : 1);
