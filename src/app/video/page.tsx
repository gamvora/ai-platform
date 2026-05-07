'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { useToast } from '@/components/Toast';
import { Video, Loader2, Download, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDate } from '@/lib/utils';

interface VideoItem {
  id: string;
  prompt: string;
  url: string;
  createdAt: string;
  model?: string;
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
    if (!prompt.trim()) { toast.info('Describe the video you want'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      if (data.video) setItems((prev) => [data.video, ...prev]);
      setPrompt('');
      toast.success('Video generated!');
    } catch (err: any) {
      toast.error(err?.message || 'Video generation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex overflow-hidden" style={{ height: '100dvh' }}>
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
              Powered by Pollinations AI — completely free, no limits.
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
              <p className="text-xs text-white/40">
                Video generation may take 30–90 seconds. Please be patient.
              </p>
              <button
                onClick={generate}
                disabled={loading || !prompt.trim()}
                className="btn-primary shrink-0"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Rendering…</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> Generate</>
                )}
              </button>
            </div>
          </div>

          {loading && (
            <div className="card flex flex-col items-center gap-4 py-12 mb-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
              <p className="text-white/60 text-sm">Generating your video…</p>
              <p className="text-white/40 text-xs">This may take up to 2 minutes</p>
            </div>
          )}

          {items.length === 0 && !loading ? (
            <p className="text-center text-white/40 py-8">Your generated videos will appear here.</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {items.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl overflow-hidden bg-surface border border-border"
                >
                  {item.url.match(/\.(mp4|webm)$/i) ? (
                    <video
                      src={item.url}
                      controls
                      preload="metadata"
                      className="w-full aspect-video bg-black"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.url}
                      alt={item.prompt}
                      className="w-full aspect-video object-cover bg-black"
                    />
                  )}
                  <div className="p-3">
                    <p className="text-sm text-white/80 line-clamp-2 mb-1">{item.prompt}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/50">{formatDate(item.createdAt)}</span>
                      <a
                        href={item.url}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary text-xs py-1.5 px-3"
                      >
                        <Download className="w-3 h-3" /> Download
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
