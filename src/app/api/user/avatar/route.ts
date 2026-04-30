import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-server';
import { updateUser, toPublicUser } from '@/lib/db';
import { rateLimit } from '@/lib/rateLimit';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = /^image\/(png|jpeg|webp|gif)$/;

/**
 * POST /api/user/avatar   (multipart/form-data, field: file)
 * Uploads a new avatar, stores it under /public/uploads/avatars/<uid>/,
 * records the public URL on the user, and returns the updated user.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const rl = rateLimit(`avatar:${user.id}`, 10);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many avatar uploads. Try again shortly.' },
      { status: 429 }
    );
  }

  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    if (file.size > MAX_AVATAR_SIZE) {
      return NextResponse.json(
        { error: 'Avatar too large (max 5 MB)' },
        { status: 413 }
      );
    }
    if (!ALLOWED_MIME.test(file.type)) {
      return NextResponse.json(
        { error: 'Only PNG / JPEG / WEBP / GIF images allowed.' },
        { status: 415 }
      );
    }

    const ext =
      file.type === 'image/png'
        ? 'png'
        : file.type === 'image/webp'
          ? 'webp'
          : file.type === 'image/gif'
            ? 'gif'
            : 'jpg';
    const safeUid = user.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const dir = path.join(process.cwd(), 'public', 'uploads', 'avatars', safeUid);
    await fs.mkdir(dir, { recursive: true });

    const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(dir, name), buf);

    const url = `/uploads/avatars/${safeUid}/${name}`;
    const updated = await updateUser(user.id, { avatarUrl: url });
    if (!updated) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Best-effort: remove the previous avatar file to keep disk tidy.
    if (user.avatarUrl && user.avatarUrl !== url && user.avatarUrl.startsWith('/uploads/avatars/')) {
      const prev = path.join(process.cwd(), 'public', user.avatarUrl.replace(/^\//, ''));
      fs.rm(prev, { force: true }).catch(() => {});
    }

    return NextResponse.json({ user: toPublicUser(updated), url });
  } catch (err: any) {
    console.error('[avatar]', err);
    return NextResponse.json(
      { error: err?.message || 'Avatar upload failed' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/user/avatar — remove the stored avatar.
 */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const updated = await updateUser(user.id, { avatarUrl: null });
  if (user.avatarUrl && user.avatarUrl.startsWith('/uploads/avatars/')) {
    const prev = path.join(process.cwd(), 'public', user.avatarUrl.replace(/^\//, ''));
    fs.rm(prev, { force: true }).catch(() => {});
  }

  return NextResponse.json({ user: updated ? toPublicUser(updated) : null });
}
