'use client';

import { useEffect, useRef, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { useToast } from '@/components/Toast';
import {
  Image as ImageIcon,
  Loader2,
  Download,
  Sparkles,
  Copy,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDate } from '@/lib/utils';

interface ImageItem {
  id: string;
  prompt: string;
  url: string;
  createdAt: string;
  model?: string;
  requestedModel?: string;
  effectiveModel?: string;
  provider?: string;
}

type Style = 'realistic' | 'anime' | '3d' | 'fantasy' | 'cinematic' | 'none';
type Size = '1024x1024' | '1024x1792' | '1792x1024' | '768x768';
type Model =
  | 'auto'
  | 'gpt-image-2'
  | 'gpt-image-1.5'
  | 'gpt-image-1'
  | 'gpt-image-1-mini'
  | 'dall-e-3'
  | 'dall-e-2'
  | 'gemini-2.5-flash-image-preview'
  | 'gemini-3.1-flash-image-preview'
  | 'flux.1-schnell'
  | 'flux.1-kontext'
  | 'stable-diffusion-xl'
  | 'stable-diffusion-3';

const STYLES: { value: Style; label: string; emoji: string }[] = [
  { value: 'none', label: 'Auto', emoji: '✨' },
  { value: 'realistic', label: 'Realistic', emoji: '📸' },
  { value: 'anime', label: 'Anime', emoji: '🎨' },
  { value: '3d', label: '3D', emoji: '🎮' },
  { value: 'fantasy', label: 'Fantasy', emoji: '🐉' },
  { value: 'cinematic', label: 'Cinematic', emoji: '🎬' },
];

const SIZES: { value: Size; label: string; aspect: string }[] = [
  { value: '1024x1024', label: 'Square', aspect: '1:1' },
  { value: '1024x1792', label: 'Portrait', aspect: '9:16' },
  { value: '1792x1024', label: 'Landscape', aspect: '16:9' },
  { value: '768x768', label: 'Compact', aspect: '1:1' },
];

const MODELS: { value: Model; label: string }[] = [
  { value: 'auto', label: 'Auto (Best Free)' },
  { value: 'gpt-image-2', label: 'GPT Image 2' },
  { value: 'gpt-image-1.5', label: 'GPT Image 1.5' },
  { value: 'gpt-image-1', label: 'GPT Image 1' },
  { value: 'gpt-image-1-mini', label: 'GPT Image 1 Mini' },
  { value: 'dall-e-3', label: 'DALL·E 3' },
  { value: 'dall-e-2', label: 'DALL·E 2' },
  { value: 'gemini-2.5-flash-image-preview', label: 'Gemini 2.5 Flash Image' },
  { value: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image' },
  { value: 'flux.1-schnell', label: 'FLUX.1 Schnell' },
  { value: 'flux.1-kontext', label: 'FLUX.1 Kontext' },
  { value: 'stable-diffusion-xl', label: 'Stable Diffusion XL' },
  { value: 'stable-diffusion-3', label: 'Stable Diffusion 3' },
];

const PROMPT_IDEAS = [
  'A cinematic shot of a lone astronaut on a neon-lit alien beach at sunset, ultra-detailed, 8k',
  'A cozy wooden cabin inside a snow globe, warm lights, miniature diorama',
  'Macro photo of a dewdrop on a leaf with a galaxy reflected inside',
  'Cyberpunk samurai in a rainy Tokyo alley, neon reflections on wet pavement',
  'An ancient library inside a giant tree, glowing books floating',
];

export default function ImagePage() {
  const toast = useToast();
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<Style>('none');
  const [size, setSize] = useState<Size>('1024x1024');
  const [model, setModel] = useState<Model>('auto');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ImageItem[]>([]);
  const [lightbox, setLightbox] = useState<ImageItem | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch('/api/image')
      .then((r) => r.json())
      .then((d) => setItems(d.images || []))
      .catch(() => {});
  }, []);

  function modelLabel(value?: string) {
    if (!value) return 'Unknown (legacy item)';
    const m = MODELS.find((x) => x.value === value);
    return m?.label || value;
  }

  function preloadImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!url) return reject(new Error('Empty image url'));
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image failed to load'));
      img.src = displayUrl(url);
    });
  }

  async function generate() {
    if (!prompt.trim()) {
      toast.info('Describe what you want to see');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style, size, model }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      const generated: ImageItem[] = data.images || [];
      if (!generated.length) throw new Error('No image returned from server');

      const first = generated[0];
      await preloadImage(first.url);

      setItems((prev) => [...generated, ...prev]);
      toast.success(
        `Image generated with ${modelLabel(first.effectiveModel || first.model || first.requestedModel)}`
      );
    } catch (err: any) {
      toast.error(err?.message || 'Could not generate/load image');
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl + Enter → submit
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !loading) {
      e.preventDefault();
      generate();
    }
  }

  async function download(url: string) {
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = `nova-ai-${Date.now()}.png`;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast.error('Download failed');
    }
  }

  function copyPrompt(text: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success('Prompt copied'),
      () => toast.error('Copy failed')
    );
  }

  function useIdea(idea: string) {
    setPrompt(idea);
    textareaRef.current?.focus();
  }

  // Ensure remote AI URLs load reliably by defaulting to same-origin proxy.
  function displayUrl(url: string): string {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) {
      return `/api/img-proxy?src=${encodeURIComponent(url)}`;
    }
    return url;
  }

  // Fallback img handler: if proxied URL fails, try direct URL once.
  function onImgError(e: React.SyntheticEvent<HTMLImageElement>, originalUrl: string) {
    const el = e.currentTarget;
    if (el.dataset.fallbackTried === '1') return;
    if (!/^https?:\/\//i.test(originalUrl)) return;
    el.dataset.fallbackTried = '1';
    el.src = originalUrl;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <header className="h-14 border-b border-border flex items-center px-4 md:px-6 glass sticky top-0 z-10">
          <div className="flex items-center gap-2 ml-10 md:ml-0">
            <ImageIcon className="w-4 h-4 text-primary-500" />
            <span className="font-medium">Image Generation</span>
          </div>
        </header>

        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
          {/* Hero */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-primary-500 to-accent grid place-items-center mb-4 shadow-lg shadow-primary-500/30">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">
              Create <span className="gradient-text">stunning images</span>
            </h1>
            <p className="text-white/60">
              Describe what you want to see — in any style. Powered by Flux.1.
            </p>
          </div>

          {/* Prompt card */}
          <div className="card mb-6">
            <textarea
              ref={textareaRef}
              rows={3}
              className="input mb-4 resize-none"
              placeholder="A cinematic shot of a lone astronaut on a neon-lit alien beach at sunset, ultra-detailed, 8k"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={loading}
            />

            {/* Model selector */}
            <div className="mb-3">
              <div className="text-xs text-white/50 mb-2">Model</div>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as Model)}
                disabled={loading}
                className="input w-full"
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Style chips */}
            <div className="mb-3">
              <div className="text-xs text-white/50 mb-2">Style</div>
              <div className="flex flex-wrap gap-2">
                {STYLES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setStyle(s.value)}
                    disabled={loading}
                    className={`px-3 py-1.5 rounded-full text-xs border transition ${
                      style === s.value
                        ? 'bg-primary-500 border-primary-500 text-white'
                        : 'bg-surface border-border text-white/70 hover:text-white hover:border-primary-500/50'
                    }`}
                  >
                    <span className="mr-1">{s.emoji}</span>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Size chips */}
            <div className="mb-4">
              <div className="text-xs text-white/50 mb-2">Aspect ratio</div>
              <div className="flex flex-wrap gap-2">
                {SIZES.map((sz) => (
                  <button
                    key={sz.value}
                    onClick={() => setSize(sz.value)}
                    disabled={loading}
                    className={`px-3 py-1.5 rounded-full text-xs border transition ${
                      size === sz.value
                        ? 'bg-primary-500 border-primary-500 text-white'
                        : 'bg-surface border-border text-white/70 hover:text-white hover:border-primary-500/50'
                    }`}
                  >
                    {sz.label}{' '}
                    <span className="text-white/40 ml-1">{sz.aspect}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-white/40 hidden sm:block">
                Tip: press{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border">
                  ⌘
                </kbd>{' '}
                +{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border">
                  Enter
                </kbd>{' '}
                to generate.
              </div>
              <button
                onClick={generate}
                disabled={loading || !prompt.trim()}
                className="btn-primary"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Generate
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Prompt ideas */}
          {items.length === 0 && !loading && (
            <div className="mb-8">
              <div className="text-xs text-white/50 mb-2">Need inspiration?</div>
              <div className="flex flex-wrap gap-2">
                {PROMPT_IDEAS.map((idea, i) => (
                  <button
                    key={i}
                    onClick={() => useIdea(idea)}
                    className="px-3 py-1.5 rounded-full text-xs bg-surface border border-border text-white/70 hover:text-white hover:border-primary-500/50 transition max-w-md text-left truncate"
                    title={idea}
                  >
                    {idea}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="rounded-xl overflow-hidden bg-surface border border-border aspect-square relative"
                >
                  <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/5 via-white/10 to-white/5" />
                  <div className="absolute inset-0 grid place-items-center">
                    <div className="flex flex-col items-center gap-2 text-white/50">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span className="text-xs">
                        {i === 0
                          ? 'Conjuring pixels…'
                          : 'This can take up to 30s on first run'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Gallery */}
          {items.length === 0 && !loading ? (
            <p className="text-center text-white/40 py-8">
              Your generated images will appear here.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="group relative rounded-xl overflow-hidden bg-surface border border-border cursor-zoom-in"
                  onClick={() => setLightbox(item)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={displayUrl(item.url)}
                    alt={item.prompt}
                    loading="lazy"
                    onError={(e) => onImgError(e, item.url)}
                    className="w-full aspect-square object-cover group-hover:scale-105 transition duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition" />
                  <div className="absolute inset-x-0 bottom-0 p-3 opacity-0 group-hover:opacity-100 transition">
                    <p className="text-xs text-white/80 line-clamp-2 mb-1">
                      {item.prompt}
                    </p>
                    <p className="text-[10px] text-primary-300/90 mb-1">
                      Requested: {modelLabel(item.requestedModel)}
                    </p>
                    <p className="text-[10px] text-emerald-300/90 mb-2">
                      Used: {modelLabel(item.effectiveModel || item.model)}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-white/50">
                        {formatDate(item.createdAt)}
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyPrompt(item.prompt);
                          }}
                          className="btn-secondary text-xs py-1.5 px-2"
                          title="Copy prompt"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            download(item.url);
                          }}
                          className="btn-secondary text-xs py-1.5 px-3"
                        >
                          <Download className="w-3 h-3" /> Save
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Lightbox */}
        <AnimatePresence>
          {lightbox && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 grid place-items-center p-4"
              onClick={() => setLightbox(null)}
            >
              <button
                onClick={() => setLightbox(null)}
                className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                className="max-w-5xl max-h-[85vh] flex flex-col items-center gap-3"
                onClick={(e) => e.stopPropagation()}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayUrl(lightbox.url)}
                  alt={lightbox.prompt}
                  onError={(e) => onImgError(e, lightbox.url)}
                  className="max-h-[70vh] rounded-xl object-contain shadow-2xl"
                />
                <p className="text-sm text-white/80 max-w-2xl text-center">
                  {lightbox.prompt}
                </p>
                <p className="text-xs text-primary-300/90">
                  Requested: {modelLabel(lightbox.requestedModel)}
                </p>
                <p className="text-xs text-emerald-300/90">
                  Used: {modelLabel(lightbox.effectiveModel || lightbox.model)}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => copyPrompt(lightbox.prompt)}
                    className="btn-secondary text-xs"
                  >
                    <Copy className="w-3 h-3" /> Copy prompt
                  </button>
                  <button
                    onClick={() => download(lightbox.url)}
                    className="btn-primary text-xs"
                  >
                    <Download className="w-3 h-3" /> Download
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
