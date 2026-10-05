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
  Camera,
  Zap,
  Layers,
  Globe,
  AlertCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDate } from '@/lib/utils';

interface ImageItem {
  id: string;
  prompt: string;
  url: string;
  createdAt: string;
  model?: string;
}

// ── Puter.js model catalog (full API with all quality/settings) ───────────────
const MODELS = [
  { id: 'openai/gpt-image-2',        label: 'GPT Image 2',       desc: 'OpenAI' },
  { id: 'openai/gpt-image-2.5-flare',    label: 'GPT Image 2.5 Flare',  desc: 'OpenAI' },
  { id: 'openai/gpt-image-2.5-sunburst', label: 'GPT Image 2.5 Sunburst', desc: 'OpenAI' },
  { id: 'google/gemini-3.1-flash-image', label: 'Gemini 3.1 Flash Image', desc: 'Google' },
  { id: 'google/gemini-3-pro-image',     label: 'Gemini 3 Pro Image',    desc: 'Google' },
  { id: 'black-forest-labs/flux-2-pro',  label: 'FLUX 2 Pro',           desc: 'Black Forest' },
  { id: 'black-forest-labs/flux-2-dev',  label: 'FLUX 2 Dev',           desc: 'Black Forest' },
  { id: 'black-forest-labs/flux-schnell',label: 'FLUX Schnell',         desc: 'Black Forest' },
  { id: 'x-ai/grok-imagine-image-2.0',   label: 'Grok Imagine 2.0',     desc: 'xAI' },
  { id: 'stabilityai/stable-diffusion-xl-base-1.0', label: 'SDXL', desc: 'Stability' },
];

const QUALITY_LEVELS: { value: string; label: string; models: string[] }[] = [
  { value: 'low',     label: 'Low',   models: ['openai/gpt-image-2', 'openai/gpt-image-2.5-flare', 'openai/gpt-image-2.5-sunburst'] },
  { value: 'medium',  label: 'Medium',models: ['openai/gpt-image-2', 'openai/gpt-image-2.5-flare', 'openai/gpt-image-2.5-sunburst'] },
  { value: 'high',    label: 'High',  models: ['openai/gpt-image-2', 'openai/gpt-image-2.5-flare', 'openai/gpt-image-2.5-sunburst'] },
  { value: 'xhigh',   label: 'XHigh', models: ['openai/gpt-image-2.5-flare', 'openai/gpt-image-2.5-sunburst'] },
  { value: 'max',     label: 'Max',   models: ['openai/gpt-image-2.5-flare', 'openai/gpt-image-2.5-sunburst'] },
];

const SIZES: { value: string; label: string; aspect: string; w: number; h: number }[] = [
  { value: '512x512', label: 'Small', aspect: '1:1', w: 512, h: 512 },
  { value: '768x768', label: 'Medium', aspect: '1:1', w: 768, h: 768 },
  { value: '1024x1024', label: 'Large', aspect: '1:1', w: 1024, h: 1024 },
  { value: '1024x1792', label: 'Portrait', aspect: '9:16', w: 1024, h: 1792 },
  { value: '1792x1024', label: 'Landscape', aspect: '16:9', w: 1792, h: 1024 },
];

const PROMPT_IDEAS = [
  'A cinematic shot of a lone astronaut on a neon-lit alien beach at sunset, ultra-detailed, 8k',
  'A cozy wooden cabin inside a snow globe, warm lights, miniature diorama',
  'Macro photo of a dewdrop on a leaf with a galaxy reflected inside',
  'Cyberpunk city at night with neon reflections on wet pavement, aerial view',
  'An ancient library inside a giant tree, glowing books floating',
  'A majestic dragon flying over snow-capped mountains at golden hour',
  'A serene Japanese garden with cherry blossoms and a koi pond',
  'Futuristic space station orbiting a colorful nebula',
];

