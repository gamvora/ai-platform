#!/usr/bin/env node
// Try video via /chat/completions (Blackbox routes video models this way sometimes)
// Also test Pollinations for images+edit to confirm they work.
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const KEY = process.env.BLACKBOX_API_KEY;
const URL = process.env.BLACKBOX_API_URL || 'https://api.blackbox.ai';

async function chat(model, prompt) {
  const r = await fetch(`${URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 400 }),
  });
  const txt = await r.text();
  return { status: r.status, body: txt };
}

async function main() {
  console.log('\n=== TEST VIDEO via /chat/completions ===');
  const videoModels = [
    'blackboxai/google/veo-3-fast',
    'blackboxai/sora-2-text-to-video',
    'blackboxai/veo-3.1-fast',
    'blackboxai/google/veo-2',
  ];
  for (const m of videoModels) {
    const r = await chat(m, 'Generate a 3-second video of a cat walking in a garden.');
    const snip = r.body.replace(/\s+/g, ' ').slice(0, 250);
    const urlMatch = r.body.match(/https?:\/\/\S+?\.(?:mp4|webm|mov)/i);
    const anyUrl = r.body.match(/https?:\/\/[^\s"',]+/);
    console.log(`  ${m}`);
    console.log(`    status=${r.status}${urlMatch ? ' ✅ VIDEO_URL: ' + urlMatch[0] : anyUrl ? ' (url: ' + anyUrl[0].slice(0,80) + ')' : ''}`);
    console.log(`    ${snip}`);
  }

  console.log('\n=== TEST Pollinations (image gen, free) ===');
  const pollUrl = 'https://image.pollinations.ai/prompt/a%20red%20apple%20on%20a%20white%20table?width=512&height=512&seed=42&nologo=true';
  const pr = await fetch(pollUrl);
  console.log('  ', pollUrl);
  console.log(`   status=${pr.status} content-type=${pr.headers.get('content-type')} size=${pr.headers.get('content-length') || '?'}`);

  console.log('\n=== TEST Pollinations img2img (edit) ===');
  const srcImg = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Red_Apple.jpg/320px-Red_Apple.jpg';
  const edUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent('make it green')}?image=${encodeURIComponent(srcImg)}&width=512&height=512&seed=7&nologo=true`;
  const er = await fetch(edUrl);
  console.log('  ', edUrl);
  console.log(`   status=${er.status} content-type=${er.headers.get('content-type')} size=${er.headers.get('content-length') || '?'}`);
}

main().catch(e => { console.error(e); process.exit(1); });
