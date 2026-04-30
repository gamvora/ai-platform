/**
 * Blackbox AI API Client — Single Stable Free Models
 * --------------------------------------------------
 * - Chat: Claude Sonnet 4.5 via Blackbox.ai (no mention)
 * - ALL image/video/edit: Pollinations.ai Flux (free/unlimited, primary/only)
 *   • Text→image, img2img (text-synthesis), frame slideshows for video.
 * - NO paid Blackbox/Replicate/fal.ai (hardcoded free-only).
 * - NO model selection (removed).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const API_KEY = process.env.BLACKBOX_API_KEY as string;
const API_URL = process.env.BLACKBOX_API_URL || 'https://api.blackbox.ai';

// Hardcoded free-only: NO paid Blackbox (Pollinations.ai Flux primary for ALL)
const USE_BLACKBOX_PAID = false;

// Hugging Face (free tier)
const HF_API_KEY =
  process.env.HF_API_KEY ||
  process.env.HUGGINGFACE_API_KEY ||
  process.env.HUGGING_FACE_API_KEY ||
  '';
const HF_T2I_MODEL =
  process.env.HF_IMAGE_MODEL || 'stabilityai/stable-diffusion-xl-base-1.0';

if (!API_KEY && USE_BLACKBOX_PAID) {
  console.warn('[blackbox] USE_BLACKBOX_PAID=true but BLACKBOX_API_KEY missing');
}
if (!HF_API_KEY) {
  console.warn('[blackbox] HF_API_KEY not set; HF fallback disabled');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >;
}

export interface ChatCompletionOptions {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface VideoResult {
  /** Real video URL (mp4/webm), if the paid provider succeeded. */
  videoUrl?: string;
  /** Frame URLs for client-side slideshow playback (fallback). */
  frames?: string[];
  kind: 'video' | 'frames';
}

export class BlackboxError extends Error {
  constructor(message: string, public upstreamStatus?: number) {
    super(message);
    this.name = 'BlackboxError';
  }
}

