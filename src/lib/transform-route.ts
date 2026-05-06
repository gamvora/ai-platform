/**
 * Shared factory for img2img transform API routes.
 *
 * All of Phase C's AI feature routes (face-swap, outfit-swap, upscale,
 * remove-bg, sketch-to-image) are thin wrappers around `editImage` with a
 * task-specific prompt wrapper. This factory eliminates duplication.
 *
 * Each generation is stored with `type='edit'` and prompt prefixed by
 *   [<feature>] <user prompt>
 * so that per-feature GET calls can filter their own history while the
 * dashboard "edits" counter still includes them all.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-server';
import { rateLimit } from '@/lib/rateLimit';
import { editImage, persistRemoteImage } from '@/lib/blackbox';
import { addGeneration, listGenerations, newId, type Generation } from '@/lib/db';

export interface TransformRouteConfig {
  /** Short identifier, used as prompt prefix tag, e.g. "face-swap". */
  slug: string;
  /** Rate-limit bucket name (usually same as slug). */
  rateLimitKey?: string;
  /** Max requests per minute per user. Default 10. */
  rateLimitMax?: number;
  /**
   * Build the actual prompt sent to editImage from the user's input.
   * Receives: the user's prompt (possibly empty if optional) and any extra
   * params from the request body. Returns the final prompt string.
   */
  buildPrompt: (userPrompt: string, extras?: Record<string, any>) => string;
  /**
   * Whether the user must supply their own prompt text in addition to the
   * image. Tools like "upscale" or "remove-bg" don't need it, but "face-swap"
   * and "outfit-swap" do (or can use their own fixed prompt).
   * Default: false — user prompt is optional.
   */
  requireUserPrompt?: boolean;
  /**
   * Minimum length of user prompt when required. Default 3.
   */
  minUserPromptLen?: number;
}

export function createTransformRoute(config: TransformRouteConfig) {
  const slug = config.slug;
  const bucket = config.rateLimitKey || slug;
  const limit = config.rateLimitMax ?? 10;
  const tag = `[${slug}]`;

  async function POST(req: NextRequest) {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const rl = rateLimit(`${bucket}:${user.id}`, limit);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please slow down.' },
        { status: 429 }
      );
    }

    try {
      const body = await req.json().catch(() => ({}));
      const { prompt, imageUrl, model, ...extras } = body as {
        prompt?: string;
        imageUrl?: string;
        model?: string;
        [k: string]: any;
      };

      if (!imageUrl || typeof imageUrl !== 'string') {
        return NextResponse.json(
          { error: 'Source image URL is required.' },
          { status: 400 }
        );
      }

      const userPrompt = (prompt || '').trim();
      if (config.requireUserPrompt) {
        const min = config.minUserPromptLen ?? 3;
        if (userPrompt.length < min) {
          return NextResponse.json(
            { error: `Please provide a longer prompt (min ${min} chars).` },
            { status: 400 }
          );
        }
      }

      const finalPrompt = config.buildPrompt(userPrompt, extras);

      // Build absolute host for Pollinations img2img fallback.
      const proto = req.headers.get('x-forwarded-proto') || 'http';
      const host =
        req.headers.get('x-forwarded-host') ||
        req.headers.get('host') ||
        'localhost:3000';
      const publicHost = `${proto}://${host}`;

      // NOTE:
      // editImage currently returns string[] URLs. We keep strong metadata here
      // by carrying requested/effective/provider explicitly at route layer.
      const requestedModel = (model || 'auto').toString();
      const effectiveModel = requestedModel;
      const provider = 'pollinations';

      let urls: string[] = [];
      try {
        urls = await editImage(finalPrompt, imageUrl, { publicHost });
      } catch (err: any) {
        console.error(`[${slug}] generation error:`, err?.message);
        return NextResponse.json(
          {
            error: `${slug} failed. Please try again.`,
            requestedModel,
            effectiveModel,
            provider,
          },
          { status: 502 }
        );
      }

      if (!urls.length) {
        return NextResponse.json(
          {
            error: 'No result image returned. Try rephrasing or another source.',
            requestedModel,
            effectiveModel,
            provider,
          },
          { status: 502 }
        );
      }

      const now = new Date().toISOString();
      const persisted = await Promise.all(
        urls.map(async (u) => {
          const id = newId();
          const localUrl = await persistRemoteImage(u, id);
          return { id, url: localUrl };
        })
      );

      // Store with tagged prompt so per-feature GET can filter its own items.
      const storedPrompt = `${tag} ${userPrompt || finalPrompt}`.trim();

      const items: (Generation & {
        requestedModel?: string;
        effectiveModel?: string;
        provider?: string;
      })[] = persisted.map((p) => ({
        id: p.id,
        userId: user.id,
        type: 'edit' as const,
        prompt: storedPrompt,
        url: p.url,
        createdAt: now,
        requestedModel,
        effectiveModel,
        provider,
      }));

      for (const item of items) await addGeneration(item);

      return NextResponse.json({
        items: items.map((i) => ({
          id: i.id,
          prompt: stripTag(i.prompt, tag),
          url: i.url,
          createdAt: i.createdAt,
          requestedModel: i.requestedModel,
          effectiveModel: i.effectiveModel,
          provider: i.provider,
        })),
      });
    } catch (err: any) {
      console.error(`[${slug}]`, err);
      return NextResponse.json(
        { error: err?.message || `${slug} failed.` },
        { status: 500 }
      );
    }
  }

  async function GET() {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const gens = await listGenerations(user.id, 'edit');
    const mine = gens.filter((g) => g.prompt.startsWith(tag));
    return NextResponse.json({
      items: mine.map((g: any) => ({
        id: g.id,
        prompt: stripTag(g.prompt, tag),
        url: g.url,
        createdAt: g.createdAt,
        requestedModel: g?.requestedModel,
        effectiveModel: g?.effectiveModel,
        provider: g?.provider,
      })),
    });
  }

  return { POST, GET };
}

function stripTag(prompt: string, tag: string): string {
  if (prompt.startsWith(tag)) {
    return prompt.slice(tag.length).trimStart();
  }
  return prompt;
}
