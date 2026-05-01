import { NextRequest, NextResponse } from 'next/server';
import { verifySession, AUTH_COOKIE } from '@/lib/auth';

/**
 * Protects private routes and redirects auth'd users away from login/register.
 * Also synchronizes locale cookie (`locale=ar|en`) for dynamic bilingual UI.
 */

const PROTECTED = ['/chat', '/image', '/video', '/dashboard'];
const AUTH_PAGES = ['/login', '/register'];
const LOCALES = new Set(['ar', 'en']);

function isProtected(pathname: string) {
  return PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function isAuthPage(pathname: string) {
  return AUTH_PAGES.includes(pathname);
}

function normalizeLocale(v?: string | null): 'ar' | 'en' {
  return v && LOCALES.has(v) ? (v as 'ar' | 'en') : 'ar';
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const session = await verifySession(token);

  // 1) Locale sync:
  // - accept query ?lang=ar|en
  // - fallback to cookie locale
  // - default ar
  const queryLang = req.nextUrl.searchParams.get('lang');
  const cookieLocale = req.cookies.get('locale')?.value;
  const locale = normalizeLocale(queryLang || cookieLocale);

  // 2) Auth guard
  if (isProtected(pathname) && !session) {
    const url = new URL('/login', req.url);
    url.searchParams.set('redirect', pathname);
    const res = NextResponse.redirect(url);
    res.cookies.set('locale', locale, { path: '/', sameSite: 'lax' });
    return res;
  }

  if (isAuthPage(pathname) && session) {
    const res = NextResponse.redirect(new URL('/chat', req.url));
    res.cookies.set('locale', locale, { path: '/', sameSite: 'lax' });
    return res;
  }

  // 3) If query lang used, clean URL but persist cookie
  if (queryLang && LOCALES.has(queryLang)) {
    const url = new URL(pathname + search, req.url);
    url.searchParams.delete('lang');
    const res = NextResponse.redirect(url);
    res.cookies.set('locale', locale, { path: '/', sameSite: 'lax' });
    return res;
  }

  // 4) Normal pass-through + keep locale cookie in sync
  const res = NextResponse.next();
  if (cookieLocale !== locale) {
    res.cookies.set('locale', locale, { path: '/', sameSite: 'lax' });
  }
  return res;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - /api (API routes protect themselves)
     * - /_next/* (Next.js internals)
     * - /uploads/* (public user uploads)
     * - static files (images, favicons)
     */
    '/((?!api|_next/static|_next/image|uploads|favicon.ico|.*\\..*).*)',
  ],
};
