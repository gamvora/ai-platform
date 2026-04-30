import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-server';
import { updateUser, toPublicUser } from '@/lib/db';
import { rateLimit } from '@/lib/rateLimit';
import crypto from 'node:crypto';
import { getSupabase, hasSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = /^image\/(png|jpeg|webp|gif)$/;

/**
 * POST /api/user/avatar   (multipart/form-data, field: file)
 * Uploads a new avatar to Supabase Storage and stores the public URL on user.
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
    if (!hasSupabase()) {
      return NextResponse.json(
        {
          error:
            'Avatar upload requires Supabase Storage in production. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
        },
        { status: 500 }
      );
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Storage is not configured correctly' },
        { status: 500 }
      );
    }

    const safeUid = user.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';
    const objectPath = `avatars/${safeUid}/${name}`;

    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(objectPath, buf, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (upErr) {
      console.error('[avatar] supabase storage upload error:', upErr);
      return NextResponse.json(
        { error: 'Failed to upload avatar to storage' },
        { status: 500 }
      );
    }

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(objectPath);
    const url = pub?.publicUrl;
    if (!url) {
      return NextResponse.json(
        { error: 'Failed to get avatar URL' },
        { status: 500 }
      );
    }

    const updated = await updateUser(user.id, { avatarUrl: url });
    if (!updated) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
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

  return NextResponse.json({ user: updated ? toPublicUser(updated) : null });
}
