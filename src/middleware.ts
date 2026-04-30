import { NextRequest, NextResponse } from 'next/server';
import { verifySession, AUTH_COOKIE } from '@/lib/auth';

/**
 * Protects private routes and redirects auth'd users away from login/register.
 * Runs on the edge — uses `jose` JWT verify, which is edge-compatible.
 */

const PROTECTED = ['/chat', '/image', '/video', '/dashboard'];
const AUTH_PAGES = ['/login', '/register'];

function isProtected(pathname: string) {
  return PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function isAuthPage(pathname: string) {
  return AUTH_PAGES.includes(pathname);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const session = await verifySession(token);

  if (isProtected(pathname) && !session) {
    const url = new URL('/login', req.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthPage(pathname) && session) {
    return NextResponse.redirect(new URL('/chat', req.url));
  }

  return NextResponse.next();
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
