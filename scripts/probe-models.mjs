#!/usr/bin/env node
// List all Blackbox models + test which ones actually produce output
import fs from 'node:fs';
import path from 'node:path';

// Load .env.local manually
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

if (!KEY) {
  console.error('❌ BLACKBOX_API_KEY not set in .env.local');
  process.exit(1);
}
console.log('✅ API key loaded:', KEY.slice(0, 12) + '...');
console.log('   API URL       :', URL);
console.log();

async function main() {
  // List models
  const r = await fetch(`${URL}/v1/models`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  console.log('GET /v1/models →', r.status);
  if (!r.ok) {
    console.error(await r.text());
    return;
  }
  const data = await r.json();
  const all = data?.data || [];
  console.log(`Found ${all.length} models\n`);

  // Group by category
  const imageModels = all.filter(m => /flux|sdxl|stable-diffusion|dalle|imagen|dall-e|midjourney|pollinations/i.test(m.id));
  const videoModels = all.filter(m => /veo|kling|runway|sora|video|luma|pika|stable-video|wan|cogvideo|hunyuan|haiper/i.test(m.id));
  const editModels = all.filter(m => /edit|inpaint|kontext|nano-banana|gemini.*image/i.test(m.id));

  console.log('🖼️  IMAGE MODELS:');
  imageModels.forEach(m => console.log('   ', m.id));
  console.log();

  console.log('✂️  IMAGE EDIT MODELS:');
  editModels.forEach(m => console.log('   ', m.id));
  console.log();

  console.log('🎬 VIDEO MODELS:');
  videoModels.forEach(m => console.log('   ', m.id));
  console.log();

  // Test one image generation
  console.log('🧪 Testing image gen with flux-schnell...');
  try {
    const ir = await fetch(`${URL}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify({
        model: 'blackboxai/black-forest-labs/flux-schnell',
        prompt: 'a red apple on a white table',
        n: 1,
        size: '512x512',
      }),
    });
    console.log('   →', ir.status);
    const txt = await ir.text();
    console.log('   ', txt.slice(0, 400));
  } catch (e) {
    console.log('   error:', e.message);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
