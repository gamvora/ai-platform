import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-server';
import { rateLimit } from '@/lib/rateLimit';
import { addGeneration, listGenerations, newId } from '@/lib/db';
import fs from 'node:fs/promises';
import path from 'node:path';

export const maxDuration = 180;
export const runtime = 'nodejs';

const VIDEO_BASE = 'https://image.pollinations.ai/prompt';

async function persistRemoteVideo(remoteUrl: string, id: string): Promise<string> {
  if (!remoteUrl) return remoteUrl;
  if (remoteUrl.startsWith('/')) return remoteUrl;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 150_000);
    const res = await fetch(remoteUrl, {
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; NovaAI/1.0)' },
    });
    clearTimeout(t);
    if (!res.ok) return remoteUrl;

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const isVideo = contentType.startsWith('video/') || contentType.includes('octet-stream');
    const isImage = contentType.startsWith('image/');

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 256) return remoteUrl;

    let ext = 'mp4';
    if (isImage) {
      // Pollinations video endpoint sometimes returns a GIF/image for short clips
      if (contentType.includes('gif')) ext = 'gif';
      else if (contentType.includes('webp')) ext = 'webp';
      else ext = 'gif';
    } else if (isVideo) {
      if (contentType.includes('webm')) ext = 'webm';
      else ext = 'mp4';
    }

    const dir = path.join(process.cwd(), 'public', 'generated');
    await fs.mkdir(dir, { recursive: true });
    const filename = `${id}.${ext}`;
    await fs.writeFile(path.join(dir, filename), buf);
    return `/generated/${filename}`;
  } catch {
    return remoteUrl;
  }
}

/**
 * POST /api/video
 * Generates a video via Pollinations.ai (free, no API key).
 * Body: { prompt }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const rl = rateLimit(`video:${user.id}`, 5);
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });

  try {
    const body = await req.json();
    const prompt: string = (body?.prompt || '').trim();

    if (!prompt || prompt.length < 2) {
      return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 });
    }

    const seed = Math.floor(Math.random() * 1_000_000);
    const params = new URLSearchParams({
      model: 'turbo',
      width: '1280',
      height: '720',
      seed: String(seed),
      nologo: 'true',
      enhance: 'true',
    });
    const pollUrl = `${VIDEO_BASE}/${encodeURIComponent(prompt)}?${params}`;

    const id = newId();
    const localUrl = await persistRemoteVideo(pollUrl, id);

    const now = new Date().toISOString();
    const item: any = {
      id,
      userId: user.id,
      type: 'video' as const,
      prompt,
      url: localUrl,
      createdAt: now,
      model: 'flux-turbo',
      provider: 'pollinations',
    };
    await addGeneration(item);

    return NextResponse.json({
      video: {
        id: item.id,
        prompt: item.prompt,
        url: item.url,
        createdAt: item.createdAt,
        model: item.model,
        provider: item.provider,
      },
    });
  } catch (err: any) {
    console.error('[video]', err);
    return NextResponse.json({ error: err?.message || 'Video generation failed.' }, { status: 500 });
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const gens = await listGenerations(user.id, 'video');
  return NextResponse.json({
    videos: gens.map((g: any) => ({
      id: g.id,
      prompt: g.prompt,
      url: g.url,
      createdAt: g.createdAt,
      model: g?.model,
      provider: g?.provider,
    })),
  });
}
