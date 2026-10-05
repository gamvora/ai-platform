import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-server';
import { rateLimit } from '@/lib/rateLimit';
import { addGeneration, listGenerations, newId } from '@/lib/db';
import fs from 'node:fs/promises';
import path from 'node:path';

export const maxDuration = 120;
export const runtime = 'nodejs';

const POLL_BASE = 'https://image.pollinations.ai/prompt';

/** Try to fetch an image from Pollinations, retrying on 402/upstream errors. */
async function generateImageURL(
  prompt: string,
  w: number,
  h: number,
  maxAttempts = 5
): Promise<{ url: string; localUrl: string | null }> {
  let lastError = '';
  for (let i = 0; i < maxAttempts; i++) {
    const seed = Math.floor(Math.random() * 9_999_999);
    const rawUrl = `${POLL_BASE}/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true`;

    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 60_000);
      const res = await fetch(rawUrl, {
        signal: controller.signal,
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; NovaAI/1.0)' },
      });
      clearTimeout(t);

      if (res.ok) {
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        const isImage = ct.startsWith('image/') || ct.includes('octet-stream');
        const buf = Buffer.from(await res.arrayBuffer());
        if ((isImage || buf.length > 5000) && buf.length < 10_000_000) {
          return { url: rawUrl, localUrl: null };
        }
      }
    } catch (err: any) {
      lastError = err?.message || 'unknown';
    }

    if (i < maxAttempts - 1) await new Promise((r) => setTimeout(r, 600 + i * 200));
  }
  throw new Error(lastError || 'خدمة توليد الصور غير متاحة مؤقتاً');
}

/** Save a remote image to public/generated/<id>.<ext>. */
async function saveGeneratedImage(remoteUrl: string, id: string): Promise<string> {
  const res = await fetch(remoteUrl, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; NovaAI/1.0)' },
  });
  if (!res.ok) throw new Error('Failed to download generated image');

  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) throw new Error('Invalid image data');

  let ext = 'jpg';
  if (buf.length >= 8) {
    const sig = buf.subarray(0, 12);
    if (sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47) ext = 'png';
    else if (sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff) ext = 'jpg';
    else if (sig[0] === 0x47 && sig[1] === 0x49 && sig[2] === 0x46 && sig[3] === 0x38) ext = 'gif';
    else if (sig[0] === 0x52 && sig[1] === 0x49 && sig[2] === 0x46 && sig[3] === 0x46 && sig[8] === 0x57 && sig[9] === 0x45 && sig[10] === 0x42 && sig[11] === 0x50) ext = 'webp';
  }

  const dir = path.join(process.cwd(), 'public', 'generated');
  await fs.mkdir(dir, { recursive: true });
  const filename = `${id}.${ext}`;
  await fs.writeFile(path.join(dir, filename), buf);
  return `/generated/${filename}`;
}

/**
 * POST /api/image
 * Generates an image via Pollinations.ai with automatic retries.
 * Body: { prompt, size?, style? }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const rl = rateLimit(`image:${user.id}`, 5);
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded. Please wait a moment.' }, { status: 429 });

  try {
    const body = await req.json();
    const prompt: string = (body?.prompt || '').trim();
    const size: string = body?.size || '1024x1024';
    const style: string = body?.style || '';

    if (!prompt || prompt.length < 2) {
      return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 });
    }

    const [w, h] = size.split('x').map((n) => parseInt(n, 10) || 1024);

    const styleSuffixes: Record<string, string> = {
      realistic: ', hyperrealistic photography, 8k, dramatic lighting, professional',
      anime: ', anime style, studio ghibli, vibrant colors, clean linework',
      '3d': ', 3d render, octane render, volumetric lighting, pbr',
      fantasy: ', fantasy concept art, epic, magical atmosphere, artstation trending',
      cinematic: ', cinematic still, film grain, shallow depth of field, moody lighting',
    };
    const finalPrompt = prompt + (styleSuffixes[style] || '');

    // Generate image with retries
    const { url: image_url, localUrl } = await generateImageURL(finalPrompt, w, h, 5);
    const savedUrl = localUrl || image_url;

    const id = newId();
    const now = new Date().toISOString();

    // Save to DB
    await addGeneration({
      id,
      userId: user.id,
      type: 'image',
      prompt,
      url: savedUrl,
      createdAt: now,
    });

    return NextResponse.json({
      images: [{
        id,
        prompt,
        url: savedUrl,
        createdAt: now,
        model: 'pollinations-free',
      }],
    });
  } catch (err: any) {
    console.error('[image]', err?.message);
    return NextResponse.json(
      { error: err?.message || 'فشل توليد الصورة. حاول مرة أخرى بعد لحظة.' },
      { status: 503 }
    );
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const gens = await listGenerations(user.id, 'image');
  return NextResponse.json({
    images: gens.map((g: any) => ({
      id: g.id, prompt: g.prompt, url: g.url, createdAt: g.createdAt, model: g?.model,
    })),
  });
}
