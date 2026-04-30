import { createTransformRoute } from '@/lib/transform-route';

export const maxDuration = 120;
export const runtime = 'nodejs';

/**
 * POST /api/sketch — sketch-to-image: turn a user's rough sketch, line
 * drawing, or doodle into a finished illustration or photoreal render.
 *
 * Body: { imageUrl: string, prompt?: string }
 *
 * Prompt is strongly recommended ("a red sports car in a desert"). When
 * omitted, we ask for a clean photoreal rendering of the sketch as-is.
 */
const { POST, GET } = createTransformRoute({
  slug: 'sketch',
  rateLimitMax: 15,
  buildPrompt: (userPrompt) => {
    if (userPrompt) {
      return (
        `Use the provided sketch/line drawing as a structural reference and ` +
        `render it as a finished, highly-detailed image of: ${userPrompt}. ` +
        `Follow the sketch's composition and proportions exactly, add rich ` +
        `colors, realistic lighting, fine details and texture.`
      );
    }
    return (
      `Use the provided sketch/line drawing as a structural reference and ` +
      `render it as a finished, vibrant, photoreal illustration. Preserve ` +
      `the sketch's composition, add rich colors, realistic lighting, and ` +
      `fine detail while staying faithful to the drawn lines.`
    );
  },
});

export { POST, GET };
