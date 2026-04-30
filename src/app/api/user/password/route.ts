import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-server';
import { findUserById, updateUser } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/**
 * PATCH /api/user/password
 * Body: { currentPassword: string, newPassword: string }
 *
 * Re-hashes the user's password after verifying the current one.
 * The existing session cookie stays valid (it identifies the user by id,
 * not password), so the user does not get logged out.
 */
export async function PATCH(req: NextRequest) {
  const current = await getCurrentUser();
  if (!current) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Tight limit: 5 attempts / window to slow down brute-force.
  const rl = rateLimit(`pwd:${current.id}`, 5);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many password change attempts. Try again shortly.' },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const currentPassword = String(body.currentPassword ?? '');
  const newPassword = String(body.newPassword ?? '');

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: 'Current and new passwords are required.' },
      { status: 400 }
    );
  }
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: 'New password must be at least 8 characters.' },
      { status: 400 }
    );
  }
  if (newPassword.length > 200) {
    return NextResponse.json(
      { error: 'New password is too long.' },
      { status: 400 }
    );
  }
  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: 'New password must differ from current password.' },
      { status: 400 }
    );
  }

  // Need the full User (with passwordHash), not the PublicUser.
  const dbUser = await findUserById(current.id);
  if (!dbUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const ok = await verifyPassword(currentPassword, dbUser.passwordHash);
  if (!ok) {
    return NextResponse.json(
      { error: 'Current password is incorrect.' },
      { status: 401 }
    );
  }

  const newHash = await hashPassword(newPassword);
  const updated = await updateUser(current.id, { passwordHash: newHash });
  if (!updated) {
    return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
