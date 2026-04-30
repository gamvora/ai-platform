import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-server';
import { rateLimit } from '@/lib/rateLimit';
import { editImage, persistRemoteImage } from '@/lib/blackbox';
import { addGeneration, listGenerations, newId, type Generation } from '@/lib/db';

export const maxDuration = 120;
export const runtime = 'nodejs';

/**
 * POST /api/edit — img2img: edit an existing image with a text prompt.
 *
 * Body: { prompt: string, imageUrl: string }
 *   imageUrl can be absolute (https://...) or a relative /uploads/... path
 *   from the /api/upload endpoint; we auto-prepend the host in that case.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const rl = rateLimit(`edit:${user.id}`, 10);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please slow down.' },
      { status: 429 }
    );
  }

  try {
    const { prompt, imageUrl } = await req.json();
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 3) {
      return NextResponse.json(
        { error: 'Please provide a longer edit prompt.' },
        { status: 400 }
      );
    }
    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json(
        { error: 'Source image URL is required.' },
        { status: 400 }
      );
    }

    // Derive public host from the incoming request so relative /uploads/ paths
    // can be exposed to Pollinations (which needs an absolute URL).
    const proto = req.headers.get('x-forwarded-proto') || 'http';
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
    const publicHost = `${proto}://${host}`;

    let urls: string[] = [];
    try {
      urls = await editImage(prompt.trim(), imageUrl, { publicHost });
    } catch (err: any) {
      console.error('[edit] generation error:', err?.message);
      return NextResponse.json(
        { error: 'Image edit failed. Please try again.' },
        { status: 502 }
      );
    }

    if (!urls.length) {
      return NextResponse.json(
        { error: 'No edited image returned. Try rephrasing your prompt.' },
        { status: 502 }
      );
    }

    const now = new Date().toISOString();
    // Persist the generated edited image locally so the client loads it instantly.
    const persisted = await Promise.all(
      urls.map(async (u) => {
        const id = newId();
        const localUrl = await persistRemoteImage(u, id);
        return { id, url: localUrl };
      })
    );
    const items: Generation[] = persisted.map((p) => ({
      id: p.id,
      userId: user.id,
      type: 'edit' as const,
      prompt: prompt.trim(),
      url: p.url,
      createdAt: now,
    }));

    for (const item of items) await addGeneration(item);

    return NextResponse.json({
      edits: items.map((i) => ({
        id: i.id,
        prompt: i.prompt,
        url: i.url,
        createdAt: i.createdAt,
      })),
    });
  } catch (err: any) {
    console.error('[edit]', err);
    return NextResponse.json(
      { error: err?.message || 'Image edit failed.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const gens = await listGenerations(user.id, 'edit');
  return NextResponse.json({
    edits: gens.map((g) => ({
      id: g.id,
      prompt: g.prompt,
      url: g.url,
      createdAt: g.createdAt,
    })),
  });
}
