import { NextRequest, NextResponse } from 'next/server';
import { findUserByEmail, toPublicUser } from '@/lib/db';
import {
  verifyPassword,
  signSession,
  authCookieOptions,
} from '@/lib/auth';
import { isValidEmail } from '@/lib/utils';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const token = await signSession(user);
    const res = NextResponse.json({ user: toPublicUser(user) });
    res.cookies.set({
      ...authCookieOptions(),
      value: token,
    });
    return res;
  } catch (err: any) {
    console.error('[login]', err);
    return NextResponse.json(
      { error: err?.message || 'Login failed' },
      { status: 500 }
    );
  }
}
