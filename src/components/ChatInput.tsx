'use client';

import { useRef, useState } from 'react';
import { Paperclip, Send, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/components/Toast';

interface ChatInputProps {
  onSend: (text: string, images: string[]) => Promise<void> | void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
          placeholder="Message Nova AI…"
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
          onClick={submit}
          disabled={disabled || (!text.trim() && images.length === 0)}
          className="btn-primary p-2.5 shrink-0 min-h-[44px] min-w-[44px]"
          title="Send"
        >
          {disabled ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>
      <p className="text-[11px] sm:text-xs text-white/40 text-center mt-2 px-2">
        <ImageIcon className="inline w-3 h-3 mr-1" />
        You can attach images. Nova AI can analyze them.
      </p>
    </div>
  );
}
