/**
 * Nova AI — Server-only auth helpers (Node runtime).
 *
 * Separated from ./auth because this file imports ./db, which
 * pulls in Node-only modules (node:fs, node:crypto). Only import
 * this from Node route handlers / server components — never from
 * middleware.
 */

import 'server-only';
import { cookies } from 'next/headers';
import { AUTH_COOKIE, verifySession } from './auth';
import { findUserById, toPublicUser } from './db';
import type { PublicUser } from './db';

/**
 * Returns the authenticated user (or null).
 */
export async function getCurrentUser(): Promise<PublicUser | null> {
  const token = cookies().get(AUTH_COOKIE)?.value;
  const payload = await verifySession(token);
  if (!payload) return null;
  const user = await findUserById(payload.sub);
  return user ? toPublicUser(user) : null;
}
