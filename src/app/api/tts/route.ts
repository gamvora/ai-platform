import { NextRequest, NextResponse } from 'next/server';

function normalizeLang(input?: string) {
  const raw = (input || 'ar-SA').trim();
  const short = raw.split('-')[0]?.toLowerCase() || 'ar';
  const allow = new Set(['ar', 'en', 'fr', 'es', 'de', 'it', 'tr', 'ru', 'pt', 'hi', 'ja', 'ko', 'zh']);
  return allow.has(short) ? short : 'ar';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = String(body?.text || '').trim();
    const lang = normalizeLang(body?.lang);

    if (!text) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    // Keep payload small for stability on free endpoint
    const clipped = text.slice(0, 450);
    const q = encodeURIComponent(clipped);

    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(
      lang
    )}&q=${q}`;

    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        Accept: 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8',
        Referer: 'https://translate.google.com/',
      },
      cache: 'no-store',
    });

    if (!upstream.ok) {
      const txt = await upstream.text().catch(() => '');
      return NextResponse.json(
        { error: `tts upstream failed (${upstream.status})`, details: txt.slice(0, 180) },
        { status: 502 }
      );
    }

    const arr = await upstream.arrayBuffer();
    return new NextResponse(arr, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'TTS route failed' }, { status: 500 });
  }
}
