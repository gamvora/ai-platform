import { createTransformRoute } from '@/lib/transform-route';

export const maxDuration = 120;
export const runtime = 'nodejs';

/**
 * POST /api/upscale — sharpen + enlarge an image, adding photographic detail.
 *
 * Body: { imageUrl: string, prompt?: string }
 *
 * With our Pollinations img2img fallback we can't do true super-resolution;
 * instead we re-render at higher resolution with a "enhance, sharpen, 4k"
 * prompt which in practice yields a crisper, more detailed result. When
 * users provide custom prompts (e.g. "remove noise") we append them.
 */
const { POST, GET } = createTransformRoute({
  slug: 'upscale',
  rateLimitMax: 15,
  buildPrompt: (userPrompt) => {
    const extra = userPrompt ? ` ${userPrompt}.` : '';
    return (
      `Enhance and upscale this image to ultra-high resolution. Sharpen all ` +
      `edges, recover lost detail, remove compression artifacts, boost clarity, ` +
      `preserve colors, natural skin texture, 4k photorealistic quality.${extra}`
    );
  },
});

export { POST, GET };
