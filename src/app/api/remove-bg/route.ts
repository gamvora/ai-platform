import { createTransformRoute } from '@/lib/transform-route';

export const maxDuration = 120;
export const runtime = 'nodejs';

/**
 * POST /api/remove-bg — replace the image background.
 *
 * Body: { imageUrl: string, prompt?: string }
 *
 * When prompt is blank → solid transparent/white studio background.
 * When prompt is provided → use it as the new scene.
 *
 * True alpha-channel background removal isn't possible via our img2img
 * fallback, so we instead render a clean studio/white background around
 * the subject; users can download and finalize in an external editor if
 * they need transparency.
 */
const { POST, GET } = createTransformRoute({
  slug: 'remove-bg',
  rateLimitMax: 15,
  buildPrompt: (userPrompt) => {
    if (userPrompt) {
      return (
        `Replace the background of this image with: ${userPrompt}. ` +
        `Keep the main subject perfectly intact with clean edges, realistic lighting ` +
        `matching the new scene, photoreal.`
      );
    }
    return (
      `Remove the background from this image and replace it with a clean, ` +
      `pure white seamless studio background. Preserve the main subject with ` +
      `crisp edges, soft professional lighting, no shadows beneath.`
    );
  },
});

export { POST, GET };
