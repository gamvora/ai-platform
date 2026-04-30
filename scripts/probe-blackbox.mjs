// Probe Blackbox API to find a working chat + image model.
import fs from 'node:fs';
import path from 'node:path';

const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const KEY = env.split('\n').find(l => l.startsWith('BLACKBOX_API_KEY='))?.split('=').slice(1).join('=').trim();
const URL = 'https://api.blackbox.ai';

if (!KEY) { console.error('No API key'); process.exit(1); }

const CANDIDATES_CHAT = [
  'blackboxai/blackbox-pro',
  'blackboxai/anthropic/claude-sonnet-4.5',
  'blackboxai/openai/gpt-5.3-codex',
  'claude-sonnet-4-5-20250514',
  'blackboxai/z-ai/glm-5',
];

const CANDIDATES_IMG = [
  'blackboxai/black-forest-labs/flux-schnell',
  'blackboxai/google/nano-banana',
  'blackboxai/black-forest-labs/flux-1.1-pro',
];

async function probeChat(model) {
  try {
    const r = await fetch(`${URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with exactly: HELLO' }],
        max_tokens: 20,
      }),
    });
    const txt = await r.text();
    return { model, status: r.status, ok: r.ok, body: txt.slice(0, 300) };
  } catch (e) {
    return { model, err: e.message };
  }
}

async function probeImage(model) {
  try {
    const r = await fetch(`${URL}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model, prompt: 'a red apple on a white table', n: 1, size: '1024x1024' }),
    });
    const txt = await r.text();
    return { model, status: r.status, ok: r.ok, body: txt.slice(0, 300) };
  } catch (e) {
    return { model, err: e.message };
  }
}

console.log('== CHAT ==');
for (const m of CANDIDATES_CHAT) {
  const res = await probeChat(m);
  console.log(JSON.stringify(res));
}

console.log('\n== IMAGE ==');
for (const m of CANDIDATES_IMG) {
  const res = await probeImage(m);
  console.log(JSON.stringify(res));
}
