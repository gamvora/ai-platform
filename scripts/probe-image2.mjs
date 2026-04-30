// Second probe: try non-fal.ai image providers and alternative video endpoints
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

async function tryPost(url, body, label) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const ok = res.status >= 200 && res.status < 300;
    console.log(`[${ok ? 'OK ' : 'ERR'}] ${res.status} ${label}`);
    console.log('   body:', text.slice(0, 400).replace(/\n/g, ' '));
    return { status: res.status, text };
  } catch (e) {
    console.log(`[ERR] ${label}: ${e.message}`);
  }
}

const imagePrompt = 'a small red apple on a white table, photorealistic';

// Try a variety of IMAGE models (non-fal.ai ones likely)
const imageModels = [
  'blackboxai/google/imagen-4-fast',
  'blackboxai/google/imagen-3-fast',
  'blackboxai/google/imagen-4',
  'blackboxai/google/imagen-3',
  'blackboxai/qwen/qwen-image',
  'blackboxai/bria/image-3.2',
  'blackboxai/minimax/image-01',
  'blackboxai/tencent/hunyuan-image-3',
  'blackboxai/prunaai/wan-2.2-image',
  'blackboxai/stability-ai/stable-diffusion-3.5-medium',
  'blackboxai/black-forest-labs/flux-dev',
];

console.log('\n### IMAGE MODELS (POST /images/generations) ###');
for (const model of imageModels) {
  await tryPost(
    `${API_URL}/images/generations`,
    { model, prompt: imagePrompt, n: 1, size: '1024x1024' },
    model
  );
}

// Try different video endpoint paths
const videoPrompt = 'a cat walking in a garden';
const videoEndpoints = [
  '/videos/generations',
  '/video/generations',
  '/v1/videos/generations',
  '/v1/video/generations',
];
const videoModels = [
  'blackboxai/google/veo-3-fast',
  'blackboxai/google/veo-2',
  'blackboxai/google/veo-3',
  'blackboxai/veo-3.1-fast',
];

console.log('\n### VIDEO ENDPOINTS ###');
for (const ep of videoEndpoints) {
  for (const model of videoModels.slice(0, 2)) {
    await tryPost(
      `${API_URL}${ep}`,
      { model, prompt: videoPrompt },
      `${ep} model=${model}`
    );
  }
}
