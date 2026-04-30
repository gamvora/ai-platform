'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  User as UserIcon,
  Lock,
  Settings as SettingsIcon,
  Trash2,
  Upload,
  Check,
  X,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { useToast } from '@/components/Toast';

type Tab = 'profile' | 'password' | 'preferences' | 'danger';

interface Me {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  createdAt: string;
}

interface Prefs {
  theme?: 'dark' | 'light' | 'system';
  defaultImageSize?: string;
  saveHistory?: boolean;
  voiceReplies?: boolean;
  language?: string;
  botAvatarUrl?: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('profile');
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  /* -------- initial load -------- */
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!r.ok) {
          router.replace('/login?next=/settings');
          return;
        }
        const j = await r.json();
        setMe(j.user);
      } catch {
        router.replace('/login?next=/settings');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950 text-neutral-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!me) return null;

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'profile', label: 'Profile', icon: UserIcon },
    { id: 'password', label: 'Password', icon: Lock },
    { id: 'preferences', label: 'Preferences', icon: SettingsIcon },
    { id: 'danger', label: 'Danger zone', icon: Trash2 },
  ];

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-8">
          {/* Header */}
          <div className="mb-8 flex items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-semibold">Settings</h1>
              <p className="text-sm text-neutral-400">
                Manage your account, security, and preferences.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-[220px_1fr]">
            {/* Tab rail */}
            <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col">
              {tabs.map((t) => {
                const active = tab === t.id;
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
                      active
                        ? 'bg-neutral-800 text-white'
                        : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                    } ${t.id === 'danger' ? 'text-red-400/90' : ''}`}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </nav>

            {/* Panel */}
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="min-h-[400px]"
            >
              {tab === 'profile' && (
                <ProfilePanel me={me} onUpdate={setMe} toast={toast} />
              )}
              {tab === 'password' && <PasswordPanel toast={toast} />}
              {tab === 'preferences' && <PreferencesPanel toast={toast} />}
              {tab === 'danger' && <DangerPanel toast={toast} />}
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* =========================================================
 * Profile panel — name, email, avatar
 * ========================================================= */
function ProfilePanel({
  me,
  onUpdate,
  toast,
}: {
  me: Me;
  onUpdate: (m: Me) => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [name, setName] = useState(me.name);
  const [email, setEmail] = useState(me.email);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast.show('Name and email are required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed to save');
      onUpdate({ ...me, name: j.user.name, email: j.user.email });
      toast.show('Profile updated.', 'success');
    } catch (err: any) {
      toast.show(err.message || 'Failed to save.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.show('Avatar must be under 5 MB.', 'error');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/user/avatar', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Upload failed');
      onUpdate({ ...me, avatarUrl: j.avatarUrl });
      toast.show('Avatar updated.', 'success');
    } catch (err: any) {
      toast.show(err.message || 'Upload failed.', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    if (!confirm('Remove your avatar?')) return;
    try {
      const r = await fetch('/api/user/avatar', { method: 'DELETE' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to remove');
      }
      onUpdate({ ...me, avatarUrl: null });
      toast.show('Avatar removed.', 'success');
    } catch (err: any) {
      toast.show(err.message || 'Failed to remove avatar.', 'error');
    }
  }

  const initials = me.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <form onSubmit={saveProfile} className="space-y-6">
      <Section title="Avatar" subtitle="Shown in the sidebar and chat header.">
        <div className="flex items-center gap-5">
          <div className="relative h-20 w-20 overflow-hidden rounded-full bg-neutral-800 ring-1 ring-neutral-700">
            {me.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={me.avatarUrl}
                alt="Avatar"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-neutral-300">
                {initials || '?'}
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadAvatar(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              Upload
            </button>
            {me.avatarUrl && (
              <button
                type="button"
                onClick={removeAvatar}
                className="inline-flex items-center gap-2 rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
              >
                <X className="h-4 w-4" />
                Remove
              </button>
            )}
          </div>
        </div>
      </Section>

      <Section title="Account" subtitle="How we identify you inside Nova.">
        <Field label="Full name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className={inputCls}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </Field>
      </Section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Save changes
        </button>
      </div>
    </form>
  );
}

/* =========================================================
 * Password panel
 * ========================================================= */
function PasswordPanel({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) {
      toast.show('New password must be at least 8 characters.', 'error');
      return;
    }
    if (next !== confirm) {
      toast.show('Passwords do not match.', 'error');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/user/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Failed to update password');
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.show('Password updated.', 'success');
    } catch (err: any) {
      toast.show(err.message || 'Failed.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Section
        title="Change password"
        subtitle="You'll stay signed in on this device after changing your password."
      >
        <Field label="Current password">
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            className={inputCls}
          />
        </Field>
        <Field label="New password">
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            className={inputCls}
          />
          <p className="mt-1 text-xs text-neutral-500">
            Minimum 8 characters. Use a mix of letters, numbers, and symbols.
          </p>
        </Field>
        <Field label="Confirm new password">
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className={inputCls}
          />
        </Field>
      </Section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Lock className="h-4 w-4" />
          )}
          Update password
        </button>
      </div>
    </form>
  );
}

/* =========================================================
 * Preferences panel
 * ========================================================= */
function PreferencesPanel({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingBotAvatar, setUploadingBotAvatar] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/user/preferences', { cache: 'no-store' });
        const j = await r.json();
        if (r.ok) setPrefs(j.preferences);
      } catch {
        /* noop */
      }
    })();
  }, []);

  if (!prefs) {
    return (
      <div className="flex h-40 items-center justify-center text-neutral-500">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const BOT_AVATAR_PRESETS = [
    'https://api.dicebear.com/9.x/adventurer/svg?seed=Nova&backgroundType=gradientLinear',
    'https://api.dicebear.com/9.x/adventurer/svg?seed=Astra&backgroundType=gradientLinear',
    'https://api.dicebear.com/9.x/adventurer/svg?seed=Echo&backgroundType=gradientLinear',
    'https://api.dicebear.com/9.x/adventurer/svg?seed=Flux&backgroundType=gradientLinear',
    'https://api.dicebear.com/9.x/adventurer/svg?seed=Luna&backgroundType=gradientLinear',
    'https://api.dicebear.com/9.x/adventurer/svg?seed=Rin&backgroundType=gradientLinear',
    'https://api.dicebear.com/9.x/fun-emoji/svg?seed=Pixel&backgroundType=gradientLinear',
    'https://api.dicebear.com/9.x/fun-emoji/svg?seed=Comet&backgroundType=gradientLinear',
    'https://api.dicebear.com/9.x/fun-emoji/svg?seed=Rocket&backgroundType=gradientLinear',
    'https://api.dicebear.com/9.x/fun-emoji/svg?seed=NovaAI&backgroundType=gradientLinear',
    'https://api.dicebear.com/9.x/bottts/svg?seed=Neon&backgroundType=gradientLinear',
    'https://api.dicebear.com/9.x/bottts/svg?seed=Cyber&backgroundType=gradientLinear',
    'https://api.dicebear.com/9.x/bottts/svg?seed=Orbit&backgroundType=gradientLinear',
    'https://api.dicebear.com/9.x/bottts/svg?seed=Zenith&backgroundType=gradientLinear',
    'https://api.dicebear.com/9.x/micah/svg?seed=AnimeA&backgroundType=gradientLinear',
    'https://api.dicebear.com/9.x/micah/svg?seed=AnimeB&backgroundType=gradientLinear',
    'https://api.dicebear.com/9.x/micah/svg?seed=AnimeC&backgroundType=gradientLinear',
    'https://api.dicebear.com/9.x/micah/svg?seed=AnimeD&backgroundType=gradientLinear',
  ];

  function update<K extends keyof Prefs>(k: K, v: Prefs[K]) {
    setPrefs((p) => ({ ...(p || {}), [k]: v }));
  }

  async function uploadBotAvatar(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.show('Bot avatar must be under 5 MB.', 'error');
      return;
    }
    setUploadingBotAvatar(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Upload failed');
      update('botAvatarUrl', j.url);
      toast.show('Bot avatar uploaded.', 'success');
    } catch (err: any) {
      toast.show(err.message || 'Upload failed.', 'error');
    } finally {
      setUploadingBotAvatar(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed to save');
      setPrefs(j.preferences);
      toast.show('Preferences saved.', 'success');
    } catch (err: any) {
      toast.show(err.message || 'Failed.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Section
        title="Defaults"
        subtitle="Pre-fill image size and language used across Nova."
      >
        <Field label="Default image size">
          <select
            value={prefs.defaultImageSize || '1024x1024'}
            onChange={(e) => update('defaultImageSize', e.target.value)}
            className={inputCls}
          >
            <option value="512x512">512 × 512 (fast, square)</option>
            <option value="768x768">768 × 768 (balanced)</option>
            <option value="1024x1024">1024 × 1024 (default)</option>
            <option value="1024x1792">1024 × 1792 (portrait)</option>
            <option value="1792x1024">1792 × 1024 (landscape)</option>
          </select>
        </Field>

        <Field label="Language">
          <select
            value={prefs.language || 'en'}
            onChange={(e) => update('language', e.target.value)}
            className={inputCls}
          >
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="pt-BR">Português (Brasil)</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
          </select>
        </Field>
      </Section>

      <Section
        title="Bot avatar"
        subtitle="Choose animated-style avatars (Netflix-like) or upload your own."
      >
        <div className="flex items-center gap-3">
          <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-800">
            {prefs.botAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={prefs.botAvatarUrl}
                alt="Bot avatar preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
                No image
              </div>
            )}
            {uploadingBotAvatar && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              </div>
            )}
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200">
            <Upload className="h-4 w-4" />
            Upload bot avatar
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadBotAvatar(f);
                e.target.value = '';
              }}
            />
          </label>

          {prefs.botAvatarUrl && (
            <button
              type="button"
              onClick={() => update('botAvatarUrl', '')}
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
            >
              <X className="h-4 w-4" />
              Reset
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {BOT_AVATAR_PRESETS.map((url, i) => {
            const active = prefs.botAvatarUrl === url;
            return (
              <button
                key={i}
                type="button"
                onClick={() => update('botAvatarUrl', url)}
                className={`group relative overflow-hidden rounded-xl border transition-all duration-300 ${
                  active
                    ? 'border-primary-500 ring-2 ring-primary-500/40 scale-105'
                    : 'border-neutral-700 hover:border-neutral-500 hover:scale-105'
                }`}
                title={`Avatar ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Avatar ${i + 1}`}
                  className="h-16 w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Behavior" subtitle="Toggle optional features.">
        <Toggle
          label="Save chat and generation history"
          description="When off, new items are not persisted. Existing items remain."
          checked={!!prefs.saveHistory}
          onChange={(v) => update('saveHistory', v)}
        />
        <Toggle
          label="Voice replies (browser TTS)"
          description="Reads Nova's responses aloud using your browser's speech synth."
          checked={!!prefs.voiceReplies}
          onChange={(v) => update('voiceReplies', v)}
        />
      </Section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Save preferences
        </button>
      </div>
    </form>
  );
}

/* =========================================================
 * Danger zone
 * ========================================================= */
function DangerPanel({ toast }: { toast: ReturnType<typeof useToast> }) {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  async function onDelete(e: React.FormEvent) {
    e.preventDefault();
    if (confirmText !== 'DELETE') {
      toast.show('Type DELETE to confirm.', 'error');
      return;
    }
    if (!pw) {
      toast.show('Password is required.', 'error');
      return;
    }
    if (
      !confirm(
        'This permanently deletes your account, conversations, and generations. Continue?'
      )
    )
      return;

    setBusy(true);
    try {
      const r = await fetch('/api/user', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Failed to delete');
      toast.show('Account deleted. Goodbye.', 'success');
      router.replace('/');
    } catch (err: any) {
      toast.show(err.message || 'Failed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onDelete} className="space-y-6">
      <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-5">
        <h3 className="text-lg font-semibold text-red-300">Delete account</h3>
        <p className="mt-1 text-sm text-red-300/70">
          This permanently removes your profile, all conversations, and all
          generated images & videos. This action cannot be undone.
        </p>

        <div className="mt-5 space-y-4">
          <Field label="Password">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="current-password"
              className={inputCls}
            />
          </Field>
          <Field label="Type DELETE to confirm">
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className={inputCls}
            />
          </Field>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Permanently delete account
          </button>
        </div>
      </div>
    </form>
  );
}

/* =========================================================
 * Shared UI bits
 * ========================================================= */
const inputCls =
  'w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-neutral-600 focus:bg-neutral-900';

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
      <header className="mb-4">
        <h3 className="text-sm font-semibold text-neutral-100">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 text-xs text-neutral-400">{subtitle}</p>
        )}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-neutral-300">
        {label}
      </span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-neutral-100">{label}</div>
        {description && (
          <div className="mt-0.5 text-xs text-neutral-400">{description}</div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition ${
          checked ? 'bg-white' : 'bg-neutral-700'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-neutral-900 shadow transition ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
