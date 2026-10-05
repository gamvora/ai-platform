import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-server';
import { rateLimit } from '@/lib/rateLimit';
import {
  streamChatCompletion,
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

function friendlyError(raw: string, hasImages: boolean): string {
  const n = raw.toLowerCase();
  if (n.includes('byNara') || n.includes('bynara_api_key'))
    return 'خدمة الذكاء الاصطناعي غير مهيأة. يرجى تعيين BYNARA_API_KEY في الخادم.';
  if (n.includes('unauthorized') || n.includes('invalid.?api'))
    return 'مفتاح API غير صالح. تواصل مع مدير النظام.';
  if (n.includes('insufficient_quota') || n.includes('balance') || n.includes('credit'))
    return 'نفاذ رصيد الذكاء الاصطناعي. يرجى إضافة رصيد والمحاولة مرة أخرى.';
  if (n.includes('429') || n.includes('rate limit'))
    return 'الذكاء الاصطناعي محدود حالياً. يرجى المحاولة بعد لحظات.';
  if (hasImages)
    return 'فشل تحليل الصورة. تأكد من أن الصورة محملة بشكل صحيح وأعد المحاولة.';
  return 'خدمة الذكاء الاصطناعي غير متاحة مؤقتاً. يرجى المحاولة لاحقاً.';
}

/**
 * Returns an SSE streaming response where each data line is one character (or small chunk).
 * The client reads `event: token` events to build the message incrementally.
 */
function sseStream(text: string): Response {
  const encoder = new TextEncoder();
  let i = 0;
  return new NextResponse(
    new ReadableStream({
      start(controller) {
        // Send conversation ID as a metadata event first
        controller.enqueue(encoder.encode(`event: meta\ndata: {"type":"ready"}\n\n`));
        while (i < text.length) {
          // Send 1-3 chars per tick for smooth typing effect
          const chunk = text.slice(i, i + Math.min(3, text.length - i));
          i += chunk.length;
          controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify(chunk)}\n\n`));
        }
        controller.close();
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    }
  );
}

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

    const userMsg: DbMessage = {
      role: 'user',
      content: message || '',
      images: images || [],
      createdAt: new Date().toISOString(),
    };
    conversation.messages.push(userMsg);

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
          'When the user attaches images, analyze them carefully.',
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

    // ── Stream the response ───────────────────────────────────────────────
    let fullContent = '';
    let streamErr: string | null = null;

    try {
      const stream = streamChatCompletion({
        model: model || MODELS.chat,
        messages: apiMessages,
      });
      for await (const chunk of stream) {
        fullContent += chunk;
      }
    } catch (err: any) {
      console.error('[chat] stream error:', err?.message);
      streamErr = friendlyError(err?.message || '', Array.isArray(images) && images.length > 0);
    }

    // Save conversation
    const assistantMsg: DbMessage = {
      role: 'assistant',
      content: fullContent || (streamErr ? `⚠️ ${streamErr}` : 'عذراً، لم أحصل على رد.'),
      createdAt: new Date().toISOString(),
    };
    conversation.messages.push(assistantMsg);

    if (conversation.messages.length <= 2 && message) {
      conversation.title = truncate(message, 40);
    }
    conversation.updatedAt = new Date().toISOString();
    await upsertConversation(conversation);

    // Return SSE stream with the full content
    return sseStream(fullContent || '');
  } catch (err: any) {
    console.error('[chat]', err);
    return NextResponse.json(
      { error: err?.message || 'Something went wrong.' },
      { status: 500 }
    );
  }
}
