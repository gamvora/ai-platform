'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  MessageSquare,
  Image as ImageIcon,
  Video,
  Wand2,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface GalleryItem {
  id: string;
  prompt: string;
  url: string;
  createdAt: string;
  kind: 'image' | 'edit' | 'video';
}

interface Stats {
  conversations: number;
  images: number;
  videos: number;
  edits: number;
  name?: string;
  recent: GalleryItem[];
}

function onImgError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (img.dataset.proxied) return;
  img.dataset.proxied = '1';
  img.src = `/api/img-proxy?src=${encodeURIComponent(img.src)}`;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    conversations: 0,
    images: 0,
    videos: 0,
    edits: 0,
    recent: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [me, convs, imgs, vids, edits] = await Promise.all([
          fetch('/api/auth/me').then((r) => r.json()),
          fetch('/api/conversations').then((r) => r.json()),
          fetch('/api/image').then((r) => r.json()),
          fetch('/api/video').then((r) => r.json()),
          fetch('/api/edit').then((r) => r.json()).catch(() => ({ images: [] })),
        ]);

        const imgItems: GalleryItem[] = (imgs?.images || []).map((i: any) => ({
          ...i,
          kind: 'image',
        }));
        const editItems: GalleryItem[] = (edits?.images || []).map((i: any) => ({
          ...i,
          kind: 'edit',
        }));
        const vidItems: GalleryItem[] = (vids?.videos || []).map((v: any) => ({
          ...v,
          kind: 'video',
        }));

        const recent = [...imgItems, ...editItems, ...vidItems]
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
          .slice(0, 8);

        setStats({
          name: me?.user?.name,
          conversations: convs?.conversations?.length || 0,
          images: imgItems.length,
          videos: vidItems.length,
          edits: editItems.length,
          recent,
        });
      } catch {
        // keep defaults
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cards = [
    {
      label: 'Conversations',
      value: stats.conversations,
      icon: MessageSquare,
      href: '/chat',
      color: 'from-violet-500 to-fuchsia-500',
    },
    {
      label: 'Images generated',
      value: stats.images,
      icon: ImageIcon,
      href: '/image',
      color: 'from-cyan-500 to-blue-500',
    },
    {
      label: 'Image edits',
      value: stats.edits,
      icon: Wand2,
      href: '/edit',
      color: 'from-amber-500 to-orange-500',
    },
    {
      label: 'Videos generated',
      value: stats.videos,
      icon: Video,
      href: '/video',
      color: 'from-pink-500 to-rose-500',
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <header className="h-14 border-b border-border flex items-center px-3 sm:px-4 md:px-6 glass sticky top-0 z-10">
          <div className="flex items-center gap-2 ml-12 md:ml-0">
            <LayoutDashboard className="w-4 h-4 text-primary-500" />
            <span className="font-medium">Dashboard</span>
          </div>
        </header>

        <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 py-6 sm:py-8">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h1 className="text-3xl md:text-4xl font-bold mb-2">
              {stats.name
                ? `Welcome back, ${stats.name.split(' ')[0]} 👋`
                : 'Welcome 👋'}
            </h1>
            <p className="text-white/60">
              Here&apos;s a quick overview of your creative activity.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8 sm:mb-10">
            {cards.map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Link
                  href={c.href}
                  className="card group hover:border-primary-500/50 transition-all block"
                >
                  <div
                    className={`w-10 h-10 rounded-lg bg-gradient-to-br ${c.color} grid place-items-center mb-3`}
                  >
                    <c.icon className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-white/60 text-sm mb-1">{c.label}</p>
                  <div className="flex items-end justify-between">
                    <span className="text-2xl sm:text-3xl font-bold">{c.value}</span>
                    <ArrowRight className="w-4 h-4 opacity-50 group-hover:translate-x-1 transition" />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>

          {/* Recent gallery */}
          <div className="card mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary-500" /> Recent creations
              </h2>
              <Link
                href="/image"
                className="text-xs text-white/60 hover:text-white transition flex items-center gap-1"
              >
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-lg bg-white/5 animate-pulse"
                  />
                ))}
              </div>
            ) : stats.recent.length === 0 ? (
              <div className="text-center py-12 text-white/40 text-sm">
                No creations yet. Start with a{' '}
                <Link
                  href="/image"
                  className="text-primary-400 hover:text-primary-300 underline"
                >
                  new image
                </Link>{' '}
                or{' '}
                <Link
                  href="/chat"
                  className="text-primary-400 hover:text-primary-300 underline"
                >
                  chat
                </Link>
                .
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
                {stats.recent.map((item) => (
                  <Link
                    key={item.id + item.kind}
                    href={
                      item.kind === 'video'
                        ? '/video'
                        : item.kind === 'edit'
                        ? '/edit'
                        : '/image'
                    }
                    className="group relative aspect-square rounded-lg overflow-hidden bg-black/40 border border-border hover:border-primary-500/50 transition"
                  >
                    {item.kind === 'video' && item.url.endsWith('.mp4') ? (
                      <video
                        src={item.url}
                        muted
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.url}
                        alt={item.prompt}
                        loading="lazy"
                        onError={onImgError}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                    )}
                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition">
                      <p className="text-[10px] text-white/90 line-clamp-2">
                        {item.prompt}
                      </p>
                    </div>
                    <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/60 text-[9px] uppercase tracking-wider text-white/80">
                      {item.kind}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold mb-3">Quick start</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              <Link href="/chat" className="btn-secondary justify-start">
                <MessageSquare className="w-4 h-4" /> Start chatting
              </Link>
              <Link href="/image" className="btn-secondary justify-start">
                <ImageIcon className="w-4 h-4" /> Generate image
              </Link>
              <Link href="/edit" className="btn-secondary justify-start">
                <Wand2 className="w-4 h-4" /> Edit image
              </Link>
              <Link href="/video" className="btn-secondary justify-start">
                <Video className="w-4 h-4" /> Generate video
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
