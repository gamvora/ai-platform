/**
 * End-to-end smoke test — hits all main endpoints in sequence.
 * Assumes dev server is running at http://localhost:3000.
 * Usage:  node scripts/smoke-all.mjs
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const stamp = Date.now();
const email = `smoke${stamp}@test.local`;
const password = 'smoke-pass-1234';

let cookie = '';

async function call(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(opts.headers || {}),
    },
  });
  // capture Set-Cookie on first auth hit
  const sc = res.headers.get('set-cookie');
  if (sc && /session=/.test(sc)) {
    cookie = sc.split(';')[0];
  }
  let body;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { status: res.status, body };
}

function log(label, r) {
  const ok = r.status >= 200 && r.status < 400;
  const mark = ok ? '✅' : '❌';
  console.log(`${mark} ${label} — ${r.status}`);
  if (!ok || process.env.VERBOSE) {
    console.log('   ', JSON.stringify(r.body).slice(0, 240));
  }
  return ok;
}

(async () => {
  console.log(`\n🧪  Smoke testing ${BASE}\n`);

  log(
    'register',
    await call('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name: 'Smoke Tester' }),
    })
  );

  log(
    'login',
    await call('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  );

  log('me', await call('/api/auth/me'));

  log(
    'chat',
    await call('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Reply with just the words: NOVA-OK',
      }),
    })
  );

  log(
    'image (generate)',
    await call('/api/image', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'a serene mountain lake at sunrise',
        style: 'photorealistic',
        size: '1024x1024',
      }),
    })
  );

  log('image (list)', await call('/api/image'));

  // edit needs a source URL — use a public cat image
  log(
    'edit (generate)',
    await call('/api/edit', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'make it watercolor painting style',
        imageUrl: 'https://picsum.photos/seed/nova/512/512',
      }),
    })
  );

  log('edit (list)', await call('/api/edit'));

  log(
    'video (generate)',
    await call('/api/video', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'a drone shot over neon tokyo streets',
      }),
    })
  );

  log('video (list)', await call('/api/video'));

  log('conversations', await call('/api/conversations'));

  console.log('\nDone.\n');
})();