export default function ImagePage() {
  const toast = useToast();
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState(MODELS[0].id);
  const [quality, setQuality] = useState('low');
  const [size, setSize] = useState(SIZES[2]); // 1024x1024 default
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ImageItem[]>([]);
  const [lightbox, setLightbox] = useState<ImageItem | null>(null);
  const [puterReady, setPuterReady] = useState(false);
  const [puterError, setPuterError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Check if Puter.js loaded
  useEffect(() => {
    const checkPuter = () => {
      const p = (window as any).puter;
      if (p) {
        setPuterReady(true);
      } else {
        setTimeout(checkPuter, 500);
      }
    };
    checkPuter();
    // Timeout fallback
    setTimeout(() => {
      if (!puterReady) setPuterError('فشل تحميل مكتبة توليد الصور. تأكد من اتصال الإنترنت.');
    }, 8000);
  }, [puterReady]);

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('nova_image_history');
      if (saved) setItems(JSON.parse(saved));
    } catch {}
  }, []);

  function saveHistory(newItems: ImageItem[]) {
    try {
      localStorage.setItem('nova_image_history', JSON.stringify(newItems.slice(0, 30)));
    } catch {}
  }

  async function generate() {
    if (!prompt.trim()) { toast.info('اكتب وصفاً للصورة التي تريدها'); return; }
    if (!puterReady) {
      toast.error('خدمة توليد الصور لم تتجه بعد. انتظر لحظة...');
      return;
    }

    setLoading(true);
    try {
      const puter = (window as any).puter;
      const [w, h] = size.value.split('x').map(Number);

      // Build options object
      const options: Record<string, any> = {
        model: model,
        width: w,
        height: h,
      };
      if (QUALITY_LEVELS.find(q => q.models.includes(model)) && QUALITY_LEVELS.find(q => q.models.includes(model))!.value === quality) {
        options.quality = quality;
      }

      // Generate
      const imgEl = await puter.ai.txt2img(prompt.trim(), options);
      const imageUrl = imgEl.src || imgEl.toString();

      const newItem: ImageItem = {
        id: crypto.randomUUID(),
        prompt: prompt.trim(),
        url: imageUrl,
        createdAt: new Date().toISOString(),
        model: model.split('/').pop() || model,
      };

      const updated = [newItem, ...items].slice(0, 30);
      setItems(updated);
      saveHistory(updated);
      setPrompt('');
      toast.success('تم توليد الصورة بنجاح!');
    } catch (err: any) {
      console.error('[image gen]', err);
      const msg = err?.message || String(err);
      if (msg.includes('insufficient') || msg.includes('402')) {
        toast.error('يحتاج هذا النموذج إلى رصيد Puter. سجّل دخولك في puter.com مجانًا أو استخدم نموذجًا آخر.');
      } else if (msg.includes('moderation') || msg.includes('bad_request')) {
        toast.error('تم رفض الطلب بسبب مرشح المحتوى. عدّل الوصف وحاول مجددًا.');
      } else if (msg.includes('authentication') || msg.includes('sign') || msg.includes('login')) {
        toast.info('تحتاج حساب Puter مجاني لتوليد الصور. سيتم فتح نافذة التسجيل الآن.');
        try { (window as any).puter.auth.signIn(); } catch {}
      } else {
        toast.error(msg || 'فشل توليد الصورة. حاول مرة أخرى.');
      }
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !loading) {
      e.preventDefault();
      generate();
    }
  }

  function download(url: string, filename?: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `nova-ai-${Date.now()}.png`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function copyPrompt(text: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success('تم نسخ الوصف'),
      () => toast.error('فشل النسخ')
    );
  }

  // Determine which quality levels are available for current model
  const availableQualities = QUALITY_LEVELS.filter(q => q.models.includes(model));

  return (
    <div className="flex overflow-hidden" style={{ height: '100dvh' }}>
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <header className="h-14 border-b border-border flex items-center px-4 md:px-6 glass sticky top-0 z-10">
          <div className="flex items-center gap-2 ml-10 md:ml-0">
            <ImageIcon className="w-4 h-4 text-primary-500" />
            <span className="font-medium">توليد الصور</span>
          </div>
        </header>

        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-primary-500 to-accent grid place-items-center mb-4 shadow-lg shadow-primary-500/30">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">
              أنشئ <span className="gradient-text">صورًا مذهلة</span> بالذكاء الاصطناعي
            </h1>
            <p className="text-white/60">
              مدعوم بـ{' '}
              <span className="text-accent font-semibold">Puter.js</span>
              {' '}— 10+ نماذجincluding GPT Image 2.5, Gemini, FLUX, Grok
            </p>
            {!puterReady && !puterError && (
              <p className="text-xs text-amber-400 mt-2 flex items-center justify-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> جاري تحميل خدمة التوليد...
              </p>
            )}
            {puterError && (
              <p className="text-xs text-red-400 mt-2 flex items-center justify-center gap-1">
                <AlertCircle className="w-3 h-3" /> {puterError}
              </p>
            )}
          </div>

          <div className="card mb-6">
            <textarea
              ref={textareaRef}
              rows={3}
              className="input mb-4 resize-none"
              placeholder="اكتب وصفًا للصورة التي تريدها..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={loading || !puterReady}
            />

            {/* Model selector */}
            <div className="mb-3">
              <div className="text-xs text-white/50 mb-2 flex items-center gap-1">
                <Zap className="w-3 h-3" /> النموذج
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setModel(m.id); setQuality('low'); }}
                    disabled={loading}
                    className={`px-2 py-2 rounded-xl text-xs border transition text-left ${
                      model === m.id
                        ? 'bg-primary-500 border-primary-500 text-white shadow-lg shadow-primary-500/20'
                        : 'bg-surface border-border text-white/70 hover:text-white hover:border-primary-500/50'
                    }`}
                  >
                    <div className="font-semibold truncate">{m.label}</div>
                    <div className="text-[10px] opacity-60 mt-0.5 truncate">{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Quality selector */}
            {availableQualities.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-white/50 mb-2 flex items-center gap-1">
                  <Globe className="w-3 h-3" /> الجودة
                </div>
                <div className="flex flex-wrap gap-2">
                  {availableQualities.map((q) => (
                    <button
                      key={q.value}
                      onClick={() => setQuality(q.value)}
                      disabled={loading}
                      className={`px-3 py-1.5 rounded-full text-xs border transition ${
                        quality === q.value
                          ? 'bg-primary-500 border-primary-500 text-white'
                          : 'bg-surface border-border text-white/70 hover:text-white hover:border-primary-500/50'
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Size selector */}
            <div className="mb-4">
              <div className="text-xs text-white/50 mb-2 flex items-center gap-1">
                <Camera className="w-3 h-3" /> الحجم
              </div>
              <div className="flex flex-wrap gap-2">
                {SIZES.map((sz) => (
                  <button
                    key={sz.value}
                    onClick={() => setSize(sz)}
                    disabled={loading}
                    className={`px-3 py-1.5 rounded-full text-xs border transition ${
                      size.value === sz.value
                        ? 'bg-primary-500 border-primary-500 text-white'
                        : 'bg-surface border-border text-white/70 hover:text-white hover:border-primary-500/50'
                    }`}
                  >
                    {sz.label} <span className="text-white/40 ml-1">{sz.aspect}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-white/40 hidden sm:block">
                Tip: press{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border">⌘</kbd>
                {' '}+{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border">Enter</kbd>
                {' '}to generate.
              </div>
              <button
                onClick={generate}
                disabled={loading || !prompt.trim() || !puterReady}
                className="btn-primary"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> جاري التوليد...</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> توليد</>
                )}
              </button>
            </div>
          </div>

          {items.length === 0 && !loading && (
            <div className="mb-8">
              <div className="text-xs text-white/50 mb-2 flex items-center gap-1">
                <Layers className="w-3 h-3" /> أفكار للوصف
              </div>
              <div className="flex flex-wrap gap-2">
                {PROMPT_IDEAS.map((idea, i) => (
                  <button
                    key={i}
                    onClick={() => { setPrompt(idea); textareaRef.current?.focus(); }}
                    className="px-3 py-1.5 rounded-full text-xs bg-surface border border-border text-white/70 hover:text-white hover:border-primary-500/50 transition max-w-md text-left truncate"
                    title={idea}
                  >
                    {idea}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              {[0, 1].map((i) => (
                <div key={i} className="rounded-xl overflow-hidden bg-surface border border-border aspect-square relative">
                  <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/5 via-white/10 to-white/5" />
                  <div className="absolute inset-0 grid place-items-center">
                    <div className="flex flex-col items-center gap-2 text-white/50">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span className="text-xs">{i === 0 ? 'جاري التوليد...' : 'قد يستغرق بضع ثوانٍ'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {items.length === 0 && !loading ? (
            <p className="text-center text-white/40 py-8">صورك ستظهر هنا بعد توليدها.</p>
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
                    src={item.url}
                    alt={item.prompt}
                    loading="lazy"
                    className="w-full aspect-square object-cover group-hover:scale-105 transition duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition" />
                  <div className="absolute inset-x-0 bottom-0 p-3 opacity-0 group-hover:opacity-100 transition">
                    <p className="text-xs text-white/80 line-clamp-2 mb-1">{item.prompt}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-white/50">{formatDate(item.createdAt)}</span>
                      <div className="flex gap-1">
                        <button onClick={(e) => { e.stopPropagation(); copyPrompt(item.prompt); }} className="btn-secondary text-xs py-1.5 px-2">
                          <Copy className="w-3 h-3" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); download(item.url); }} className="btn-secondary text-xs py-1.5 px-3">
                          <Download className="w-3 h-3" /> حفظ
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <AnimatePresence>
          {lightbox && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 grid place-items-center p-4"
              onClick={() => setLightbox(null)}
            >
              <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center">
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
                <img src={lightbox.url} alt={lightbox.prompt} className="max-h-[70vh] rounded-xl object-contain shadow-2xl" />
                <p className="text-sm text-white/80 max-w-2xl text-center">{lightbox.prompt}</p>
                <div className="flex gap-2">
                  <button onClick={() => copyPrompt(lightbox.prompt)} className="btn-secondary text-xs">
                    <Copy className="w-3 h-3" /> نسخ الوصف
                  </button>
                  <button onClick={() => download(lightbox.url)} className="btn-primary text-xs">
                    <Download className="w-3 h-3" /> تحميل
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
