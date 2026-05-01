import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-server';
import { findUserById, updateUser } from '@/lib/db';
import type { UserPreferences } from '@/lib/db-types';

export const runtime = 'nodejs';

/**
 * Default preferences returned when a user has none saved yet.
 * Kept in sync with the Settings UI.
 * Models hardcoded in blackbox.ts — removed here.
 */
const DEFAULTS: Required<
  Pick<
    UserPreferences,
    | 'theme'
    | 'defaultImageSize'
    | 'saveHistory'
    | 'voiceReplies'
    | 'language'
    | 'botAvatarUrl'
  >
> = {
  theme: 'dark',
  defaultImageSize: '1024x1024',
  saveHistory: true,
  voiceReplies: false,
  language: 'ar',
  botAvatarUrl: '',
};

/** Whitelist of known keys so arbitrary JSON cannot be injected. */
const ALLOWED_KEYS = Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[];

function sanitize(input: any): UserPreferences {
  if (!input || typeof input !== 'object') return {};
  const out: UserPreferences = {};
  for (const k of ALLOWED_KEYS) {
    if (!(k in input)) continue;
    const v = input[k];
    if (k === 'saveHistory' || k === 'voiceReplies') {
      if (typeof v === 'boolean') out[k] = v;
    } else if (k === 'theme') {
      if (v === 'dark' || v === 'light' || v === 'system') out[k] = v;
    } else if (typeof v === 'string' && v.length <= 500) {
      // defaultImageSize, language, botAvatarUrl
      out[k] = v;
    }
  }
  return out;
}

/**
 * GET /api/user/preferences
 * Returns { preferences: UserPreferences } merged with defaults.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const merged: UserPreferences = { ...DEFAULTS, ...(user.preferences ?? {}) };
  return NextResponse.json({ preferences: merged });
}

/**
 * PATCH /api/user/preferences
 * Body: Partial<UserPreferences>
 * Merges into existing preferences (unknown keys are dropped).
 */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch = sanitize(body);
  if (!Object.keys(patch).length) {
    return NextResponse.json(
      { error: 'No valid preference fields provided.' },
      { status: 400 }
    );
  }

  // Merge with existing user preferences.
  const existing = (await findUserById(user.id))?.preferences ?? {};
  const next: UserPreferences = { ...existing, ...patch };

  const updated = await updateUser(user.id, { preferences: next });
  if (!updated) {
    return NextResponse.json(
      { error: 'Failed to save preferences' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    preferences: { ...DEFAULTS, ...next },
  });
}
