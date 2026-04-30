import { createTransformRoute } from '@/lib/transform-route';

export const maxDuration = 120;
export const runtime = 'nodejs';

/**
 * POST /api/outfit-swap — change the subject's clothing/outfit based on a
 * text description while preserving face, body, pose and background.
 *
 * Body: { imageUrl: string, prompt: string }
 */
const { POST, GET } = createTransformRoute({
  slug: 'outfit-swap',
  rateLimitMax: 10,
  requireUserPrompt: true,
  minUserPromptLen: 3,
  buildPrompt: (userPrompt) =>
    `Change the outfit of the main subject in the image to: ${userPrompt}. ` +
    `Keep the exact same face, body proportions, pose, hair, and background. ` +
    `Natural fabric texture, realistic lighting, photoreal unless otherwise specified.`,
});

export { POST, GET };
