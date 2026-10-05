/**
 * Nova AI — AI API Client (Bynara + Pollinations)
 * --------------------------------------------------
 * - Chat/Vision : Bynara router (OpenAI-compatible) with agnes-3-flash
 *   • Supports text + image (vision) messages via base64 data URIs
 * - Image generation : Pollinations.ai Flux (free, no key needed)
 * - Video generation : Pollinations.ai (frame slideshow fallback)
 * - NO Blackbox.ai dependency
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// ── Bynara config ────────────────────────────────────────────────────────────
const BYNARA_API_KEY = process.env.BYNARA_API_KEY || '';
const BYNARA_BASE_URL = (process.env.BYNARA_BASE_URL || 'https://router.bynara.id').replace(/\/$/, '');
const DEFAULT_MODEL = 'agnes-3-flash';

if (!BYNARA_API_KEY) {
  console.warn('[bynara] BYNARA_API_KEY not set — chat will fail until configured.');
}

// ── Pollinations config (images / video fallbacks) ──────────────────────────
const HF_API_KEY =
  process.env.HF_API_KEY ||
  process.env.HUGGINGFACE_API_KEY ||
  process.env.HUGGING_FACE_API_KEY ||
  '';
const HF_T2I_MODEL =
  process.env.HF_IMAGE_MODEL || 'stabilityai/stable-diffusion-xl-base-1.0';

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
  /** Real video URL (mp4/webm), if generated. */
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

/** Default model — change here or via BYNARA_DEFAULT_MODEL env var. */
export const MODELS = {
  chat: process.env.BYNARA_DEFAULT_MODEL || DEFAULT_MODEL,
  chatFast: process.env.BYNARA_DEFAULT_MODEL || DEFAULT_MODEL,
  image: 'pollinations-flux',
  video: 'pollinations-flux',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert any image reference into something the Bynara vision endpoint can read.
 * Local `/uploads/...` paths are read from `public/` and inlined as data URIs.
 * Absolute https URLs are fetched and inlined so the upstream model always sees bytes.
 */
export async function toExternalImageRef(
  ref: string,
  options: { publicHost?: string } = {}
): Promise<string> {
  if (!ref) return ref;
  if (ref.startsWith('data:')) return ref;

  // Absolute http(s) URL → fetch + inline as data URI (most reliable for vision).
  if (/^https?:\/\//i.test(ref)) {
    try {
      const res = await fetch(ref, {
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; NovaAI/1.0)',
          accept: 'image/*,*/*;q=0.8',
        },
      });
      if (res.ok) {
        const ctype = (res.headers.get('content-type') || '').toLowerCase();
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 256) {
          const mime = ctype.startsWith('image/') ? ctype.split(';')[0] : 'image/jpeg';
          return `data:${mime};base64,${buf.toString('base64')}`;
        }
      }
    } catch (err: any) {
      console.warn('[toExternalImageRef] remote fetch failed:', err?.message);
    }
    return ref;
  }

  // Relative `/uploads/...` path → read from public/ and inline as base64.
  if (ref.startsWith('/')) {
    try {
      const publicDir = path.join(process.cwd(), 'public');
      const filePath = path.join(publicDir, ref);
      if (!filePath.startsWith(publicDir)) throw new Error('Resolved path escapes public/ root');
      const buf = await fs.readFile(filePath);
      const ext = (path.extname(ref).slice(1) || 'png').toLowerCase();
      const mime =
        ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
        : ext === 'webp' ? 'image/webp'
        : ext === 'gif' ? 'image/gif'
        : 'image/png';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch (err: any) {
      console.warn('[toExternalImageRef] local read failed, falling back to URL:', err?.message);
      if (options.publicHost) {
        return `${options.publicHost.replace(/\/$/, '')}${ref}`;
      }
      return ref;
    }
  }

  return ref;
}

