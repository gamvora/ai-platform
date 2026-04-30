// Probe Blackbox image generation endpoints to find what actually works
import fs from 'node:fs';
import path from 'node:path';

// Load .env.local
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const API_KEY = process.env.BLACKBOX_API_KEY;
const API_URL = process.env.BLACKBOX_API_URL || 'https://api.blackbox.ai';

if (!API_KEY) {
  console.error('BLACKBOX_API_KEY not set');
  process.exit(1);
}

console.log('API_URL:', API_URL);
console.log('API_KEY:', API_KEY.slice(0, 8) + '...' + API_KEY.slice(-4));

// 1. List models
async function listModels() {
  const res = await fetch(`${API_URL}/v1/models`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const text = await res.text();
  console.log('\n=== /v1/models ===');
  console.log('status:', res.status);
  try {
    const data = JSON.parse(text);
    const ids = (data.data || data.models || []).map((m) => m.id || m);
    console.log('total models:', ids.length);
    const imageModels = ids.filter(
      (id) =>
        /flux|imagen|stable|dall|sdxl|midjourney|image|veo|seedance|kling/i.test(id)
    );
    console.log('candidate image/video models:');
    imageModels.forEach((id) => console.log('  -', id));
  } catch {
    console.log('(raw):', text.slice(0, 500));
  }
}

async function tryEndpoint(url, body, label) {
  console.log(`\n=== ${label} ===`);
  console.log('URL:', url);
  console.log('body:', JSON.stringify(body));
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log('status:', res.status);
    console.log('body:', text.slice(0, 800));
    return { status: res.status, body: text };
  } catch (e) {
    console.log('ERROR:', e.message);
    return { error: e.message };
  }
}

await listModels();

const prompt = 'a small red apple on a white table, photorealistic';

// Candidate image models from the list - try each against a few endpoint shapes
const imageModels = [
  'blackboxai/black-forest-labs/flux-schnell',
  'blackboxai/black-forest-labs/flux-1-schnell',
  'blackboxai/flux-schnell',
  'flux-schnell',
];

for (const model of imageModels) {
  await tryEndpoint(
    `${API_URL}/images/generations`,
    { model, prompt, n: 1, size: '1024x1024' },
    `images/generations model=${model}`
  );
}

// Also try v1 prefix
for (const model of ['blackboxai/black-forest-labs/flux-schnell']) {
  await tryEndpoint(
    `${API_URL}/v1/images/generations`,
    { model, prompt, n: 1, size: '1024x1024' },
    `v1/images/generations model=${model}`
  );
}

// Try chat endpoint with image model
await tryEndpoint(
  `${API_URL}/chat/completions`,
  {
    model: 'blackboxai/black-forest-labs/flux-schnell',
    messages: [{ role: 'user', content: prompt }],
  },
  'chat/completions with image model'
);

// Video
const videoPrompt = 'a cat walking in a garden, 3 seconds';
for (const model of [
  'blackboxai/google/veo-3-fast',
  'blackboxai/veo-3-fast',
  'veo-3-fast',
]) {
  await tryEndpoint(
    `${API_URL}/video/generations`,
    { model, prompt: videoPrompt },
    `video/generations model=${model}`
  );
}

await tryEndpoint(
  `${API_URL}/chat/completions`,
  {
    model: 'blackboxai/google/veo-3-fast',
    messages: [{ role: 'user', content: videoPrompt }],
  },
  'chat/completions with video model'
);
