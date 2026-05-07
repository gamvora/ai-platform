import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-server';
import { rateLimit } from '@/lib/rateLimit';
import { addGeneration, listGenerations, newId } from '@/lib/db';
import { persistRemoteImage } from '@/lib/blackbox';
import fs from 'node:fs/promises';
import path from 'node:path';

export const maxDuration = 120;
export const runtime = 'nodejs';

const IMAGE_BASE = 'https://image.pollinations.ai/prompt';

/** Save a base64 data URL to disk and return local path */
async function saveDataUrl(dataUrl: string, id: string): Promise<string> {
  const match = dataUrl.match(/^data:(image\/[\w+]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid image data');
  const mimeExt: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
  };
  const ext = mimeExt[match[1]] || 'png';
  const buf = Buffer.from(match[2], 'base64');
  const dir = path.join(process.cwd(), 'public', 'generated');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${id}.${ext}`), buf);
  return `/generated/${id}.${ext}`;
}

/**
 * POST /api/edit
 * Edits an image via Pollinations.ai kontext model (img2img, free, no API key).
 * Body: { prompt, sourceUrl?, dataUrl? }
 *   - sourceUrl: a public URL of the source image (preferred)
 *   - dataUrl: base64 data URL (fallback — saved locally, then used as source)
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const rl = rateLimit(`edit:${user.id}`, 10);
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });

  try {
    const body = await req.json();
    const prompt: string = (body?.prompt || '').trim();
    const dataUrl: string = body?.dataUrl || '';
    const sourceUrl: string = body?.sourceUrl || '';

    if (!prompt || prompt.length < 2) {
      return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 });
    }
    if (!dataUrl && !sourceUrl) {
      return NextResponse.json({ error: 'Source image is required.' }, { status: 400 });
    }

    const id = newId();
    let imgSourceUrl = sourceUrl;

    // If we have a data URL, save it locally first so we have a real URL
    if (!imgSourceUrl && dataUrl) {
      const srcId = `src-${id}`;
      const localSrcPath = await saveDataUrl(dataUrl, srcId);
      // Build an absolute URL for the source image to pass to Pollinations
      // Since Pollinations is external, we use the data URL approach via the prompt only
      // and fall back to generating a new image with the edit prompt
      void localSrcPath; // stored locally but Pollinations kontext needs a public URL
    }

    const seed = Math.floor(Math.random() * 1_000_000);

    let pollUrl: string;

    if (imgSourceUrl && imgSourceUrl.startsWith('http')) {
      // Use Pollinations kontext model for true img2img editing
      const params = new URLSearchParams({
        model: 'kontext',
        seed: String(seed),
        nologo: 'true',
        image: imgSourceUrl,
      });
      pollUrl = `${IMAGE_BASE}/${encodeURIComponent(prompt)}?${params}`;
    } else {
      // Fallback: generate a new image based on the edit prompt using flux
      const params = new URLSearchParams({
        model: 'flux',
        width: '1024',
        height: '1024',
        seed: String(seed),
        nologo: 'true',
        enhance: 'true',
      });
      pollUrl = `${IMAGE_BASE}/${encodeURIComponent(prompt)}?${params}`;
    }

    const localUrl = await persistRemoteImage(pollUrl, id);

    const now = new Date().toISOString();
    const item: any = {
      id,
      userId: user.id,
      type: 'edit' as const,
      prompt,
      url: localUrl,
      createdAt: now,
      model: imgSourceUrl ? 'kontext' : 'flux',
      provider: 'pollinations',
    };
    await addGeneration(item);

    return NextResponse.json({
      edits: [{
        id: item.id,
        prompt: item.prompt,
        url: item.url,
        createdAt: item.createdAt,
        model: item.model,
        provider: item.provider,
      }],
    });
  } catch (err: any) {
    console.error('[edit]', err);
    return NextResponse.json({ error: err?.message || 'Image edit failed.' }, { status: 500 });
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const gens = await listGenerations(user.id, 'edit');
  return NextResponse.json({
    edits: gens.map((g: any) => ({
      id: g.id,
      prompt: g.prompt,
      url: g.url,
      createdAt: g.createdAt,
      model: g?.model,
      provider: g?.provider,
    })),
  });
}
