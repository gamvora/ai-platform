'use client';

import { useEffect, useState, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import { useToast } from '@/components/Toast';
import { Video, Loader2, Download, Sparkles, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDate } from '@/lib/utils';

interface VideoItem {
  id: string;
  prompt: string;
  url: string;
  createdAt: string;
  kind?: 'video' | 'frames';
  frames?: string[];
}

/** Frame slideshow player (client-side, pure CSS crossfade) */
function FrameSlideshow({ frames, fps = 3 }: { frames: string[]; fps?: number }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (frames.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % frames.length), 1000 / fps);
    return () => clearInterval(t);
  }, [frames, fps]);

  return (
    <div className="relative w-full aspect-video bg-black overflow-hidden">
      {frames.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt={`frame ${i + 1}`}
          loading="lazy"
          className={
            'absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ' +
            (i === idx ? 'opacity-100' : 'opacity-0')
          }
        />
      ))}
      <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-black/60 text-[10px] uppercase tracking-wider text-white/80">
        Frame {idx + 1} / {frames.length}
      </div>
    </div>
  );
}

export default function VideoPage() {
  const toast = useToast();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<VideoItem[]>([]);

  useEffect(() => {
    fetch('/api/video')
      .then((r) => r.json())
      .then((d) => setItems(d.videos || []))
      .catch(() => {});
  }, []);

  async function generate() {
    if (!prompt.trim()) {
      toast.info('Describe the video you want');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      const newItem: VideoItem = {
        ...data.video,
        kind: data.kind,
        frames: data.frames,
      };
      setItems((prev) => [newItem, ...prev]);
      setPrompt('');

      if (data.kind === 'frames') {
        toast.info(data.notice || 'Frame slideshow generated (video fallback)');
      } else {
        toast.success('Video generated!');
      }
    } catch (err: any) {
      toast.error(err.message || 'Could not generate video');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <header className="h-14 border-b border-border flex items-center px-4 md:px-6 glass sticky top-0 z-10">
          <div className="flex items-center gap-2 ml-10 md:ml-0">
            <Video className="w-4 h-4 text-primary-500" />
            <span className="font-medium">Video Generation</span>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 grid place-items-center mb-4">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">
              Generate <span className="gradient-text">cinematic videos</span>
            </h1>
            <p className="text-white/60">
              Describe a scene and let AI bring it to life.
            </p>
          </div>

          <div className="card mb-8">
            <textarea
              rows={3}
              className="input mb-4 resize-none"
              placeholder="A drone flying low over a neon-lit Tokyo street at night, rain reflections, cinematic"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={loading}
            />
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-white/40 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Video generation may take longer. If the upstream paid
                  provider is at capacity, we&apos;ll show a free frame
                  slideshow preview instead.
                </span>
              </div>
              <button
                onClick={generate}
                disabled={loading}
                className="btn-primary shrink-0"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Rendering…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Generate
                  </>
                )}
              </button>
            </div>
          </div>

          {items.length === 0 ? (
            <p className="text-center text-white/40 py-8">
              Your generated videos will appear here.
            </p>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {items.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl overflow-hidden bg-surface border border-border"
                >
                  {item.kind === 'frames' && item.frames?.length ? (
                    <FrameSlideshow frames={item.frames} />
                  ) : (
                    <video
                      src={item.url}
                      controls
                      preload="metadata"
                      className="w-full aspect-video bg-black"
                    />
                  )}
                  <div className="p-3">
                    <p className="text-sm text-white/80 line-clamp-2 mb-2">
                      {item.prompt}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/50">
                        {formatDate(item.createdAt)}
                        {item.kind === 'frames' && (
                          <span className="ml-2 text-amber-400/80">
                            · slideshow
                          </span>
                        )}
                      </span>
                      <a
                        href={item.url}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary text-xs py-1.5 px-3"
                      >
                        <Download className="w-3 h-3" />{' '}
                        {item.kind === 'frames' ? 'Frame' : 'Download'}
                      </a>
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
