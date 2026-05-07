'use client';

/**
 * ImageTransformTool
 * ------------------
 * Shared page-level component that powers all of Phase C's img2img tools:
 * face-swap, outfit-swap, upscale, remove-bg, sketch-to-image.
 *
 * Each tool page renders this component with its own configuration. The
 * component handles:
 *   - source image upload (via /api/upload) or URL paste
 *   - optional text prompt with style-chip helpers
 *   - POST to the tool's endpoint, receive `{ items: [...] }`
 *   - gallery of results (newest first) with download button
 *   - history load on mount via GET to the same endpoint
 */
import { useEffect, useRef, useState, type ComponentType } from 'react';
import Sidebar from '@/components/Sidebar';
import { useToast } from '@/components/Toast';
import {
  Loader2,
  Download,
  Sparkles,
  Upload,
  X,
  ArrowRight,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDate } from '@/lib/utils';

export interface ImageTransformToolConfig {
  /** Page slug, used in download filename (e.g. "face-swap"). */
  slug: string;
  /** Page title (header bar). */
  title: string;
  /** Hero heading, first line e.g. "Swap outfits in" . */
  headingStart: string;
  /** Hero heading, second gradient line e.g. "any photo". */
  headingAccent: string;
  /** Subtitle under hero. */
  subtitle: string;
  /** Lucide icon component for the hero + header. */
  icon: ComponentType<{ className?: string }>;
  /** Tailwind gradient classes for hero icon, e.g. "from-pink-500 to-rose-500". */
  gradient: string;
  /** POST/GET endpoint, e.g. "/api/face-swap". */
  endpoint: string;
  /** Placeholder text for the prompt textarea. */
  promptPlaceholder: string;
  /** Button CTA, e.g. "Swap faces". */
  ctaLabel: string;
  /** Busy-state label e.g. "Swapping...". */
  busyLabel: string;
  /** Optional style-chip suggestions appended to prompt on click. */
  styleChips?: string[];
  /**
   * Whether the user MUST type a prompt. If false, the server's preset
   * prompt is used when user leaves the box empty.
   */
  requireUserPrompt?: boolean;
  /** Optional helpful tip shown under the prompt area. */
  tip?: string;
  /** Optional second image input (for face-swap: the target face). */
  secondImage?: {
    label: string;
    placeholder: string;
    /** Body key to send. */
    field: string;
  };
}

interface ResultItem {
  id: string;
  prompt: string;
  url: string;
  createdAt: string;
  requestedModel?: string;
  effectiveModel?: string;
  provider?: string;
}

