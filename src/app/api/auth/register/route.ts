import { NextRequest, NextResponse } from 'next/server';
import { createUser, findUserByEmail, toPublicUser } from '@/lib/db';
import {
  hashPassword,
  signSession,
  authCookieOptions,
} from '@/lib/auth';
import { isValidEmail } from '@/lib/utils';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Email, password and name are required' },
        { status: 400 }
      );
    }

    if (typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json(
        { error: 'Name must be at least 2 characters' },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser({
      email,
      name,
      passwordHash,
    });

    const token = await signSession(user);
    const res = NextResponse.json({ user: toPublicUser(user) });
    res.cookies.set({
      ...authCookieOptions(),
      value: token,
    });
    return res;
  } catch (err: any) {
    console.error('[register]', err);
    return NextResponse.json(
      { error: err?.message || 'Registration failed' },
      { status: 500 }
    );
  }
}
