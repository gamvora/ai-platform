import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-server';
import crypto from 'node:crypto';
import { getSupabase, hasSupabase } from '@/lib/supabase';

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
    const buffer = Buffer.from(await file.arrayBuffer());

    // Serverless-safe path: use Supabase Storage when configured (required on Vercel).
    if (hasSupabase()) {
      const supabase = getSupabase();
      const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';
      if (!supabase) {
        return NextResponse.json(
          { error: 'Storage is not configured correctly' },
          { status: 500 }
        );
      }

      const objectPath = `${safeUid}/${name}`;
      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(objectPath, buffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });

      if (upErr) {
        console.error('[upload] supabase storage upload error:', upErr);
        return NextResponse.json(
          {
            error:
              upErr.message ||
              'Failed to upload image to storage. Check bucket existence and storage policies.',
          },
          { status: 500 }
        );
      }

      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(objectPath);
      if (!pub?.publicUrl) {
        return NextResponse.json(
          { error: 'Failed to get public image URL' },
          { status: 500 }
        );
      }

      return NextResponse.json({ url: pub.publicUrl });
    }

    return NextResponse.json(
      {
        error:
          'File upload requires Supabase Storage in production. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      },
      { status: 500 }
    );
  } catch (err: any) {
    console.error('[upload]', err);
    return NextResponse.json(
      { error: err?.message || 'Upload failed' },
      { status: 500 }
    );
  }
}
