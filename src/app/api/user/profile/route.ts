import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-server';
import { updateUser, findUserByEmail, toPublicUser } from '@/lib/db';
import { rateLimit } from '@/lib/rateLimit';
import { cookies } from 'next/headers';
import { signSession, authCookieOptions } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * PATCH /api/user/profile
 * Body: { name?: string, email?: string }
 *
 * Updates the current user's display name and/or email address.
 * Re-issues the session JWT on success so the token claims stay in sync.
 */
export async function PATCH(req: NextRequest) {
  const current = await getCurrentUser();
  if (!current) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const rl = rateLimit(`profile:${current.id}`, 20);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many profile updates — please slow down.' },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: { name?: string; email?: string } = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 1 || name.length > 60) {
      return NextResponse.json(
        { error: 'Name must be 1–60 characters.' },
        { status: 400 }
      );
    }
    patch.name = name;
  }

  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }
    if (email !== current.email) {
      const taken = await findUserByEmail(email);
      if (taken && taken.id !== current.id) {
        return NextResponse.json(
          { error: 'That email is already in use.' },
          { status: 409 }
        );
      }
    }
    patch.email = email;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ user: current });
  }

  let updated;
  try {
    updated = await updateUser(current.id, patch);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Profile update failed' },
      { status: 400 }
    );
  }

  if (!updated) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Re-sign session so name/email in JWT claims stay fresh.
  const token = await signSession(updated);
  const opts = authCookieOptions();
  cookies().set(opts.name, token, {
    httpOnly: opts.httpOnly,
    sameSite: opts.sameSite,
    secure: opts.secure,
    path: opts.path,
    maxAge: opts.maxAge,
  });

  return NextResponse.json({ user: toPublicUser(updated) });
}
