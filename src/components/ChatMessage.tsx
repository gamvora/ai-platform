'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { motion } from 'framer-motion';
import { Copy, Check, Sparkles, User as UserIcon, Volume2, Square } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

export interface ChatMessageData {
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  createdAt?: string | Date;
  botAvatarUrl?: string;
}

export default function ChatMessage({ message }: { message: ChatMessageData }) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const toast = useToast();
  const isUser = message.role === 'user';

  async function copyText() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      toast.success('تم النسخ');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('تعذر النسخ');
    }
  }

  function speakMessage() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      toast.error('المتصفح لا يدعم القراءة الصوتية');
      return;
    }

    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    const text = (message.content || '').replace(/[#*_`>-]/g, ' ').trim();
    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => {
      setSpeaking(false);
      toast.error('تعذر تشغيل الصوت');
    };

    setSpeaking(true);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn('flex gap-2 sm:gap-3 group', isUser ? 'flex-row-reverse' : '')}
    >
      {/* Avatar */}
      <div
        className={cn(
          'shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-lg grid place-items-center',
          isUser
            ? 'bg-gradient-to-br from-primary-500 to-primary-700'
            : 'bg-gradient-to-br from-accent to-blue-500'
        )}
      >
        {isUser ? (
          <UserIcon className="w-4 h-4 text-white" />
        ) : message.botAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={message.botAvatarUrl}
            alt="AI"
            className="w-full h-full rounded-lg object-cover"
          />
        ) : (
          <Sparkles className="w-4 h-4 text-white" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          'max-w-[88%] sm:max-w-[85%] md:max-w-[75%] rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3',
          isUser
            ? 'bg-gradient-to-br from-primary-600 to-primary-700 text-white rounded-tr-sm'
            : 'bg-surface border border-border text-white rounded-tl-sm'
        )}
      >
        {/* Uploaded images */}
        {message.images && message.images.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mb-2">
            {message.images.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt={`upload ${i}`}
                loading="lazy"
                className="rounded-lg max-h-64 object-cover w-full"
              />
            ))}
          </div>
        )}

        {/* Text */}
        {message.content && (
          <div className={cn(isUser ? '' : 'prose-chat')}>
            {isUser ? (
              <p className="whitespace-pre-wrap text-[15px] sm:text-base leading-relaxed">{message.content}</p>
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={oneDark as any}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          borderRadius: '0.75rem',
                          fontSize: '0.875rem',
                        }}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
          </div>
        )}

        {/* Actions */}
        {!isUser && message.content && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/60 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
            <button
              onClick={copyText}
              className="text-xs text-white/60 hover:text-white flex items-center gap-1"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3" /> تم النسخ
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" /> نسخ
                </>
              )}
            </button>
            <button
              onClick={speakMessage}
              className="text-xs text-white/60 hover:text-white flex items-center gap-1"
            >
              {speaking ? (
                <>
                  <Square className="w-3 h-3" /> إيقاف الصوت
                </>
              ) : (
                <>
                  <Volume2 className="w-3 h-3" /> قراءة الرد
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
