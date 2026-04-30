import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth-server';
import { findUserById, deleteUser } from '@/lib/db';
import { AUTH_COOKIE, verifyPassword } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/**
 * DELETE /api/user
 * Body: { password: string }
 *
 * Permanently deletes the authenticated user and all their owned
 * conversations + generations (cascade handled by the DB layer).
 * Clears the session cookie in the response.
 */
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const rl = rateLimit(`del:${user.id}`, 3);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many delete attempts. Try again shortly.' },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const password = String(body?.password ?? '');
  if (!password) {
    return NextResponse.json(
      { error: 'Password is required to delete your account.' },
      { status: 400 }
    );
  }

  const dbUser = await findUserById(user.id);
  if (!dbUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const ok = await verifyPassword(password, dbUser.passwordHash);
  if (!ok) {
    return NextResponse.json(
      { error: 'Password is incorrect.' },
      { status: 401 }
    );
  }

  const removed = await deleteUser(user.id);
  if (!removed) {
    return NextResponse.json(
      { error: 'Failed to delete account.' },
      { status: 500 }
    );
  }

  // Clear session cookie.
  cookies().set(AUTH_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });

  return NextResponse.json({ ok: true });
}
