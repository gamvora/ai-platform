import { createTransformRoute } from '@/lib/transform-route';

export const maxDuration = 120;
export const runtime = 'nodejs';

/**
 * POST /api/face-swap — swap the face from a target image onto the source.
 *
 * Body: { imageUrl: string, targetFaceUrl: string, prompt?: string }
 *
 * Because we currently run through the editImage → Pollinations img2img
 * pipeline (text-guided), a true face-swap isn't possible via a single
 * reference image URL. We construct a descriptive prompt that asks for a
 * face from the reference (by URL) placed on the source subject, which
 * gives a best-effort stylistic result. When the Blackbox vision chat is
 * available, the model can follow both images; otherwise Pollinations
 * applies the prompt to the source image only.
 */
const { POST, GET } = createTransformRoute({
  slug: 'face-swap',
  rateLimitMax: 6,
  buildPrompt: (userPrompt, extras) => {
    const face = extras?.targetFaceUrl ? ` Target face reference: ${extras.targetFaceUrl}.` : '';
    const style = userPrompt ? ` Additional notes: ${userPrompt}.` : '';
    return `Perform a realistic face-swap: replace the face of the main subject in the source image with the face from the reference image, while keeping pose, lighting, body, and background unchanged. Preserve skin tone blending and sharp facial features.${face}${style}`;
  },
});

export { POST, GET };