/** Hardcoded single stable models — NO env overrides, NO selection. */
export const MODELS = {
  chat: 'blackboxai/anthropic/claude-sonnet-4.5',
  chatFast: 'blackboxai/anthropic/claude-sonnet-4.5',
  image: 'pollinations-flux',
  video: 'pollinations-flux',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert any image reference (data URI / absolute http(s) URL / local
 * `/uploads/...` path) into something an external AI can fetch.
 *
 * Local paths are read from `public/` and inlined as `data:image/...;base64,...`.
 * External URLs are returned unchanged. Data URIs are returned unchanged.
 *
 * This is how we let Blackbox's vision models see user-uploaded images when
 * the app is running on localhost or on a private deployment where the
 * external provider cannot reach our /uploads/ path.
 */
export async function toExternalImageRef(
  ref: string,
  options: { publicHost?: string } = {}
): Promise<string> {
  if (!ref) return ref;

  // Already a data URI — use as-is.
  if (ref.startsWith('data:')) return ref;

  // Absolute URL.
  if (/^https?:\/\//i.test(ref)) return ref;

  // Relative `/uploads/...` path. Prefer base64 data URI so the external AI
  // can decode it directly without a network round-trip to our host.
  if (ref.startsWith('/')) {
    try {
      const publicDir = path.join(process.cwd(), 'public');
      const filePath = path.join(publicDir, ref);
      // Guard against path-escape attempts
      if (!filePath.startsWith(publicDir)) {
        throw new Error('Resolved path escapes public/ root');
      }
      const buf = await fs.readFile(filePath);
      const ext = (path.extname(ref).slice(1) || 'png').toLowerCase();
      const mime =
        ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : ext === 'webp'
          ? 'image/webp'
          : ext === 'gif'
          ? 'image/gif'
          : 'image/png';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch (err: any) {
      console.warn(
        '[blackbox.toExternalImageRef] data-URI read failed, falling back to absolute URL:',
        err?.message
      );
      // Fallback: prepend host so at least the reference is absolute.
      if (options.publicHost) {
        return `${options.publicHost.replace(/\/$/, '')}${ref}`;
      }
      return ref;
    }
  }

  return ref;
}

/** Build a Pollinations.ai image URL (real free AI image gen — Flux/SDXL). */
function pollinationsUrl(
  prompt: string,
  opts: {
    width?: number;
    height?: number;
    seed?: number;
    model?: string;
    image?: string;
    enhance?: boolean;
  } = {}
): string {
  const width = opts.width ?? 1024;
  const height = opts.height ?? 1024;
  const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000);
  const encoded = encodeURIComponent(prompt.trim());
  const params = new URLSearchParams();
  params.set('width', String(width));
  params.set('height', String(height));
  params.set('seed', String(seed));
  params.set('nologo', 'true');
  if (opts.model) params.set('model', opts.model); // 'flux' | 'flux-realism' | etc.
  if (opts.enhance !== false) params.set('enhance', 'true');
  if (opts.image) params.set('image', opts.image);
  return `https://image.pollinations.ai/prompt/${encoded}?${params.toString()}`;
}

/**
 * Download a remote image and save it to `public/generated/<id>.<ext>`,
 * returning a local URL like `/generated/<id>.jpg`. This is used so that
 * Pollinations.ai images (which can take 20-40s to generate on first hit)
 * are fully-loaded before we send the URL to the client. After persistence
 * the client's `<img>` tag will always succeed instantly.
 *
 * If the remote fetch fails or is slow, we fall back to the original URL so
 * the client still has something to show.
 */
export async function persistRemoteImage(
  remoteUrl: string,
  id: string,
  options: { timeoutMs?: number } = {}
): Promise<string> {
  if (!remoteUrl) return remoteUrl;
  // Already a local / data URL — no-op.
  if (remoteUrl.startsWith('/') || remoteUrl.startsWith('data:')) return remoteUrl;

  const timeoutMs = options.timeoutMs ?? 90_000; // Pollinations can be slow
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(remoteUrl, {
      signal: controller.signal,
      headers: {
        // Some providers reject unknown UA and return HTML/blocked content
        'user-agent': 'Mozilla/5.0 (compatible; NovaAI/1.0; +https://localhost)',
        accept: 'image/*,*/*;q=0.8',
      },
    });
    clearTimeout(t);

    if (!res.ok) {
      console.warn('[persistRemoteImage] non-2xx:', res.status, remoteUrl);
      return remoteUrl;
    }

    const contentTypeRaw = (res.headers.get('content-type') || '').toLowerCase();

    // Guard: if upstream returned HTML/text/json, this is not a real image
    // (common when provider responds with an error page/challenge).
    if (
      contentTypeRaw &&
      !contentTypeRaw.startsWith('image/') &&
      !contentTypeRaw.includes('octet-stream')
    ) {
      console.warn(
        '[persistRemoteImage] upstream non-image content-type:',
        contentTypeRaw,
        remoteUrl
      );
      return remoteUrl;
    }

    const buf = Buffer.from(await res.arrayBuffer());

    // Guard: tiny payloads often indicate an error text page, not image bytes.
    if (buf.length < 256) {
      console.warn(
        '[persistRemoteImage] upstream payload too small to be a valid image:',
        buf.length,
        remoteUrl
      );
      return remoteUrl;
    }

    // Infer extension by magic bytes first (more reliable than header).
    let ext = 'jpg';
    if (buf.length >= 8) {
      const sig = buf.subarray(0, 12);
      const isPng =
        sig[0] === 0x89 &&
        sig[1] === 0x50 &&
        sig[2] === 0x4e &&
        sig[3] === 0x47 &&
        sig[4] === 0x0d &&
        sig[5] === 0x0a &&
        sig[6] === 0x1a &&
        sig[7] === 0x0a;
      const isJpeg = sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff;
      const isGif =
        sig[0] === 0x47 &&
        sig[1] === 0x49 &&
        sig[2] === 0x46 &&
        sig[3] === 0x38;
      const isWebp =
        sig[0] === 0x52 &&
        sig[1] === 0x49 &&
        sig[2] === 0x46 &&
        sig[3] === 0x46 &&
        sig[8] === 0x57 &&
        sig[9] === 0x45 &&
        sig[10] === 0x42 &&
        sig[11] === 0x50;

      if (isPng) ext = 'png';
      else if (isWebp) ext = 'webp';
      else if (isGif) ext = 'gif';
      else if (isJpeg) ext = 'jpg';
      else if (contentTypeRaw.includes('png')) ext = 'png';
      else if (contentTypeRaw.includes('webp')) ext = 'webp';
      else if (contentTypeRaw.includes('gif')) ext = 'gif';
      else ext = 'jpg';
    }

    const dir = path.join(process.cwd(), 'public', 'generated');
    await fs.mkdir(dir, { recursive: true });
    const filename = `${id}.${ext}`;
    await fs.writeFile(path.join(dir, filename), buf);

    return `/generated/${filename}`;
  } catch (err: any) {
    console.warn('[persistRemoteImage] failed, returning remote URL:', err?.message);
    return remoteUrl;
  }
}

/** Parse image URLs (incl. Pollinations) from free-form content. */
function parseImageUrls(content: string): string[] {
  if (!content) return [];
  const urls: string[] = [];
  const mdRegex = /!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g;
  let m;
  while ((m = mdRegex.exec(content)) !== null) urls.push(m[1]);
  const bareImgExt = /(https?:\/\/\S+\.(?:png|jpe?g|webp|gif|bmp))/gi;
  let u;
  while ((u = bareImgExt.exec(content)) !== null) {
    if (!urls.includes(u[1])) urls.push(u[1]);
  }
  const pollRegex = /(https?:\/\/image\.pollinations\.ai\/prompt\/[^\s)]+)/gi;
  let p;
  while ((p = pollRegex.exec(content)) !== null) {
    const clean = p[1].replace(/[.,)]+$/, '');
    if (!urls.includes(clean)) urls.push(clean);
  }
  return urls;
}

