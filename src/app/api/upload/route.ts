import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-server';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = /^image\/(png|jpeg|webp|gif)$/;

/**
 * Accept an image upload and return a public URL under /uploads/...
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large (max 10 MB)' },
        { status: 413 }
      );
    }

    if (!ALLOWED_MIME.test(file.type)) {
      return NextResponse.json(
        { error: 'Only PNG / JPEG / WEBP / GIF images are allowed' },
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
    const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', safeUid);
    await fs.mkdir(uploadsDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const fullPath = path.join(uploadsDir, name);
    await fs.writeFile(fullPath, buffer);

    const url = `/uploads/${safeUid}/${name}`;
    return NextResponse.json({ url });
  } catch (err: any) {
    console.error('[upload]', err);
    return NextResponse.json(
      { error: err?.message || 'Upload failed' },
      { status: 500 }
    );
  }
}
