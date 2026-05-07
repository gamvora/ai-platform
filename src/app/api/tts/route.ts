import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const LANG_VOICE: Record<string, string> = {
  ar: 'alloy',
  en: 'nova',
  fr: 'shimmer',
  es: 'echo',
  de: 'onyx',
  it: 'echo',
  tr: 'alloy',
  ru: 'onyx',
  hi: 'shimmer',
  ja: 'nova',
  ko: 'nova',
  zh: 'nova',
  pt: 'shimmer',
};

function getLangShort(input?: string) {
  return ((input || 'ar').split('-')[0] || 'ar').toLowerCase();
}

async function fetchPollinationsTTS(text: string, voice: string): Promise<Response | null> {
  try {
    const url = `https://text.pollinations.ai/`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: text }],
        model: 'openai-audio',
        voice,
        stream: false,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.startsWith('audio/')) return res;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchGoogleTTS(text: string, lang: string): Promise<Response | null> {
  try {
    const q = encodeURIComponent(text.slice(0, 450));
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&q=${q}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        Accept: 'audio/mpeg,audio/*;q=0.9',
        Referer: 'https://translate.google.com/',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return res;
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const text = String(body?.text || '').trim();
    const langFull: string = String(body?.lang || 'ar');
    const lang = getLangShort(langFull);

    if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });

    const voice = LANG_VOICE[lang] || 'alloy';
    const clean = text.slice(0, 500);

    // Try Google TTS first (fast, high quality for Arabic)
    const google = await fetchGoogleTTS(clean, langFull.includes('-') ? langFull : `${lang}-${lang.toUpperCase()}`);
    if (google) {
      const buf = await google.arrayBuffer();
      if (buf.byteLength > 500) {
        return new NextResponse(buf, {
          headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
        });
      }
    }

    // Fallback: Pollinations TTS
    const poll = await fetchPollinationsTTS(clean, voice);
    if (poll) {
      const buf = await poll.arrayBuffer();
      const ct = poll.headers.get('content-type') || 'audio/mpeg';
      return new NextResponse(buf, {
        headers: { 'Content-Type': ct, 'Cache-Control': 'no-store' },
      });
    }

    return NextResponse.json({ error: 'All TTS providers failed' }, { status: 502 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'TTS route failed' }, { status: 500 });
  }
}
