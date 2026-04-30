#!/usr/bin/env node
// Test which image/edit/video models actually work on this key
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const KEY = process.env.BLACKBOX_API_KEY;
const URL = process.env.BLACKBOX_API_URL || 'https://api.blackbox.ai';

async function postJson(endpoint, body) {
  try {
    const r = await fetch(`${URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    return { status: r.status, body: txt };
  } catch (e) {
    return { status: 0, body: e.message };
  }
}

function short(s) {
  return s.replace(/\s+/g, ' ').slice(0, 200);
}

function verdict(res) {
  if (res.status === 0) return `NET_ERR ${short(res.body)}`;
  if (res.status >= 200 && res.status < 300) {
    // Look for a URL
    const m = res.body.match(/https?:\/\/\S+?\.(?:png|jpe?g|webp|mp4|webm)/i);
    if (m) return `✅ WORKS → ${m[0]}`;
    const any = res.body.match(/https?:\/\/[^\s"',]+/);
    if (any) return `✅ WORKS? → ${any[0].slice(0, 80)}`;
    return `✅ 200 (no URL) ${short(res.body)}`;
  }
  if (/exhausted balance|User is locked/i.test(res.body)) return `💸 BALANCE_EXHAUSTED`;
  if (/invalid model/i.test(res.body)) return `❓ INVALID_MODEL`;
  if (/cannot access application/i.test(res.body)) return `🔒 NO_ACCESS`;
  return `❌ ${res.status} ${short(res.body)}`;
}

const IMAGE_MODELS = [
  'blackboxai/black-forest-labs/flux-schnell',
  'blackboxai/black-forest-labs/flux-1.1-pro',
  'blackboxai/google/imagen-4-fast',
  'blackboxai/google/imagen-3-fast',
  'blackboxai/google/imagen-3',
  'blackboxai/google/imagen-4',
  'blackboxai/google/nano-banana',
  'blackboxai/stability-ai/stable-diffusion-3.5-medium',
];

const VIDEO_MODELS = [
  'blackboxai/google/veo-3-fast',
  'blackboxai/google/veo-2',
  'blackboxai/sora-2-text-to-video',
  'blackboxai/cogvideox-5b',
  'blackboxai/luma/photon-flash',
];

async function main() {
  console.log('\n=== IMAGE MODELS ===');
  for (const m of IMAGE_MODELS) {
    const r = await postJson('/images/generations', {
      model: m, prompt: 'a red apple on a white table', n: 1, size: '512x512',
    });
    console.log(`  ${m}`);
    console.log(`    → ${verdict(r)}`);
  }

  console.log('\n=== VIDEO MODELS (try /videos/generations) ===');
  for (const m of VIDEO_MODELS) {
    const r = await postJson('/videos/generations', {
      model: m, prompt: 'a cat walking in a garden', duration: 3,
    });
    console.log(`  ${m}`);
    console.log(`    → ${verdict(r)}`);
  }

  console.log('\n=== VIDEO MODELS (try /v1/videos/generations) ===');
  for (const m of VIDEO_MODELS.slice(0, 3)) {
    const r = await postJson('/v1/videos/generations', {
      model: m, prompt: 'a cat walking in a garden', duration: 3,
    });
    console.log(`  ${m}`);
    console.log(`    → ${verdict(r)}`);
  }

  console.log('\n=== EDIT MODEL via /images/edits ===');
  const editModels = ['blackboxai/google/nano-banana', 'blackboxai/black-forest-labs/flux-kontext-pro'];
  for (const m of editModels) {
    const r = await postJson('/images/edits', {
      model: m, prompt: 'make the apple green',
      image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Red_Apple.jpg/320px-Red_Apple.jpg',
    });
    console.log(`  ${m}`);
    console.log(`    → ${verdict(r)}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