/** Build a Pollinations.ai image URL. */
function pollinationsUrl(
  prompt: string,
  opts: { width?: number; height?: number; seed?: number; model?: string; image?: string; enhance?: boolean } = {}
): string {
  const width = opts.width ?? 1024;
  const height = opts.height ?? 1024;
  const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000);
  const params = new URLSearchParams();
  params.set('width', String(width));
  params.set('height', String(height));
  params.set('seed', String(seed));
  params.set('nologo', 'true');
  if (opts.model) params.set('model', opts.model);
  if (opts.enhance !== false) params.set('enhance', 'true');
  if (opts.image) params.set('image', opts.image);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.trim())}?${params.toString()}`;
}

/**
 * Download a remote image and save it to `public/generated/<id>.<ext>`,
 * returning a local URL. Pollinations images can be slow so we allow up to 90s.
 */
export async function persistRemoteImage(
  remoteUrl: string,
  id: string,
  options: { timeoutMs?: number } = {}
): Promise<string> {
  if (!remoteUrl) return remoteUrl;
  if (remoteUrl.startsWith('/') || remoteUrl.startsWith('data:')) return remoteUrl;

  const timeoutMs = options.timeoutMs ?? 90_000;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(remoteUrl, {
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; NovaAI/1.0; +https://localhost)' },
    });
    clearTimeout(t);

    if (!res.ok) {
      console.warn('[persistRemoteImage] non-2xx:', res.status, remoteUrl);
      return remoteUrl;
    }

    const contentTypeRaw = (res.headers.get('content-type') || '').toLowerCase();
    if (contentTypeRaw && !contentTypeRaw.startsWith('image/') && !contentTypeRaw.includes('octet-stream')) {
      console.warn('[persistRemoteImage] unexpected content-type:', contentTypeRaw);
      return remoteUrl;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 256) {
      console.warn('[persistRemoteImage] payload too small:', buf.length);
      return remoteUrl;
    }

    let ext = 'jpg';
    if (buf.length >= 8) {
      const sig = buf.subarray(0, 12);
      if (sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47) ext = 'png';
      else if (sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff) ext = 'jpg';
      else if (sig[0] === 0x47 && sig[1] === 0x49 && sig[2] === 0x46 && sig[3] === 0x38) ext = 'gif';
      else if (sig[0] === 0x52 && sig[1] === 0x49 && sig[2] === 0x46 && sig[3] === 0x46 && sig[8] === 0x57 && sig[9] === 0x45 && sig[10] === 0x42 && sig[11] === 0x50) ext = 'webp';
      else if (contentTypeRaw.includes('png')) ext = 'png';
      else if (contentTypeRaw.includes('webp')) ext = 'webp';
      else if (contentTypeRaw.includes('gif')) ext = 'gif';
    }

    const dir = path.join(process.cwd(), 'public', 'generated');
    await fs.mkdir(dir, { recursive: true });
    const filename = `${id}.${ext}`;
    await fs.writeFile(path.join(dir, filename), buf);
    return `/generated/${filename}`;
  } catch (err: any) {
    console.warn('[persistRemoteImage] failed:', err?.message);
    return remoteUrl;
  }
}

function parseImageUrls(content: string): string[] {
  if (!content) return [];
  const urls: string[] = [];
  const mdRe = /!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g;
  let m;
  while ((m = mdRe.exec(content)) !== null) urls.push(m[1]);
  const bareRe = /(https?:\/\/\S+\.(?:png|jpe?g|webp|gif|bmp))/gi;
  let u;
  while ((u = bareRe.exec(content)) !== null) {
    const clean = u[1].replace(/[.,)]+$/, '');
    if (!urls.includes(clean)) urls.push(clean);
  }
  return urls;
}

function parseVideoUrls(content: string): string[] {
  if (!content) return [];
  const urls: string[] = [];
  const mdRe = /\[[^\]]*\]\((https?:\/\/[^)]+\.(?:mp4|webm|mov))\)/g;
  let m;
  while ((m = mdRe.exec(content)) !== null) urls.push(m[1]);
  const urlRe = /(https?:\/\/\S+\.(?:mp4|webm|mov))/gi;
  let u;
  while ((u = urlRe.exec(content)) !== null) {
    const clean = u[1].replace(/[.,)]+$/, '');
    if (!urls.includes(clean)) urls.push(clean);
  }
  return urls;
}

function cryptoRandomId(): string {
  return crypto.randomUUID();
}

/** Parse user-friendly messages from raw Bynara error bodies. */
export function friendlyBynaraError(raw: string): string {
  if (!raw) return 'Unknown error';
  if (/insufficient_quota|balance|credit/i.test(raw)) {
    return 'نفاذ الرصيد. يرجى إضافة رصيد من لوحة تحكم Bynara ثم重试.';
  }
  if (/invalid.?api.?key|unauthorized|forbidden/i.test(raw)) {
    return 'مفتاح API غير صالح. تحقق من BYNARA_API_KEY في إعدادات الخادم.';
  }
  try {
    const jsonStart = raw.indexOf('{');
    if (jsonStart >= 0) {
      const j = JSON.parse(raw.slice(jsonStart));
      const msg = j?.error?.message || j?.detail || '';
      if (msg) return msg.slice(0, 300);
    }
  } catch { /* ignore */ }
  return raw.slice(0, 300);
}

/** Compress a base64 data URL image to max 800px on the longest side (JPEG ~60%).
 * Reduces payload from ~2-5 MB down to ~100-300 KB — huge win for vision APIs. */
export async function compressImage(dataUrl: string, maxSizePx = 800): Promise<string> {
  if (!dataUrl.startsWith('data:')) return dataUrl;
  try {
    const ctx = document?.createElement('canvas')?.getContext('2d');
    if (!ctx) return dataUrl; // SSR fallback

    const img = new Image();
    img.src = dataUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image load failed'));
    });

    let { width, height } = img;
    if (width > maxSizePx || height > maxSizePx) {
      const ratio = Math.min(maxSizePx / width, maxSizePx / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    ctx.canvas.width = width;
    ctx.canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);
    return ctx.canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return dataUrl; // return original on error
  }
}

// ---------------------------------------------------------------------------
// Chat (Bynara — OpenAI-compatible)
// ---------------------------------------------------------------------------

/** Call Bynara chat completion. Throws Error on non-2xx. */
export async function chatCompletion(opts: ChatCompletionOptions) {
  if (!BYNARA_API_KEY) {
    throw new Error(
      'BYNARA_API_KEY is not configured. Set it in your .env.local file.'
    );
  }

  const res = await fetch(`${BYNARA_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${BYNARA_API_KEY}`,
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
      `Bynara chat API error (${res.status}): ${friendlyBynaraError(errText)}`
    );
  }
  return res;
}

/** Stream a chat completion — yields text chunks as they arrive (SSE). */
export async function* streamChatCompletion(opts: ChatCompletionOptions) {
  if (!BYNARA_API_KEY) throw new Error('BYNARA_API_KEY is not configured.');

  const res = await fetch(`${BYNARA_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${BYNARA_API_KEY}`,
    },
    body: JSON.stringify({
      model: opts.model || MODELS.chat,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.max_tokens ?? 2048,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(friendlyBynaraError(errText));
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        const content = json?.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch { /* skip malformed lines */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Image generation (Pollinations.ai — free, no key needed)
// ---------------------------------------------------------------------------

export interface ImageGenerationResult {
  urls: string[];
  requestedModel: string;
  effectiveModel: string;
  provider: 'pollinations' | 'huggingface' | 'byNara';
}

export async function generateImage(
  prompt: string,
  options: {
    model?: string;
    n?: number;
    size?: string;
    style?: 'realistic' | 'anime' | '3d' | 'fantasy' | 'cinematic' | 'none';
  } = {}
): Promise<ImageGenerationResult> {
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

  const stylePreferredModel =
    options.style === 'realistic' ? 'flux-realism'
    : options.style === 'anime' ? 'flux-anime'
    : 'flux';

  const pollModel = (options.model || 'auto') === 'auto' ? stylePreferredModel : options.model!;

  const pollUrl = pollinationsUrl(finalPrompt, { width: w, height: h, model: pollModel });

  return {
    urls: [pollUrl],
    requestedModel: options.model || 'auto',
    effectiveModel: pollModel,
    provider: 'pollinations',
  };
}

// ---------------------------------------------------------------------------
// Image editing (text-guided img2img via Bynara vision + Pollinations)
// ---------------------------------------------------------------------------

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

  const imageRef = await toExternalImageRef(imageUrl, { publicHost: options.publicHost });

  // Step 1: Describe source image using Bynara vision
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
              text: 'Describe this image in rich visual detail for a text-to-image model. Include subject, pose, clothing, background, colors, lighting, camera angle, and artistic style. Keep it under 120 words. Output ONLY the description.',
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
    sourceDescription = sourceDescription
      .replace(/^["'`]|["'`]$/g, '')
      .replace(/^(sure[!,.]?|here[''']?s|description:|image:)\s*/i, '')
      .slice(0, 800);
  } catch (e: any) {
    console.warn('[editImage] describe step failed:', e?.message);
  }

  const synthesisPrompt = sourceDescription
    ? `${sourceDescription}. Transformation: ${cleanPrompt}. High quality, detailed, coherent.`
    : cleanPrompt;

  const absImg = imageUrl.startsWith('http') ? imageUrl
    : imageUrl.startsWith('/') && options.publicHost
      ? `${options.publicHost.replace(/\/$/, '')}${imageUrl}`
      : '';

  const url = pollinationsUrl(synthesisPrompt, {
    width,
    height,
    model: 'flux',
    image: absImg && /^https?:\/\/(?!localhost|127\.0\.0\.1)/i.test(absImg) ? absImg : undefined,
  });

  return [url];
}

// ---------------------------------------------------------------------------
// Video generation (Pollinations frame slideshow fallback)
// ---------------------------------------------------------------------------

export async function generateVideo(
  prompt: string,
  options: {
    model?: string;
    duration?: number;
    allowFramesFallback?: boolean;
    framesCount?: number;
  } = {}
): Promise<VideoResult> {
  const cleanPrompt = (prompt || '').trim();
  if (!cleanPrompt) throw new Error('Prompt is required');

  // Try Bynara first if a video-capable model is specified (future-proof).
  // For now agnes-3-flash is text+vision only, so we go straight to frame fallback.
  if (options.allowFramesFallback !== false) {
    const framesCount = Math.max(4, Math.min(options.framesCount ?? 12, 16));
    const motionCues = [
      'wide establishing shot', 'slight camera dolly in', 'mid shot', 'close-up detail',
      'pan right', 'slow zoom out', 'low angle', 'high angle',
      'tracking shot', 'rack focus', 'over-the-shoulder view', 'dramatic lighting sweep',
      'aerial view', 'side profile', 'reverse angle', 'final wide reveal',
    ];
    const frames: string[] = [];
    for (let i = 0; i < framesCount; i++) {
      const cue = motionCues[i % motionCues.length];
      frames.push(
        pollinationsUrl(`${cleanPrompt}, ${cue}, cinematic, frame ${i + 1} of ${framesCount}`, {
          width: 768, height: 432, seed: 10000 + i * 97, model: 'flux',
        })
      );
    }
    return { kind: 'frames', frames };
  }

  throw new BlackboxError('Video generation is temporarily unavailable.', 502);
}
