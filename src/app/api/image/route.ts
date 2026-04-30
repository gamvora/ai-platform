import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-server';
import { rateLimit } from '@/lib/rateLimit';
import { generateImage, persistRemoteImage } from '@/lib/blackbox';
import { addGeneration, listGenerations, newId, type Generation } from '@/lib/db';

export const maxDuration = 120;
export const runtime = 'nodejs';

const VALID_STYLES = ['realistic', 'anime', '3d', 'fantasy', 'cinematic', 'none'] as const;
const VALID_SIZES = ['1024x1024', '1024x1792', '1792x1024', '768x768'] as const;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const rl = rateLimit(`image:${user.id}`, 10);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please slow down.' },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const prompt: string = body?.prompt;
    const rawStyle: string = body?.style ?? 'none';
    const rawSize: string = body?.size ?? '1024x1024';

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 3) {
      return NextResponse.json(
        { error: 'Please provide a longer prompt.' },
        { status: 400 }
      );
    }

    const style = (VALID_STYLES as readonly string[]).includes(rawStyle)
      ? (rawStyle as (typeof VALID_STYLES)[number])
      : 'none';
    const size = (VALID_SIZES as readonly string[]).includes(rawSize) ? rawSize : '1024x1024';

    let remoteUrls: string[] = [];
    try {
      remoteUrls = await generateImage(prompt.trim(), { style, size });
    } catch (err: any) {
      console.error('[image] generation error:', err?.message);
      return NextResponse.json(
        { error: err?.message || 'Image generation failed. Please try again.' },
        { status: 502 }
      );
    }

    if (!remoteUrls.length) {
      return NextResponse.json(
        { error: 'No image returned. Try rephrasing your prompt.' },
        { status: 502 }
      );
    }

    const now = new Date().toISOString();
    const items: Generation[] = [];
    // Persist each remote image locally (parallel) so the client loads instantly.
    const persisted = await Promise.all(
      remoteUrls.map(async (u) => {
        const id = newId();
        const localUrl = await persistRemoteImage(u, id);
        return { id, url: localUrl };
      })
    );
    for (const p of persisted) {
      items.push({
        id: p.id,
        userId: user.id,
        type: 'image' as const,
        prompt: prompt.trim(),
        url: p.url,
        createdAt: now,
      });
    }

    for (const item of items) await addGeneration(item);

    return NextResponse.json({
      images: items.map((i) => ({
        id: i.id,
        prompt: i.prompt,
        url: i.url,
        createdAt: i.createdAt,
      })),
    });
  } catch (err: any) {
    console.error('[image]', err);
    return NextResponse.json(
      { error: err?.message || 'Image generation failed.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const gens = await listGenerations(user.id, 'image');
  return NextResponse.json({
    images: gens.map((g) => ({
      id: g.id,
      prompt: g.prompt,
      url: g.url,
      createdAt: g.createdAt,
    })),
  });
}
