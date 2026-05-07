import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-server';
import { rateLimit } from '@/lib/rateLimit';
import { addGeneration, listGenerations, newId } from '@/lib/db';
import { persistRemoteImage } from '@/lib/blackbox';

export const maxDuration = 120;
export const runtime = 'nodejs';

const IMAGE_BASE = 'https://image.pollinations.ai/prompt';

/**
 * POST /api/image
 * Generates an image via Pollinations.ai (free, no API key).
 * Body: { prompt, size?, style? }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const rl = rateLimit(`image:${user.id}`, 10);
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });

  try {
    const body = await req.json();
    const prompt: string = (body?.prompt || '').trim();
    const size: string = body?.size || '1024x1024';
    const style: string = body?.style || '';

    if (!prompt || prompt.length < 2) {
      return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 });
    }

    const [w, h] = size.split('x').map((n) => parseInt(n) || 1024);

    const styleSuffixes: Record<string, string> = {
      realistic: ', hyperrealistic photography, 8k, dramatic lighting',
      anime: ', anime style, studio ghibli, vibrant colors',
      '3d': ', 3d render, octane render, volumetric lighting',
      fantasy: ', fantasy concept art, epic, magical atmosphere',
      cinematic: ', cinematic still, film grain, moody lighting',
    };
    const finalPrompt = prompt + (styleSuffixes[style] || '');

    const seed = Math.floor(Math.random() * 1_000_000);
    const params = new URLSearchParams({
      width: String(w),
      height: String(h),
      seed: String(seed),
      nologo: 'true',
      model: 'flux',
      enhance: 'true',
    });
    const pollUrl = `${IMAGE_BASE}/${encodeURIComponent(finalPrompt)}?${params}`;

    const id = newId();
    const localUrl = await persistRemoteImage(pollUrl, id);

    const now = new Date().toISOString();
    const item: any = {
      id,
      userId: user.id,
      type: 'image' as const,
      prompt,
      url: localUrl,
      createdAt: now,
      model: 'flux',
      provider: 'pollinations',
    };
    await addGeneration(item);

    return NextResponse.json({
      images: [{ id: item.id, prompt: item.prompt, url: item.url, createdAt: item.createdAt, model: item.model }],
    });
  } catch (err: any) {
    console.error('[image]', err);
    return NextResponse.json({ error: err?.message || 'Image generation failed.' }, { status: 500 });
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
