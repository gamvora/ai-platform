'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  MessageSquare,
  Image as ImageIcon,
  Video,
  LayoutDashboard,
  Plus,
  Trash2,
  LogOut,
  Sparkles,
  Menu,
  X,
  Wand2,
  Users,
  Shirt,
  Maximize2,
  Scissors,
  Pencil,
  Settings,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/components/Toast';
import { cn, truncate, formatDate } from '@/lib/utils';

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

interface User {
  id: string;
  email: string;
  name: string;
}

interface SidebarProps {
  activeConversationId?: string;
  onSelectConversation?: (id: string) => void;
  onNewChat?: () => void;
  refreshKey?: number;
}

export default function Sidebar({
  activeConversationId,
  onSelectConversation,
  onNewChat,
  refreshKey,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();

  const [user, setUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => setUser(d.user || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (pathname?.startsWith('/chat')) {
      fetch('/api/conversations', { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => {
          // Normalize: API may return {id} (new) or {_id} (legacy). Accept both,
          // and drop any entries that lack a usable identifier so we never
          // dispatch `onSelectConversation(undefined)`.
          const raw: any[] = Array.isArray(d.conversations) ? d.conversations : [];
          const normalized: Conversation[] = raw
            .map((c) => ({
              id: c.id ?? c._id ?? '',
              title: c.title ?? 'Untitled',
              updatedAt: c.updatedAt ?? c.createdAt ?? new Date().toISOString(),
            }))
            .filter((c) => !!c.id);
          setConversations(normalized);
        })
        .catch(() => {});
    }
  }, [pathname, refreshKey]);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setConversations((prev) => prev.filter((c) => c.id !== id));
      toast.success('Conversation deleted');
      if (activeConversationId === id) onNewChat?.();
    } catch {
      toast.error('Could not delete conversation');
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const navItems = [
    { href: '/chat', label: 'Chat', icon: MessageSquare },
    { href: '/image', label: 'Images', icon: ImageIcon },
    { href: '/edit', label: 'Edit', icon: Wand2 },
    { href: '/face-swap', label: 'Face swap', icon: Users },
    { href: '/outfit-swap', label: 'Outfit swap', icon: Shirt },
    { href: '/upscale', label: 'Upscale', icon: Maximize2 },
    { href: '/remove-bg', label: 'Remove BG', icon: Scissors },
    { href: '/sketch', label: 'Sketch → Art', icon: Pencil },
    { href: '/video', label: 'Video', icon: Video },
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  const content = (
    <div className="flex flex-col h-full w-72 bg-surface border-r border-border">
      {/* Brand */}
      <div className="px-4 py-4 flex items-center justify-between border-b border-border">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent grid place-items-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold gradient-text">Nova AI</span>
        </Link>
        <button
          className="md:hidden btn-ghost p-2"
          onClick={() => setOpen(false)}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Nav */}
      <div className="px-3 pt-3">
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition',
                  active
                    ? 'bg-primary-500/10 text-primary-500'
                    : 'text-white/70 hover:bg-surface-light hover:text-white'
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Conversations */}
      {pathname?.startsWith('/chat') && (
        <>
          <div className="px-3 mt-4">
            <button
              onClick={onNewChat}
              className="btn-secondary w-full justify-start text-sm"
            >
              <Plus className="w-4 h-4" /> New chat
            </button>
          </div>
          <div className="px-2 pt-4 pb-2 text-xs uppercase tracking-wider text-white/40">
            Recent
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
            {conversations.length === 0 && (
              <p className="text-sm text-white/40 px-2 py-3">
                No conversations yet
              </p>
            )}
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  if (c.id) onSelectConversation?.(c.id);
                }}
                className={cn(
                  'w-full group flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition text-left',
                  activeConversationId === c.id
                    ? 'bg-surface-light text-white'
                    : 'text-white/70 hover:bg-surface-light hover:text-white'
                )}
              >
                <MessageSquare className="w-4 h-4 shrink-0 opacity-60" />
                <span className="flex-1 truncate">{truncate(c.title, 26)}</span>
                <span
                  onClick={(e) => handleDelete(c.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-rose-400 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Footer user */}
      <div className="mt-auto p-3 border-t border-border">
        {user && (
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-light transition">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent grid place-items-center text-sm font-semibold">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs text-white/50 truncate">{user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-white/50 hover:text-rose-400 transition"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="md:hidden fixed top-3 left-3 z-30 p-2.5 rounded-xl glass border border-border/80"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Desktop */}
      <aside className="hidden md:flex h-screen sticky top-0">{content}</aside>

      {/* Mobile overlay */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-40 md:hidden"
              onClick={() => setOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween' }}
              className="fixed top-0 left-0 h-dvh max-h-dvh z-50 md:hidden pb-[env(safe-area-inset-bottom)]"
            >
              {content}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
