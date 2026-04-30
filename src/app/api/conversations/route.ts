import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-server';
import { listConversations } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const convs = await listConversations(user.id);
    // Return both `id` (new, used by Sidebar) and `_id` (legacy, kept for
    // backwards compatibility with any older client code still reading it).
    const items = convs.map((c) => ({
      id: c.id,
      _id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
    return NextResponse.json({ conversations: items });
  } catch (err: any) {
    console.error('[conversations] list error', err);
    return NextResponse.json(
      { error: 'Failed to load conversations' },
      { status: 500 }
    );
  }
}
