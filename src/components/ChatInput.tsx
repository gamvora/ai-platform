'use client';

import { useEffect, useRef, useState } from 'react';
import { Paperclip, Send, X, Loader2, Image as ImageIcon, Mic, Square, Headphones } from 'lucide-react';
import { useToast } from '@/components/Toast';

interface ChatInputProps {
  onSend: (text: string, images: string[]) => Promise<void> | void;
  disabled?: boolean;
  onVoiceCallClick?: () => void;
}

export default function ChatInput({ onSend, disabled, onVoiceCallClick }: ChatInputProps) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef<string>('');
  const restartCountRef = useRef(0);
  const stopRequestedRef = useRef(false);

  useEffect(() => {
    const SR =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;
    setSpeechSupported(!!SR);

    return () => {
      try {
        if (recognitionRef.current) recognitionRef.current.stop();
      } catch {}
    };
  }, []);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        uploaded.push(data.url);
      }
      setImages((prev) => [...prev, ...uploaded]);
    } catch (err: any) {
      toast.error(err.message || 'Could not upload image');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function removeImage(i: number) {
    setImages((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit() {
    const content = text.trim();
    if (!content && images.length === 0) return;
    if (disabled) return;
    const toSend = { text: content, images };
    setText('');
    setImages([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    await onSend(toSend.text, toSend.images);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }

  function toggleVoiceInput() {
    const SR =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

    if (!SR) {
      toast.error('المتصفح لا يدعم الإدخال الصوتي');
      return;
    }

    if (isListening && recognitionRef.current) {
      stopRequestedRef.current = true;
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
      return;
    }

    const rec = new SR();
    recognitionRef.current = rec;
    stopRequestedRef.current = false;
    restartCountRef.current = 0;
    finalTranscriptRef.current = text ? text + ' ' : '';

    rec.lang = 'ar-SA';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = true;

    rec.onresult = (event: any) => {
      let interim = '';
      let finals = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = (event.results[i][0]?.transcript || '').trim();
        if (!chunk) continue;
        if (event.results[i].isFinal) finals += chunk + ' ';
        else interim += chunk + ' ';
      }

      if (finals) finalTranscriptRef.current += finals;

      const next = (finalTranscriptRef.current + interim).replace(/\s+/g, ' ').trim();
      setText(next);
      if (textareaRef.current) {
        textareaRef.current.value = next;
        autoGrow(textareaRef.current);
      }
    };

    rec.onerror = (e: any) => {
      setIsListening(false);
      if (e?.error === 'no-speech') {
        toast.error('لم يتم التقاط صوت، حاول مرة أخرى.');
        return;
      }
      if (e?.error === 'not-allowed') {
        toast.error('تم رفض إذن الميكروفون.');
        return;
      }
      toast.error('حدث خطأ أثناء التعرف على الصوت');
    };

    rec.onend = () => {
      if (stopRequestedRef.current) {
        setIsListening(false);
        stopRequestedRef.current = false;
        return;
      }

      if (isListening && restartCountRef.current < 2) {
        restartCountRef.current += 1;
        try {
          rec.start();
          return;
        } catch {}
      }

      setIsListening(false);
    };

    try {
      rec.start();
      setIsListening(true);
    } catch {
      toast.error('تعذر بدء التسجيل الصوتي');
      setIsListening(false);
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-2 sm:px-0 pb-[max(8px,env(safe-area-inset-bottom))]">
      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap px-1">
          {images.map((src, i) => (
            <div key={i} className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="preview" className="w-full h-full object-cover" />
              <button
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-1.5 sm:gap-2 bg-surface border border-border rounded-2xl p-2 sm:p-2.5 focus-within:border-primary-500 transition">
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading || disabled}
          className="btn-ghost p-2.5 shrink-0 min-h-[44px] min-w-[44px]"
          title="Attach image"
        >
          {uploading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Paperclip className="w-5 h-5" />
          )}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        <textarea
          ref={textareaRef}
          rows={1}
          placeholder="اكتب رسالتك إلى نوفا..."
          className="flex-1 bg-transparent resize-none outline-none px-1.5 sm:px-2 py-2.5 text-[15px] sm:text-base text-white placeholder:text-white/40 max-h-[200px]"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autoGrow(e.target);
          }}
          onKeyDown={onKeyDown}
          disabled={disabled}
        />

        <button
          onClick={toggleVoiceInput}
          disabled={disabled || !speechSupported}
          className="btn-ghost p-2.5 shrink-0 min-h-[44px] min-w-[44px]"
          title={isListening ? 'إيقاف التسجيل' : 'تحدث الآن'}
        >
          {isListening ? <Square className="w-5 h-5 text-rose-400" /> : <Mic className="w-5 h-5" />}
        </button>

        <button
          onClick={() => onVoiceCallClick?.()}
          disabled={disabled || !onVoiceCallClick}
          className="relative p-2.5 shrink-0 min-h-[44px] min-w-[44px] rounded-xl border border-cyan-400/40 bg-gradient-to-br from-cyan-500/30 via-sky-500/25 to-indigo-500/30 hover:from-cyan-500/40 hover:via-sky-500/35 hover:to-indigo-500/40 text-cyan-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
          title="Voice Call"
          aria-label="Start Voice Call"
        >
          <span className="absolute inset-0 rounded-xl shadow-[0_0_24px_rgba(34,211,238,0.35)] pointer-events-none" />
          <Headphones className="w-5 h-5 relative z-[1]" />
        </button>

        <button
          onClick={submit}
          disabled={disabled || (!text.trim() && images.length === 0)}
          className="btn-primary p-2.5 shrink-0 min-h-[44px] min-w-[44px]"
          title="إرسال"
        >
          {disabled ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>
      <p className="text-[11px] sm:text-xs text-white/40 text-center mt-2 px-2">
        <ImageIcon className="inline w-3 h-3 ml-1" />
        يمكنك إرفاق الصور، ونوفا يستطيع تحليلها.
        {speechSupported ? ' اضغط الميكروفون وتحدث بالعربية.' : ' (الإدخال الصوتي غير مدعوم في هذا المتصفح).'}
      </p>
    </div>
  );
}