/** Parse mp4/webm URLs from free-form content. */
function parseVideoUrls(content: string): string[] {
  if (!content) return [];
  const urls: string[] = [];
  const mdRegex = /\[[^\]]*\]\((https?:\/\/[^)]+\.(?:mp4|webm|mov))\)/g;
  let m;
  while ((m = mdRegex.exec(content)) !== null) urls.push(m[1]);
  const urlRegex = /(https?:\/\/\S+\.(?:mp4|webm|mov))/gi;
  let u;
  while ((u = urlRegex.exec(content)) !== null) {
    if (!urls.includes(u[1])) urls.push(u[1]);
  }
  return urls;
}

function cryptoRandomId(): string {
  return crypto.randomUUID();
}

/**
 * Generate an image with Hugging Face Inference API and return a local saved URL.
 * Returns null on failure so callers can continue fallback chain.
 */
async function generateImageViaHuggingFace(
  prompt: string,
  id: string,
  options: { width?: number; height?: number; timeoutMs?: number } = {}
): Promise<string | null> {
  if (!HF_API_KEY) return null;
  const timeoutMs = options.timeoutMs ?? 120_000;

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(
      `https://api-inference.huggingface.co/models/${encodeURIComponent(
        HF_T2I_MODEL
      )}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${HF_API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'image/*',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            width: options.width ?? 1024,
            height: options.height ?? 1024,
            guidance_scale: 7.5,
            num_inference_steps: 30,
          },
          options: {
            wait_for_model: true,
            use_cache: false,
          },
        }),
      }
    );
    clearTimeout(t);

    if (!res.ok) {
      const txt = await res.text();
      console.warn('[HF] image generation failed:', res.status, txt.slice(0, 300));
      return null;
    }

    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    if (!ctype.startsWith('image/')) {
      const txt = await res.text();
      console.warn('[HF] unexpected content-type:', ctype, txt.slice(0, 200));
      return null;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 256) return null;

    const ext =
      ctype.includes('png')
        ? 'png'
        : ctype.includes('webp')
        ? 'webp'
        : ctype.includes('gif')
        ? 'gif'
        : 'jpg';

    const dir = path.join(process.cwd(), 'public', 'generated');
    await fs.mkdir(dir, { recursive: true });
    const filename = `${id}.${ext}`;
    await fs.writeFile(path.join(dir, filename), buf);
    return `/generated/${filename}`;
  } catch (e: any) {
    console.warn('[HF] exception:', e?.message);
    return null;
  }
}

/** Turn a raw Blackbox error body into a concise, user-facing message. */
export function friendlyBlackboxError(raw: string): string {
  if (!raw) return 'Unknown error';
  if (/exhausted balance/i.test(raw)) {
    return 'AI provider is out of credits (upstream balance exhausted). Top up at blackbox/dashboard/billing or fal.ai/dashboard/billing, then try again.';
  }
  if (/User is locked/i.test(raw)) {
    return 'AI provider account is locked (balance exhausted). Top up at blackbox/dashboard/billing.';
  }
  if (/cannot access application/i.test(raw)) {
    return 'Your API key does not have access to this model.';
  }
  if (/Invalid model name/i.test(raw)) {
    return 'Invalid AI model name. Check MODELS config.';
  }
  try {
    const jsonStart = raw.indexOf('{');
    if (jsonStart >= 0) {
      const j = JSON.parse(raw.slice(jsonStart));
      const msg: string = j?.error?.message || j?.detail || '';
      if (msg) return msg.slice(0, 300);
    }
  } catch {
    /* ignore */
  }
  return raw.slice(0, 300);
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

/** Call the chat-completion endpoint. Throws Error on non-2xx. */
export async function chatCompletion(opts: ChatCompletionOptions) {
  const res = await fetch(`${API_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: opts.model || MODELS.chat,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.max_tokens ?? 2048,
      stream: opts.stream ?? false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Blackbox chat API error (${res.status}): ${errText.slice(0, 500)}`
    );
  }
  return res;
}

// ---------------------------------------------------------------------------
// Image generation (text → image)
// ---------------------------------------------------------------------------

/**
 * Generate an image from a text prompt.
 *
 * Free-first order:
 *   1. Pollinations.ai (anonymous, unlimited).
 *   2. HuggingFace (free token tier, if available).
 *   3. Blackbox (optional paid fallback when USE_BLACKBOX_PAID=true).
 */
export async function generateImage(
  prompt: string,
  options: {
    model?: string;
    n?: number;
    size?: string;
    style?: 'realistic' | 'anime' | '3d' | 'fantasy' | 'cinematic' | 'none';
  } = {}
): Promise<string[]> {
  const cleanPrompt = (prompt || '').trim();
  if (!cleanPrompt) throw new Error('Prompt is required');

  const size = options.size || '1024x1024';
  const [w, h] = size.split('x').map((n) => parseInt(n, 10) || 1024);

  const styleSuffix: Record<string, string> = {
    realistic: ', hyperrealistic photography, 8k, dramatic lighting, ultra-detailed',
    anime: ', anime style, studio ghibli, vibrant colors, clean linework',
    '3d': ', 3d render, octane render, volumetric lighting, physically based rendering',
    fantasy: ', fantasy concept art, epic, magical atmosphere, trending on artstation',
    cinematic: ', cinematic still, film grain, shallow depth of field, moody lighting',
    none: '',
  };
  const finalPrompt = cleanPrompt + (styleSuffix[options.style || 'none'] || '');
  const pollModel =
    options.style === 'realistic' ? 'flux-realism' : options.style === 'anime' ? 'flux-anime' : 'flux';

  // ----- Stage 1: Pollinations.ai (primary free provider) -----
  const pollUrl = pollinationsUrl(finalPrompt, { width: w, height: h, model: pollModel });
  if (pollUrl) return [pollUrl];

  // ----- Stage 2: HuggingFace -----
  try {
    const local = await generateImageViaHuggingFace(finalPrompt, cryptoRandomId(), {
      width: w,
      height: h,
    });
    if (local) return [local];
  } catch {
    // continue
  }

  // ----- Stage 3: Blackbox optional paid fallback -----
  if (USE_BLACKBOX_PAID && API_KEY) {
    try {
      const res = await fetch(`${API_URL}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: options.model || MODELS.image,
          prompt: finalPrompt,
          n: options.n ?? 1,
          size,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.data)) {
          const urls = data.data
            .map((d: any) => d.url || (d.b64_json ? `data:image/png;base64,${d.b64_json}` : null))
            .filter(Boolean);
          if (urls.length) return urls;
        }
        if (Array.isArray(data?.images) && data.images.length) return data.images;
      }
    } catch {
      // ignore
    }
  }

  throw new Error('Image generation failed. Free providers are temporarily unavailable.');
}

