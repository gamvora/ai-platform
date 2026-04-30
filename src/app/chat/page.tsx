'use client';

import { useEffect, useRef, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import ChatMessage, { ChatMessageData } from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';
import TypingIndicator from '@/components/TypingIndicator';
import { useToast } from '@/components/Toast';
import { Sparkles, MessageSquare, Image as ImageIcon, Video } from 'lucide-react';

export default function ChatPage() {
  const toast = useToast();
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [sending, setSending] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [botAvatarUrl, setBotAvatarUrl] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, sending]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/user/preferences', { cache: 'no-store' });
        const data = await res.json();
        if (res.ok) setBotAvatarUrl(data.preferences?.botAvatarUrl || '');
      } catch {
        /* noop */
      }
    })();
  }, []);

  async function loadConversation(id: string) {
    // Guard: bail out on obviously-bad ids so we never hit /api/conversations/undefined
    if (!id || id === 'undefined' || id === 'null') {
      toast.error('That conversation link is invalid.');
      newChat();
      return;
    }
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        credentials: 'include',
      });
      if (res.status === 404) {
        // Stale id (conversation was deleted, belongs to a different account,
        // or sidebar rendered before the latest refresh). Don't error-toast —
        // just reset to a fresh chat and let the user continue.
        toast.info?.('That conversation no longer exists. Started a new chat.');
        newChat();
        setRefreshKey((k) => k + 1);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setConversationId(id);
      setMessages(
        (data.conversation.messages || []).map((m: any) => ({
          role: m.role,
          content: m.content,
          images: m.images || [],
          createdAt: m.createdAt,
        }))
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to load conversation');
    }
  }

  function newChat() {
    setConversationId(undefined);
    setMessages([]);
  }

  async function send(text: string, images: string[]) {
    const userMsg: ChatMessageData = {
      role: 'user',
      content: text,
      images,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          message: text,
          images,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get response');
      setConversationId(data.conversationId);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.message.content,
          createdAt: data.message.createdAt,
          botAvatarUrl,
        },
      ]);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ **Error**: ${err.message || 'Something went wrong.'}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        activeConversationId={conversationId}
        onSelectConversation={loadConversation}
        onNewChat={newChat}
        refreshKey={refreshKey}
      />

      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-border flex items-center px-3 sm:px-4 md:px-6 shrink-0 glass">
          <div className="flex items-center gap-2 ml-12 md:ml-0">
            <MessageSquare className="w-4 h-4 text-primary-500" />
            <span className="font-medium">Nova Chat</span>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <EmptyState onSuggest={(s) => send(s, [])} />
          ) : (
            <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-5">
              {messages.map((m, i) => (
                <ChatMessage
                  key={i}
                  message={{ ...m, botAvatarUrl: m.botAvatarUrl || botAvatarUrl }}
                />
              ))}
              {sending && <TypingIndicator />}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-2 sm:p-4 border-t border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <ChatInput onSend={send} disabled={sending} />
        </div>
      </main>
    </div>
  );
}

function EmptyState({ onSuggest }: { onSuggest: (s: string) => void }) {
  const suggestions = [
    'Explain quantum computing in simple terms',
    'Write a TypeScript function to debounce events',
    'Give me 5 creative product names for a coffee brand',
    'Plan a 3-day itinerary for Kyoto',
  ];
  return (
    <div className="h-full flex flex-col items-center justify-center px-4 py-10">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-accent grid place-items-center mb-6">
        <Sparkles className="w-8 h-8 text-white" />
      </div>
      <h1 className="text-3xl md:text-4xl font-bold mb-2 gradient-text">
        How can I help you today?
      </h1>
      <p className="text-white/60 mb-10 text-center max-w-lg">
        Ask anything, upload images for analysis, or generate visuals and videos.
      </p>

      <div className="grid sm:grid-cols-2 gap-3 w-full max-w-2xl mb-6">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSuggest(s)}
            className="card text-left hover:border-primary-500/50 transition text-sm text-white/80"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex gap-2 text-xs text-white/50">
        <span className="inline-flex items-center gap-1">
          <ImageIcon className="w-3 h-3" /> Image gen
        </span>
        <span>•</span>
        <span className="inline-flex items-center gap-1">
          <Video className="w-3 h-3" /> Video gen
        </span>
      </div>
    </div>
  );
}
