import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-server';
import { rateLimit } from '@/lib/rateLimit';
import { generateVideo, persistRemoteImage, BlackboxError } from '@/lib/blackbox';
import { addGeneration, listGenerations, newId, type Generation } from '@/lib/db';

export const maxDuration = 120;
export const runtime = 'nodejs';

/**
 * POST /api/video — generate a short video (or frame slideshow fallback)
 *
 * Response shape:
 *   { kind: 'video', video: { id, prompt, url, createdAt } }
 * OR (when upstream paid provider is out of credits):
 *   { kind: 'frames', video: { id, prompt, url (first frame), createdAt },
 *     frames: string[], notice: string }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const rl = rateLimit(`video:${user.id}`, 5);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please slow down.' },
      { status: 429 }
    );
  }

  try {
    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 3) {
      return NextResponse.json(
        { error: 'Please provide a longer prompt.' },
        { status: 400 }
      );
    }

    let result: Awaited<ReturnType<typeof generateVideo>>;
    try {
      result = await generateVideo(prompt.trim(), { allowFramesFallback: true });
    } catch (err: any) {
      const friendly =
        err instanceof BlackboxError
          ? err.message
          : err?.message || 'Video generation failed. Please try again.';
      console.error('[video] generation error:', friendly);
      const status = err instanceof BlackboxError ? err.upstreamStatus || 502 : 502;
      return NextResponse.json({ error: friendly }, { status });
    }

    const now = new Date().toISOString();

    if (result.kind === 'video' && result.videoUrl) {
      const item: Generation = {
        id: newId(),
        userId: user.id,
        type: 'video',
        prompt: prompt.trim(),
        url: result.videoUrl,
        createdAt: now,
      };
      await addGeneration(item);
      return NextResponse.json({
        kind: 'video',
        video: {
          id: item.id,
          prompt: item.prompt,
          url: item.url,
          createdAt: item.createdAt,
        },
      });
    }

    // Frame slideshow fallback — persist each frame locally so the client
    // gets instant reloads from /generated/... and isn't blocked on slow
    // Pollinations roundtrips.
    if (result.kind === 'frames' && result.frames?.length) {
      const persistedFrames = await Promise.all(
        result.frames.map(async (frameUrl, i) => {
          try {
            return await persistRemoteImage(frameUrl, `${newId()}-f${i}`);
          } catch {
            return frameUrl; // fallback to remote URL if persist fails
          }
        })
      );

      const item: Generation = {
        id: newId(),
        userId: user.id,
        type: 'video',
        prompt: prompt.trim(),
        // Store first (persisted) frame as representative URL
        url: persistedFrames[0],
        createdAt: now,
      };
      await addGeneration(item);
      return NextResponse.json({
        kind: 'frames',
        video: {
          id: item.id,
          prompt: item.prompt,
          url: item.url,
          createdAt: item.createdAt,
        },
        frames: persistedFrames,
        notice:
          'Real video generation is temporarily unavailable (upstream provider out of credits). Showing a free frame-based slideshow preview instead.',
      });
    }

    return NextResponse.json(
      { error: 'No video returned. Try rephrasing your prompt.' },
      { status: 502 }
    );
  } catch (err: any) {
    console.error('[video]', err);
    return NextResponse.json(
      { error: err?.message || 'Video generation failed.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const gens = await listGenerations(user.id, 'video');
  return NextResponse.json({
    videos: gens.map((g) => ({
      id: g.id,
      prompt: g.prompt,
      url: g.url,
      createdAt: g.createdAt,
    })),
  });
}