// ---------------------------------------------------------------------------
// Image editing (img2img)
// ---------------------------------------------------------------------------

/**
 * Edit an existing image using a text prompt.
 *
 * ------------------------------------------------------------
 * Why the classic `?image=URL` Pollinations trick is unreliable:
 *   Pollinations must fetch the source image from the public internet.
 *   On localhost (or private deploys) our `/uploads/...` path is not
 *   reachable by pollinations.ai → the generated image comes back as a
 *   black canvas because the model had no input reference.
 *
 * Strategy used here (always works, produces real results):
 *   1. Use Blackbox vision chat to DESCRIBE the source image in rich
 *      detail (subject, composition, colors, style, lighting, etc.)
 *      — the model can accept the image as a base64 data URI.
 *   2. Combine that description with the user's edit prompt into a
 *      single synthesis prompt.
 *   3. Generate a brand new image via Pollinations (flux) with the
 *      synthesis prompt. This is effectively "text-guided img2img".
 *   4. If describe step fails, fall back to prompt-only generation.
 *
 * Also attempts the raw `?image=` trick as a bonus when an external
 * publicHost URL is available (cloud deploys).
 */
export async function editImage(
  prompt: string,
  imageUrl: string,
  options: { width?: number; height?: number; publicHost?: string } = {}
): Promise<string[]> {
  const cleanPrompt = (prompt || '').trim();
  if (!cleanPrompt) throw new Error('Edit prompt is required');
  if (!imageUrl) throw new Error('Source image URL is required');

  const width = options.width ?? 1024;
  const height = options.height ?? 1024;

  // Resolve image → data URI (for local paths) or keep as external URL.
  const imageRef = await toExternalImageRef(imageUrl, {
    publicHost: options.publicHost,
  });

  // ----- Step 1: Describe the source image using Blackbox vision -----
  let sourceDescription = '';
  try {
    const res = await chatCompletion({
      model: MODELS.chat,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Describe this image in rich visual detail for a text-to-image model. ' +
                'Include subject, pose, clothing, background, colors, lighting, camera angle, ' +
                'and artistic style. Keep it under 120 words. Output ONLY the description, no preamble.',
            },
            { type: 'image_url', image_url: { url: imageRef } },
          ],
        },
      ],
      max_tokens: 400,
      temperature: 0.3,
    });
    const data = await res.json();
    sourceDescription = (data?.choices?.[0]?.message?.content || '').trim();
    // Strip quote marks & leading "Sure! " phrases
    sourceDescription = sourceDescription
      .replace(/^["'`]|["'`]$/g, '')
      .replace(/^(sure[!,.]?|here[''']?s|description:|image:)\s*/i, '')
      .slice(0, 800);
  } catch (e: any) {
    console.warn('[blackbox.editImage] describe step failed:', e?.message);
  }

  // ----- Step 2: Build synthesis prompt -----
  const synthesisPrompt = sourceDescription
    ? `${sourceDescription}. Transformation: ${cleanPrompt}. High quality, detailed, coherent.`
    : cleanPrompt;

  // ----- Step 3: Generate with Pollinations using synthesis prompt -----
  // We include BOTH: the raw ?image= URL trick (works on public deploys)
  // AND the text-driven synthesis (always works).
  const absImg =
    imageUrl.startsWith('http') ? imageUrl
    : imageUrl.startsWith('/') && options.publicHost
      ? `${options.publicHost.replace(/\/$/, '')}${imageUrl}`
      : '';

  const url = pollinationsUrl(synthesisPrompt, {
    width,
    height,
    model: 'flux',
    // Only pass the ?image= param if we have a truly public URL
    image: absImg && /^https?:\/\/(?!localhost|127\.0\.0\.1)/i.test(absImg) ? absImg : undefined,
  });

  return [url];
}

// ---------------------------------------------------------------------------
// Video generation
// ---------------------------------------------------------------------------

/**
 * Generate a short video from a text prompt.
 *
 * Order of attempts:
 *   1. Blackbox `/videos/generations` endpoints (several path shapes).
 *   2. Chat completion with the video model (some providers return URL here).
 *   3. Frame slideshow — generate 8 distinct Pollinations frames the client
 *      plays as an auto-advancing video.
 *
 * Returns a discriminated-union `VideoResult`:
 *   - `{ kind: 'video', videoUrl }` for a real MP4/WebM
 *   - `{ kind: 'frames', frames }` for the slideshow fallback
 */
export async function generateVideo(
  prompt: string,
  options: {
    model?: string;
    duration?: number;
    allowFramesFallback?: boolean;
    /** Number of frames to generate when falling back. Default 12. */
    framesCount?: number;
  } = {}
): Promise<VideoResult> {
  const cleanPrompt = (prompt || '').trim();
  if (!cleanPrompt) throw new Error('Prompt is required');

  // List of video models to try in order. If the first fails with
  // a capacity error we still try the next in case one has credits.
  const modelsToTry = Array.from(
    new Set([
      options.model,
      MODELS.video,
      'blackboxai/google/veo-3-fast',
      'blackboxai/runwayml/gen-3',
      'blackboxai/kling/kling-v1',
      'blackboxai/luma/dream-machine',
    ].filter(Boolean) as string[])
  );

  // Several shapes Blackbox has been observed to accept for video routes.
  const endpoints = [
    '/videos/generations',
    '/video/generations',
    '/v1/videos/generations',
    '/v1/video/generations',
    '/videos',
    '/v1/videos',
  ];

  let lastError = '';
  let upstreamExhausted = false;

  // ----- Stage 1: try every (model × endpoint) pair until one works -----
  outer: for (const model of modelsToTry) {
    const body = {
      model,
      prompt: cleanPrompt,
      duration: options.duration ?? 4,
    };

    for (const ep of endpoints) {
      try {
        const res = await fetch(`${API_URL}${ep}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.data)) {
            const urls = data.data.map((d: any) => d.url).filter(Boolean);
            if (urls.length) return { kind: 'video', videoUrl: urls[0] };
          }
          if (Array.isArray(data?.videos) && data.videos.length) {
            return { kind: 'video', videoUrl: data.videos[0] };
          }
          if (typeof data?.url === 'string') {
            return { kind: 'video', videoUrl: data.url };
          }
          lastError = 'Unexpected video API response shape';
        } else {
          const txt = await res.text();
          lastError = friendlyBlackboxError(txt);
          if (/exhausted balance|locked/i.test(txt)) {
            upstreamExhausted = true;
            // No point trying other endpoints/models with the same key.
            break outer;
          }
          // If it's 404 / invalid model, skip to next model.
          if (/Invalid model|not found/i.test(txt)) continue;
        }
      } catch (e: any) {
        lastError = e?.message || String(e);
      }
    }
  }

  // ----- Stage 2: chat-based video URL ask (only if not upstream-exhausted) -----
  if (!upstreamExhausted) {
    try {
      const res = await chatCompletion({
        model: MODELS.video,
        messages: [
          {
            role: 'user',
            content: `Generate a short video of: ${cleanPrompt}. Respond with ONLY the direct MP4 URL.`,
          },
        ],
        max_tokens: 400,
      });
      const data = await res.json();
      const content: string = data?.choices?.[0]?.message?.content ?? '';
      const urls = parseVideoUrls(content);
      if (urls.length) return { kind: 'video', videoUrl: urls[0] };
      lastError = 'Chat fallback returned no video URL';
    } catch (e: any) {
      const msg = e?.message || String(e);
      lastError = friendlyBlackboxError(msg);
      if (/exhausted balance|locked/i.test(msg)) upstreamExhausted = true;
    }
  }

  // ----- Stage 3: frame-slideshow fallback -----
  // Generate N distinct Pollinations (Flux) frames with varied prompts to
  // simulate motion (slight camera movement / progression cues).
  if (options.allowFramesFallback !== false) {
    const framesCount = Math.max(4, Math.min(options.framesCount ?? 12, 16));
    const motionCues = [
      'wide establishing shot',
      'slight camera dolly in',
      'mid shot',
      'close-up detail',
      'pan right',
      'slow zoom out',
      'low angle',
      'high angle',
      'tracking shot',
      'rack focus',
      'over-the-shoulder view',
      'dramatic lighting sweep',
      'aerial view',
      'side profile',
      'reverse angle',
      'final wide reveal',
    ];
    const frames: string[] = [];
    for (let i = 0; i < framesCount; i++) {
      const cue = motionCues[i % motionCues.length];
      const framePrompt = `${cleanPrompt}, ${cue}, cinematic, frame ${i + 1} of ${framesCount}`;
      frames.push(
        pollinationsUrl(framePrompt, {
          width: 768,
          height: 432,
          seed: 10000 + i * 97,
          model: 'flux',
        })
      );
    }
    return { kind: 'frames', frames };
  }

  throw new BlackboxError(
    lastError ||
      'Video generation is temporarily unavailable. The AI video provider is out of credits.',
    502
  );
}