export default function ImageTransformTool({
  config,
}: {
  config: ImageTransformToolConfig;
}) {
  const toast = useToast();
  const Icon = config.icon;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const secondFileInputRef = useRef<HTMLInputElement>(null);

  const [prompt, setPrompt] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [secondUrl, setSecondUrl] = useState('');
  const [secondName, setSecondName] = useState('');
  const [uploading, setUploading] = useState<'source' | 'second' | null>(null);
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState('auto');
  const [items, setItems] = useState<ResultItem[]>([]);

  useEffect(() => {
    fetch(config.endpoint)
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(() => {});
  }, [config.endpoint]);

  async function uploadFile(file: File, slot: 'source' | 'second') {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    setUploading(slot);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      if (slot === 'source') {
        setSourceUrl(data.url);
        setSourceName(file.name);
      } else {
        setSecondUrl(data.url);
        setSecondName(file.name);
      }
      toast.success('Image uploaded');
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(null);
    }
  }

  const MODEL_OPTIONS = [
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

  async function run() {
    if (!sourceUrl) {
      toast.info('Upload a source image first');
      return;
    }
    if (config.secondImage && !secondUrl) {
      toast.info(`Upload the ${config.secondImage.label.toLowerCase()} too`);
      return;
    }
    if (config.requireUserPrompt && !prompt.trim()) {
      toast.info('Please describe what you want');
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, any> = {
        prompt: prompt.trim(),
        imageUrl: sourceUrl,
        model,
      };
      if (config.secondImage) {
        body[config.secondImage.field] = secondUrl;
      }

      const res = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setItems((prev) => [...(data.items || []), ...prev]);
      setPrompt('');
      toast.success('Done!');
    } catch (err: any) {
      toast.error(err.message || 'Could not generate');
    } finally {
      setLoading(false);
    }
  }

  function displayUrl(url: string): string {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) {
      return `/api/img-proxy?src=${encodeURIComponent(url)}`;
    }
    return url;
  }

  function onImgError(
    e: React.SyntheticEvent<HTMLImageElement>,
    originalUrl: string
  ) {
    const el = e.currentTarget;
    if (el.dataset.fallbackTried === '1') return;
    if (!/^https?:\/\//i.test(originalUrl)) return;
    el.dataset.fallbackTried = '1';
    el.src = originalUrl;
  }

  function download(url: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `nova-ai-${config.slug}-${Date.now()}.png`;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function clearSource() {
    setSourceUrl('');
    setSourceName('');
  }
  function clearSecond() {
    setSecondUrl('');
    setSecondName('');
  }

  return (
    <div className="flex overflow-hidden" style={{ height: '100dvh' }}>
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <header className="h-14 border-b border-border flex items-center px-4 md:px-6 glass sticky top-0 z-10">
          <div className="flex items-center gap-2 ml-10 md:ml-0">
            <Icon className="w-4 h-4 text-primary-500" />
            <span className="font-medium">{config.title}</span>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
          <div className="text-center mb-8">
            <div
              className={`w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br ${config.gradient} grid place-items-center mb-4`}
            >
              <Icon className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">
              {config.headingStart}{' '}
              <span className="gradient-text">{config.headingAccent}</span>
            </h1>
            <p className="text-white/60">{config.subtitle}</p>
          </div>

          <div className="card mb-8">
            {/* Source + optional second image + prompt */}
            <div
              className={`grid gap-4 items-stretch mb-4 ${
                config.secondImage
                  ? 'md:grid-cols-2'
                  : 'md:grid-cols-[1fr_auto_1fr]'
              }`}
            >
              {/* Source slot */}
              <ImageSlot
                url={sourceUrl}
                name={sourceName}
                uploading={uploading === 'source'}
                onPick={() => fileInputRef.current?.click()}
                onClear={clearSource}
                label="Source image"
              />
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f, 'source');
                  e.target.value = '';
                }}
              />

              {config.secondImage ? (
                <>
                  <ImageSlot
                    url={secondUrl}
                    name={secondName}
                    uploading={uploading === 'second'}
                    onPick={() => secondFileInputRef.current?.click()}
                    onClear={clearSecond}
                    label={config.secondImage.label}
                  />
                  <input
                    type="file"
                    ref={secondFileInputRef}
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadFile(f, 'second');
                      e.target.value = '';
                    }}
                  />
                </>
              ) : (
                <>
                  <div className="hidden md:flex items-center justify-center">
                    <ArrowRight className="w-6 h-6 text-white/40" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <textarea
                      rows={6}
                      className="input resize-none flex-1"
                      placeholder={config.promptPlaceholder}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      disabled={loading}
                    />
                    {config.styleChips && config.styleChips.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {config.styleChips.map((chip) => (
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
                    )}
                  </div>
                </>
              )}
            </div>

            {/* When secondImage is present, prompt gets its own row */}
            {config.secondImage && (
              <div className="mb-4">
                <textarea
                  rows={3}
                  className="input resize-none w-full"
                  placeholder={config.promptPlaceholder}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={loading}
                />
                {config.styleChips && config.styleChips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {config.styleChips.map((chip) => (
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
                )}
              </div>
            )}

            <div className="mb-3">
              <div className="text-xs text-white/50 mb-2">Model</div>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={loading}
                className="input w-full"
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="text-xs text-white/40">
                {config.tip || 'Tip: use clear, well-lit photos for the best results.'}
              </div>
              <button
                onClick={run}
                disabled={loading || !sourceUrl}
                className="btn-primary"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />{' '}
                    {config.busyLabel}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> {config.ctaLabel}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Gallery */}
          {items.length === 0 ? (
            <p className="text-center text-white/40 py-8">
              Your results will appear here.
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
                    src={displayUrl(item.url)}
                    alt={item.prompt}
                    loading="lazy"
                    onError={(e) => onImgError(e, item.url)}
                    className="w-full aspect-square object-cover group-hover:scale-105 transition duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition" />
                  <div className="absolute inset-x-0 bottom-0 p-3 opacity-0 group-hover:opacity-100 transition">
                    <p className="text-xs text-white/80 line-clamp-2 mb-2">
                      {item.prompt || '(no prompt)'}
                    </p>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-white/50">
                        {formatDate(item.createdAt)}
                      </span>
                      <span className="text-[10px] text-white/50">
                        Requested: {item.requestedModel || 'unknown'}
                      </span>
                      <span className="text-[10px] text-emerald-300">
                        Used: {item.effectiveModel || 'unknown'}
                      </span>
                    </div>
                    <div>
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

interface ImageSlotProps {
  url: string;
  name: string;
  uploading: boolean;
  onPick: () => void;
  onClear: () => void;
  label: string;
}

function ImageSlot({ url, name, uploading, onPick, onClear, label }: ImageSlotProps) {
  return (
    <div className="relative rounded-xl border-2 border-dashed border-border bg-surface-light/40 overflow-hidden min-h-[180px] flex items-center justify-center">
      {url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={/^https?:\/\//i.test(url) ? `/api/img-proxy?src=${encodeURIComponent(url)}` : url}
            alt={label}
            onError={(e) => {
              const el = e.currentTarget;
              if (el.dataset.fallbackTried === '1') return;
              if (!/^https?:\/\//i.test(url)) return;
              el.dataset.fallbackTried = '1';
              el.src = url;
            }}
            className="w-full h-full object-contain"
          />
          <button
            onClick={onClear}
            className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full"
            aria-label="Remove"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <div className="absolute bottom-0 inset-x-0 p-2 text-[10px] text-white/70 bg-black/60 truncate">
            {name || label}
          </div>
        </>
      ) : (
        <button
          onClick={onPick}
          disabled={uploading}
          className="flex flex-col items-center gap-2 text-white/50 hover:text-white transition p-4"
        >
          {uploading ? (
            <Loader2 className="w-8 h-8 animate-spin" />
          ) : (
            <Upload className="w-8 h-8" />
          )}
          <span className="text-sm">{label}</span>
          <span className="text-xs text-white/30">PNG / JPG / WebP</span>
        </button>
      )}
    </div>
  );
}
