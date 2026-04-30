'use client';

import { useEffect, useRef, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { useToast } from '@/components/Toast';
import {
  Wand2,
  Loader2,
  Download,
  Sparkles,
  Upload,
  X,
  ArrowRight,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDate } from '@/lib/utils';

interface EditItem {
  id: string;
  prompt: string;
  url: string;
  createdAt: string;
}

const STYLE_CHIPS = [
  'anime style',
  'oil painting',
  'cyberpunk',
  'watercolor',
  'pixel art',
  'photorealistic',
  'studio ghibli',
  '3d render',
];

/**
 * Image Editor page (img2img)
 * ---------------------------
 * User uploads a source image (or pastes a URL), types a transformation
 * prompt, and receives a new AI-generated image guided by both.
 *
 * Pipeline (in /api/edit):
 *   1. Try Blackbox vision chat → extracts resulting image URL
 *   2. Fallback → Pollinations img2img (?image=<url>, free)
 */
export default function EditPage() {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState('');
  const [sourceUrl, setSourceUrl] = useState<string>('');
  const [sourceName, setSourceName] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<EditItem[]>([]);

  useEffect(() => {
    fetch('/api/edit')
      .then((r) => r.json())
      .then((d) => setItems(d.edits || []))
      .catch(() => {});
  }, []);

  async function handleFile(file: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setSourceUrl(data.url);
      setSourceName(file.name);
      toast.success('Image uploaded');
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function generate() {
    if (!sourceUrl) {
      toast.info('Upload or paste a source image first');
      return;
    }
    if (!prompt.trim()) {
      toast.info('Describe how you want to edit the image');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, imageUrl: sourceUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Edit failed');
      setItems((prev) => [...(data.edits || []), ...prev]);
      setPrompt('');
      toast.success('Image edited!');
    } catch (err: any) {
      toast.error(err.message || 'Could not edit image');
    } finally {
      setLoading(false);
    }
  }

  function download(url: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `nova-ai-edit-${Date.now()}.png`;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <header className="h-14 border-b border-border flex items-center px-4 md:px-6 glass sticky top-0 z-10">
          <div className="flex items-center gap-2 ml-10 md:ml-0">
            <Wand2 className="w-4 h-4 text-primary-500" />
            <span className="font-medium">Image Editor · img2img</span>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center mb-4">
              <Wand2 className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">
              Transform any <span className="gradient-text">image with AI</span>
            </h1>
            <p className="text-white/60">
              Upload a photo and describe the edit you want.
            </p>
          </div>

          <div className="card mb-8">
            {/* Source + arrow + prompt */}
            <div className="grid md:grid-cols-[1fr_auto_1fr] gap-4 items-stretch mb-4">
              {/* Source slot */}
              <div className="relative rounded-xl border-2 border-dashed border-border bg-surface-light/40 overflow-hidden min-h-[180px] flex items-center justify-center">
                {sourceUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sourceUrl}
                      alt="Source"
                      className="w-full h-full object-contain"
                    />
                    <button
                      onClick={() => {
                        setSourceUrl('');
                        setSourceName('');
                      }}
                      className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full"
                      aria-label="Remove source"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="absolute bottom-0 inset-x-0 p-2 text-[10px] text-white/70 bg-black/60 truncate">
                      {sourceName || 'source image'}
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex flex-col items-center gap-2 text-white/50 hover:text-white transition p-4"
                  >
                    {uploading ? (
                      <Loader2 className="w-8 h-8 animate-spin" />
                    ) : (
                      <Upload className="w-8 h-8" />
                    )}
                    <span className="text-sm">Click to upload image</span>
                    <span className="text-xs text-white/30">
                      PNG / JPG / WebP up to 10MB
                    </span>
                  </button>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = '';
                  }}
                />
              </div>

              {/* Arrow */}
              <div className="hidden md:flex items-center justify-center">
                <ArrowRight className="w-6 h-6 text-white/40" />
              </div>

              {/* Prompt */}
              <div className="flex flex-col gap-2">
                <textarea
                  rows={6}
                  className="input resize-none flex-1"
                  placeholder="make it anime style, vibrant colors, studio ghibli"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={loading}
                />
                <div className="flex flex-wrap gap-1.5">
                  {STYLE_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() =>
                        setPrompt((p) =>
                          p.trim()
                            ? `${p.trim().replace(/,\s*$/, '')}, ${chip}`
                            : chip
                        )
                      }
                      className="text-[11px] px-2 py-1 rounded-full bg-surface-light hover:bg-primary-500/20 text-white/70 hover:text-primary-400 transition"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs text-white/40">
                Tip: be specific — include style, colors, lighting, mood.
              </div>
              <button
                onClick={generate}
                disabled={loading || !sourceUrl}
                className="btn-primary"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Editing…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Edit image
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Gallery */}
          {items.length === 0 ? (
            <p className="text-center text-white/40 py-8">
              Your edited images will appear here.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="group relative rounded-xl overflow-hidden bg-surface border border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={item.prompt}
                    loading="lazy"
                    className="w-full aspect-square object-cover group-hover:scale-105 transition duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition" />
                  <div className="absolute inset-x-0 bottom-0 p-3 opacity-0 group-hover:opacity-100 transition">
                    <p className="text-xs text-white/80 line-clamp-2 mb-2">
                      {item.prompt}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-white/50">
                        {formatDate(item.createdAt)}
                      </span>
                      <button
                        onClick={() => download(item.url)}
                        className="btn-secondary text-xs py-1.5 px-3"
                      >
                        <Download className="w-3 h-3" /> Download
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
