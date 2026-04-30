import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Streaming image proxy.
 *
 * Usage: `/api/img-proxy?src=<urlencoded-remote-image-url>`
 *
 * Why: Pollinations.ai cold-starts can take 20-40s, during which an
 * unhealthy direct `<img>` fetch may be aborted by the browser, blocked by
 * adblockers, or rejected by CORS. Proxying through our own origin gives us:
 *   - same-origin guarantees (no CORS/mixed-content issues)
 *   - long timeouts (we wait as long as needed)
 *   - opportunity to cache at the CDN layer via Cache-Control
 *
 * Security: we only allow http(s) URLs from a small allowlist of known-safe
 * AI image hosts to prevent SSRF.
 */
const ALLOWLIST = [
  'image.pollinations.ai',
  'pollinations.ai',
  'replicate.delivery',
  'fal.media',
  'cdn.openai.com',
  'oaidalleapiprodscus.blob.core.windows.net',
  'api.blackbox.ai',
];

export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get('src');
  if (!src) {
    return NextResponse.json({ error: 'Missing src parameter' }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (!/^https?:$/.test(url.protocol)) {
    return NextResponse.json({ error: 'Only http(s) URLs allowed' }, { status: 400 });
  }

  const hostOk = ALLOWLIST.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
  if (!hostOk) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    const upstream = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `Upstream ${upstream.status}` },
        { status: 502 }
      );
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Proxy failed' },
      { status: 502 }
    );
  }
}
