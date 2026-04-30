// Final probe: chat-based image + correct video endpoint shape
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const API_KEY = process.env.BLACKBOX_API_KEY;
const API_URL = process.env.BLACKBOX_API_URL || 'https://api.blackbox.ai';

async function hit(method, url, body, label) {
  try {
    const opts = {
      method,
      headers: { Authorization: `Bearer ${API_KEY}` },
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    const text = await res.text();
    const ok = res.status >= 200 && res.status < 300;
    console.log(`[${ok ? 'OK ' : 'ERR'}] ${res.status} ${label}`);
    console.log('   ', text.slice(0, 500).replace(/\n/g, ' '));
    return { status: res.status, text };
  } catch (e) {
    console.log(`[ERR] ${label}: ${e.message}`);
  }
}

console.log('\n### (A) Chat-based image generation — regular chat model ###');
// Ask a normal chat model to "generate an image" and see if it returns a URL
await hit('POST', `${API_URL}/chat/completions`, {
  model: 'blackboxai/blackbox-pro',
  messages: [
    {
      role: 'user',
      content:
        'Generate an image of a small red apple on a white table, photorealistic. Respond with only the direct image URL.',
    },
  ],
  max_tokens: 500,
}, 'chat(blackbox-pro) → generate image request');

await hit('POST', `${API_URL}/chat/completions`, {
  model: 'blackboxai/anthropic/claude-sonnet-4.5',
  messages: [
    {
      role: 'user',
      content: 'Generate an image: a small red apple. Return markdown image link.',
    },
  ],
  max_tokens: 500,
}, 'chat(claude) → generate image');

console.log('\n### (B) Video endpoint discovery ###');
// The URL /videos/generations returned 405 — meaning path exists. Try GET.
await hit('GET', `${API_URL}/videos/generations`, undefined, 'GET /videos/generations');
// OpenAPI spec discovery
await hit('GET', `${API_URL}/openapi.json`, undefined, 'GET /openapi.json');
await hit('GET', `${API_URL}/docs`, undefined, 'GET /docs');

// Try chat-based video
await hit('POST', `${API_URL}/chat/completions`, {
  model: 'blackboxai/google/veo-3-fast',
  messages: [{ role: 'user', content: 'a cat walking in a garden' }],
  max_tokens: 200,
}, 'chat(veo-3-fast) → video prompt');

await hit('POST', `${API_URL}/chat/completions`, {
  model: 'blackboxai/google/veo-2',
  messages: [{ role: 'user', content: 'a cat walking in a garden' }],
  max_tokens: 200,
}, 'chat(veo-2) → video prompt');
