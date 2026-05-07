'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageSquare, Image as ImageIcon, Video, LayoutDashboard,
  Plus, Trash2, LogOut, Sparkles, Menu, X, Wand2, Users,
  Shirt, Maximize2, Scissors, Pencil, Settings,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/components/Toast';
import { cn, truncate, formatDate } from '@/lib/utils';

interface Conversation { id: string; title: string; updatedAt: string; }
interface User { id: string; email: string; name: string; }
interface SidebarProps {
  activeConversationId?: string;
  onSelectConversation?: (id: string) => void;
  onNewChat?: () => void;
  refreshKey?: number;
}

const navItems = [
  { href: '/chat',        label: 'الدردشة',       icon: MessageSquare },
  { href: '/image',       label: 'الصور',          icon: ImageIcon },
  { href: '/edit',        label: 'تعديل الصور',   icon: Wand2 },
  { href: '/face-swap',   label: 'تبديل الوجه',   icon: Users },
  { href: '/outfit-swap', label: 'تبديل الملابس', icon: Shirt },
  { href: '/upscale',     label: 'تحسين الجودة',  icon: Maximize2 },
  { href: '/remove-bg',   label: 'إزالة الخلفية', icon: Scissors },
  { href: '/sketch',      label: 'رسم ← فن',      icon: Pencil },
  { href: '/video',       label: 'الفيديو',        icon: Video },
  { href: '/dashboard',   label: 'لوحة التحكم',   icon: LayoutDashboard },
  { href: '/settings',    label: 'الإعدادات',      icon: Settings },
];

export default function Sidebar({
  activeConversationId, onSelectConversation, onNewChat, refreshKey,
}: SidebarProps) {
  const pathname = usePathname();
  const toast = useToast();
  const listRef = useRef<HTMLDivElement>(null);

  const [user, setUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [open, setOpen] = useState(false);

  /* ── data fetching ── */
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => setUser(d.user || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!pathname?.startsWith('/chat')) return;
    fetch('/api/conversations', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        const raw: any[] = Array.isArray(d.conversations) ? d.conversations : [];
        setConversations(
          raw
            .map((c) => ({ id: c.id ?? c._id ?? '', title: c.title ?? 'بدون عنوان', updatedAt: c.updatedAt ?? c.createdAt ?? new Date().toISOString() }))
            .filter((c) => !!c.id)
        );
      })
      .catch(() => {});
  }, [pathname, refreshKey]);

  /* ── actions ── */
  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('حذف هذه المحادثة؟')) return;
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setConversations((prev) => prev.filter((c) => c.id !== id));
      toast.success('تم حذف المحادثة');
      if (activeConversationId === id) onNewChat?.();
    } catch {
      toast.error('تعذّر حذف المحادثة');
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  function handleSelectConversation(id: string) {
    if (id) {
      onSelectConversation?.(id);
      setOpen(false); // close drawer on mobile after selection
    }
  }

  const isChat = pathname?.startsWith('/chat');

  /* ── inner content ── */
  const SidebarContent = () => (
    /*
     * Layout strategy (mobile & desktop):
     *   - outer wrapper: fixed height (100dvh) with flex-col
     *   - top section (brand + nav + new-chat btn): shrink-0
     *   - conversation list: flex-1 + overflow-y-auto  → fills remaining space
     *   - footer (user info): shrink-0 at the bottom
     */
    <div
      className="flex flex-col bg-surface border-r border-border"
      style={{ width: 288, height: '100%' }}
    >
      {/* ── Brand ── */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border shrink-0">
        <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent grid place-items-center shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold gradient-text">alaa ai</span>
        </Link>
        <button className="md:hidden btn-ghost p-2" onClick={() => setOpen(false)} aria-label="إغلاق">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── Navigation ── */}
      <div className="px-3 pt-3 shrink-0">
        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition min-h-[44px]',
                  active
                    ? 'bg-primary-500/10 text-primary-400 font-medium'
                    : 'text-white/70 hover:bg-surface-light hover:text-white active:bg-surface-light'
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ── Conversations (only on /chat) ── */}
      {isChat && (
        <>
          {/* New chat button */}
          <div className="px-3 pt-4 pb-1 shrink-0">
            <button
              onClick={() => { onNewChat?.(); setOpen(false); }}
              className="btn-secondary w-full justify-start text-sm"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>محادثة جديدة</span>
            </button>
          </div>

          {/* Section label */}
          <div className="px-4 pt-3 pb-1 shrink-0">
            <span className="text-[11px] uppercase tracking-wider text-white/35 font-medium">
              المحادثات الأخيرة
            </span>
          </div>

          {/* Scrollable list — flex-1 ensures it fills available height */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto overscroll-contain px-2 pb-2 space-y-0.5"
            style={{ minHeight: 0 }} /* critical: prevents flex child from overflowing */
          >
            {conversations.length === 0 ? (
              <p className="text-sm text-white/40 px-3 py-4 text-center">
                لا توجد محادثات بعد
              </p>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSelectConversation(c.id)}
                  className={cn(
                    'group w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition text-right min-h-[44px]',
                    activeConversationId === c.id
                      ? 'bg-primary-500/10 text-white border border-primary-500/20'
                      : 'text-white/70 hover:bg-surface-light hover:text-white active:bg-surface-light'
                  )}
                >
                  <MessageSquare className="w-4 h-4 shrink-0 opacity-50" />
                  <span className="flex-1 truncate text-left">{truncate(c.title, 26)}</span>
                  {/* Delete — always visible on mobile (touch), hover on desktop */}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => handleDelete(c.id, e)}
                    onKeyDown={(e) => e.key === 'Enter' && handleDelete(c.id, e as any)}
                    className="text-white/30 hover:text-rose-400 transition p-1 rounded opacity-100 md:opacity-0 md:group-hover:opacity-100"
                    aria-label="حذف المحادثة"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}

      {/* ── Spacer when not in /chat ── */}
      {!isChat && <div className="flex-1" />}

      {/* ── Footer / User info ── */}
      <div className="shrink-0 p-3 border-t border-border">
        {user ? (
          <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface-light transition">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-accent grid place-items-center text-sm font-bold shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs text-white/50 truncate">{user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="shrink-0 p-2 rounded-lg text-white/50 hover:text-rose-400 hover:bg-rose-500/10 transition min-h-[40px] min-w-[40px] flex items-center justify-center"
              title="تسجيل الخروج"
              aria-label="تسجيل الخروج"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="h-14" /> /* placeholder while loading */
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* ── Mobile hamburger ── */}
      <button
        className="md:hidden fixed top-3 left-3 z-30 p-2.5 rounded-xl glass border border-border/80 min-h-[44px] min-w-[44px]"
        onClick={() => setOpen(true)}
        aria-label="فتح القائمة"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex sticky top-0 shrink-0" style={{ height: '100dvh' }}>
        <SidebarContent />
      </aside>

      {/* ── Mobile drawer (full-screen height) ── */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/70 z-40 md:hidden"
              onClick={() => setOpen(false)}
            />
            {/* Drawer */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="fixed top-0 left-0 z-50 md:hidden"
              style={{
                height: '100dvh',
                /* fallback for browsers without dvh */
                maxHeight: '100vh',
              }}
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
