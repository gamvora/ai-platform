/**
 * Nova AI — Authentication Helpers (Edge-safe)
 *
 * Uses `jose` (JWT) + `bcryptjs` — both edge-compatible.
 * Does NOT import `./db` to keep this module usable from
 * `middleware.ts` (which runs on the edge runtime and cannot
 * import Node-only modules like `node:fs`).
 *
 * For `getCurrentUser()` (which reads from the DB), import
 * `./auth-server` instead.
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import bcrypt from 'bcryptjs';
import type { User, PublicUser } from './db-types';

export const AUTH_COOKIE = 'nova_session';
const DEFAULT_SECRET =
  'nova-ai-dev-secret-change-me-to-a-32-char-random-string-0000';

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET || DEFAULT_SECRET;
  return new TextEncoder().encode(secret);
}

export interface SessionPayload extends JWTPayload {
  sub: string; // user id
  email: string;
  name: string;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Sign a JWT for the given user. */
export async function signSession(user: User | PublicUser): Promise<string> {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    name: user.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecretKey());
}

/** Verify a JWT and return the payload (or null). */
export async function verifySession(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ['HS256'],
    });
    if (!payload.sub || typeof payload.sub !== 'string') return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/** Build cookie options for the auth cookie. */
export function authCookieOptions() {
  return {
    name: AUTH_COOKIE,
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  };
}
