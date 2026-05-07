import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-server';
import { rateLimit } from '@/lib/rateLimit';
import {
  chatCompletion,
  ChatMessage,
  MODELS,
  toExternalImageRef,
} from '@/lib/blackbox';
import { truncate } from '@/lib/utils';
import {
  createConversation,
  getConversation,
  upsertConversation,
  type ChatMessage as DbMessage,
} from '@/lib/db';

export const maxDuration = 60;
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const rl = rateLimit(`chat:${user.id}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please slow down.' },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const {
      conversationId,
      message,
      images,
      model,
    }: {
      conversationId?: string;
      message: string;
      images?: string[];
      model?: string;
    } = body;

    if (!message && (!images || images.length === 0)) {
      return NextResponse.json(
        { error: 'Message or image is required' },
        { status: 400 }
      );
    }

    // Load or create conversation
    let conversation = conversationId
      ? await getConversation(user.id, conversationId)
      : null;

    if (conversationId && !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    if (!conversation) {
      conversation = await createConversation(
        user.id,
        truncate(message || 'New chat', 40)
      );
    }

    // Append user message
    const userMsg: DbMessage = {
      role: 'user',
      content: message || '',
      images: images || [],
      createdAt: new Date().toISOString(),
    };
    conversation.messages.push(userMsg);

    // Build Blackbox API messages — include image content when present.
    // Resolve local /uploads/* paths to base64 data URIs so the external
    // vision model can actually "see" the user-uploaded images (it cannot
    // reach localhost). Absolute https:// URLs are passed through.
    const protoHeader = req.headers.get('x-forwarded-proto') || 'http';
    const hostHeader = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
    const publicHost = hostHeader ? `${protoHeader}://${hostHeader}` : '';

    const apiMessages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are alaa ai, a helpful, friendly, highly-capable AI assistant. ' +
          'Use clean markdown, fenced code blocks with language tags, and concise explanations. ' +
          'Always reply in Arabic unless the user explicitly asks for another language. ' +
          'If asked "من هي فرح" or "فرح من هي", answer exactly: "فرح البيض". ' +
          'When the user attaches images, analyze them carefully and describe what you see.',
      },
      ...(await Promise.all(
        conversation.messages.map(async (m): Promise<ChatMessage> => {
          if (m.images && m.images.length > 0) {
            const resolved = await Promise.all(
              m.images.map((u) => toExternalImageRef(u, { publicHost }))
            );
            return {
              role: m.role,
              content: [
                { type: 'text' as const, text: m.content || '' },
                ...resolved.map((url) => ({
                  type: 'image_url' as const,
                  image_url: { url },
                })),
              ],
            };
          }
          return { role: m.role, content: m.content };
        })
      )),
    ];

    // Call Blackbox API
    let assistantContent: string;
    try {
      const res = await chatCompletion({
        model: model || MODELS.chat,
        messages: apiMessages,
      });
      const data = await res.json();
      assistantContent =
        data?.choices?.[0]?.message?.content?.toString() ??
        'Sorry, I got no response.';
    } catch (err: any) {
      console.error('[chat] Blackbox API error:', err?.message);
      const hasImages = Array.isArray(images) && images.length > 0;
      const raw = String(err?.message || '');
      const normalized = raw.toLowerCase();

      const friendly = normalized.includes('blackbox_api_key is not configured')
        ? 'AI service is not configured on the server. Please set BLACKBOX_API_KEY.'
        : normalized.includes('cannot access application')
          ? 'AI provider رفض الطلب: المفتاح لا يملك صلاحية على الموديل الحالي.'
          : normalized.includes('exhausted balance') || normalized.includes('locked')
            ? 'AI provider is out of credits at the moment. Please try again later.'
            : normalized.includes('429')
              ? 'AI provider is rate-limited right now. Please retry in a moment.'
              : hasImages
                ? 'Image analysis failed. Please verify the uploaded image URL is accessible and try again.'
                : 'AI service is temporarily unavailable. Please try again.';

      return NextResponse.json(
        {
          error: friendly,
        },
        { status: 502 }
      );
    }

    const assistantMsg: DbMessage = {
      role: 'assistant',
      content: assistantContent,
      createdAt: new Date().toISOString(),
    };
    conversation.messages.push(assistantMsg);

    // Update title on first exchange
    if (conversation.messages.length <= 2 && message) {
      conversation.title = truncate(message, 40);
    }
    conversation.updatedAt = new Date().toISOString();

    await upsertConversation(conversation);

    return NextResponse.json({
      conversationId: conversation.id,
      title: conversation.title,
      message: assistantMsg,
    });
  } catch (err: any) {
    console.error('[chat]', err);
    return NextResponse.json(
      { error: err?.message || 'Something went wrong.' },
      { status: 500 }
    );
  }
}
