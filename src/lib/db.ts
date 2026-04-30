/**
 * Nova AI — Data Layer
 *
 * Dual-backend store with a unified public API. The same exported
 * functions are used by every API route — they don't need to know
 * whether the data lives in Supabase or on disk.
 *
 *   Primary backend : Supabase Postgres (when SUPABASE_URL +
 *                     SUPABASE_SERVICE_ROLE_KEY are set)
 *   Fallback backend: Local JSON files under ./.data (zero-config dev)
 *
 * Public exports (STABLE — don't change signatures):
 *   Types:   User, PublicUser, ChatMessage, Conversation,
 *            Generation, GenerationType
 *   Users:   createUser, findUserByEmail, findUserById, listUsers,
 *            toPublicUser
 *   Conv.:   listConversations, getConversation, upsertConversation,
 *            deleteConversation, createConversation
 *   Gen.:    listGenerations, addGeneration
 *   Stats:   getStats
 *   Misc:    newId
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { getSupabase, hasSupabase } from './supabase';

// ============================================================
// Types (public)
// ============================================================

/**
 * User preferences — persisted as JSON. All fields optional so new
 * keys can be added without a migration. Defaults live in the UI.
 */
export interface UserPreferences {
  /** UI theme. Only 'dark' currently implemented, kept for forward-compat. */
  theme?: 'dark' | 'light' | 'system';
  /** Default chat model id (e.g. 'blackboxai/blackbox-pro'). */
  defaultChatModel?: string;
  /** Default image model id. */
  defaultImageModel?: string;
  /** Default image generation size (e.g. '1024x1024'). */
  defaultImageSize?: string;
  /** If true, generation results are saved to the user's gallery. */
  saveHistory?: boolean;
  /** Enable browser-side TTS playback in chat. */
  voiceReplies?: boolean;
  /** Language code for chat system prompt (e.g. 'en', 'pt-BR'). */
  language?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  /** Public URL (e.g. /uploads/avatars/...) of the user's avatar image. */
  avatarUrl?: string | null;
  /** JSON-blob user preferences. See `UserPreferences`. */
  preferences?: UserPreferences | null;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  preferences?: UserPreferences | null;
  createdAt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[];
  createdAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export type GenerationType = 'image' | 'video' | 'edit';

export interface Generation {
  id: string;
  userId: string;
  type: GenerationType;
  prompt: string;
  url: string;
  createdAt: string;
}

export function newId() {
  return crypto.randomUUID();
}

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl ?? null,
    preferences: u.preferences ?? null,
    createdAt: u.createdAt,
  };
}

// ============================================================
// Row <-> Domain converters (Supabase)
// ============================================================
function rowToUser(r: any): User {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    passwordHash: r.password_hash,
    avatarUrl: r.avatar_url ?? null,
    preferences: (r.preferences as UserPreferences) ?? null,
    createdAt: r.created_at,
  };
}

function rowToConversation(r: any): Conversation {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    messages: Array.isArray(r.messages) ? r.messages : [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToGeneration(r: any): Generation {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type,
    prompt: r.prompt,
    url: r.url,
    createdAt: r.created_at,
  };
}

// ============================================================
// Supabase backend
// ============================================================
const SB = {
  // ---- Users ----
  async findUserByEmail(email: string): Promise<User | null> {
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb
      .from('users')
      .select('*')
      .ilike('email', email.trim())
      .maybeSingle();
    if (error) throw error;
    return data ? rowToUser(data) : null;
  },

  async findUserById(id: string): Promise<User | null> {
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToUser(data) : null;
  },

  async createUser(
    data: Omit<User, 'id' | 'createdAt'>
  ): Promise<User> {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase not available');
    const email = data.email.toLowerCase().trim();
    // Pre-check to produce a nicer error than a raw unique violation.
    const existing = await SB.findUserByEmail(email);
    if (existing) throw new Error('Email already registered');

    const { data: row, error } = await sb
      .from('users')
      .insert({
        email,
        name: data.name.trim(),
        password_hash: data.passwordHash,
      })
      .select('*')
      .single();
    if (error) throw error;
    return rowToUser(row);
  },

  async listUsers(): Promise<User[]> {
    const sb = getSupabase();
    if (!sb) return [];
    const { data, error } = await sb
      .from('users')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(rowToUser);
  },

  async updateUser(
    id: string,
    patch: Partial<Pick<User, 'name' | 'email' | 'avatarUrl' | 'preferences' | 'passwordHash'>>
  ): Promise<User | null> {
    const sb = getSupabase();
    if (!sb) return null;
    const row: Record<string, any> = {};
    if (patch.name !== undefined) row.name = patch.name.trim();
    if (patch.email !== undefined) row.email = patch.email.toLowerCase().trim();
    if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl;
    if (patch.preferences !== undefined) row.preferences = patch.preferences;
    if (patch.passwordHash !== undefined) row.password_hash = patch.passwordHash;
    if (Object.keys(row).length === 0) return SB.findUserById(id);
    const { data, error } = await sb
      .from('users')
      .update(row)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return data ? rowToUser(data) : null;
  },

  async deleteUser(id: string): Promise<boolean> {
    const sb = getSupabase();
    if (!sb) return false;
    // ON DELETE CASCADE on conversations/generations cleans those up.
    const { error, count } = await sb
      .from('users')
      .delete({ count: 'exact' })
      .eq('id', id);
    if (error) throw error;
    return (count ?? 0) > 0;
  },

  // ---- Conversations ----
  async listConversations(userId: string): Promise<Conversation[]> {
    const sb = getSupabase();
    if (!sb) return [];
    const { data, error } = await sb
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(rowToConversation);
  },

  async getConversation(
    userId: string,
    id: string
  ): Promise<Conversation | null> {
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToConversation(data) : null;
  },

  async upsertConversation(c: Conversation): Promise<Conversation> {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase not available');
    const { data, error } = await sb
      .from('conversations')
      .upsert({
        id: c.id,
        user_id: c.userId,
        title: c.title,
        messages: c.messages,
        created_at: c.createdAt,
        updated_at: c.updatedAt,
      })
      .select('*')
      .single();
    if (error) throw error;
    return rowToConversation(data);
  },

  async deleteConversation(userId: string, id: string): Promise<boolean> {
    const sb = getSupabase();
    if (!sb) return false;
    const { error, count } = await sb
      .from('conversations')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('id', id);
    if (error) throw error;
    return (count ?? 0) > 0;
  },

  // ---- Generations ----
  async listGenerations(
    userId: string,
    type?: GenerationType
  ): Promise<Generation[]> {
    const sb = getSupabase();
    if (!sb) return [];
    let q = sb
      .from('generations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (type) q = q.eq('type', type);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(rowToGeneration);
  },

  async addGeneration(g: Generation): Promise<Generation> {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase not available');
    const { data, error } = await sb
      .from('generations')
      .insert({
        id: g.id,
        user_id: g.userId,
        type: g.type,
        prompt: g.prompt,
        url: g.url,
        created_at: g.createdAt,
      })
      .select('*')
      .single();
    if (error) throw error;
    return rowToGeneration(data);
  },

  // ---- Stats ----
  async getStats(userId: string) {
    const sb = getSupabase();
    if (!sb) return { conversations: 0, images: 0, videos: 0, edits: 0 };
    const [convRes, imgRes, vidRes, editRes] = await Promise.all([
      sb
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
      sb
        .from('generations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('type', 'image'),
      sb
        .from('generations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('type', 'video'),
      sb
        .from('generations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('type', 'edit'),
    ]);
    return {
      conversations: convRes.count ?? 0,
      images: imgRes.count ?? 0,
      videos: vidRes.count ?? 0,
      edits: editRes.count ?? 0,
    };
  },
};

// ============================================================
// File-store backend (fallback — kept from original impl)
// ============================================================
const DATA_DIR = path.join(process.cwd(), '.data');
const CONV_DIR = path.join(DATA_DIR, 'conversations');
const GEN_DIR = path.join(DATA_DIR, 'generations');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

const locks = new Map<string, Promise<void>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  locks.set(
    key,
    prev.then(() => next)
  );
  try {
    await prev;
    return await fn();
  } finally {
    release();
    if (locks.get(key) === next) locks.delete(key);
  }
}

async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(CONV_DIR, { recursive: true });
  await fs.mkdir(GEN_DIR, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const buf = await fs.readFile(file, 'utf8');
    return JSON.parse(buf) as T;
  } catch (err: any) {
    if (err?.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJsonAtomic(file: string, data: unknown) {
  await ensureDirs();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

function sanitize(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}
const convFile = (u: string) => path.join(CONV_DIR, `${sanitize(u)}.json`);
const genFile = (u: string) => path.join(GEN_DIR, `${sanitize(u)}.json`);

const FS = {
  async listUsers(): Promise<User[]> {
    return readJson<User[]>(USERS_FILE, []);
  },
  async findUserByEmail(email: string): Promise<User | null> {
    const users = await FS.listUsers();
    const lower = email.toLowerCase().trim();
    return users.find((u) => u.email.toLowerCase() === lower) ?? null;
  },
  async findUserById(id: string): Promise<User | null> {
    const users = await FS.listUsers();
    return users.find((u) => u.id === id) ?? null;
  },
  async createUser(data: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    return withLock('users', async () => {
      const users = await FS.listUsers();
      if (
        users.some(
          (u) => u.email.toLowerCase() === data.email.toLowerCase().trim()
        )
      ) {
        throw new Error('Email already registered');
      }
      const user: User = {
        id: newId(),
        email: data.email.toLowerCase().trim(),
        name: data.name.trim(),
        passwordHash: data.passwordHash,
        avatarUrl: data.avatarUrl ?? null,
        preferences: data.preferences ?? null,
        createdAt: new Date().toISOString(),
      };
      users.push(user);
      await writeJsonAtomic(USERS_FILE, users);
      return user;
    });
  },

  async updateUser(
    id: string,
    patch: Partial<Pick<User, 'name' | 'email' | 'avatarUrl' | 'preferences' | 'passwordHash'>>
  ): Promise<User | null> {
    return withLock('users', async () => {
      const users = await FS.listUsers();
      const idx = users.findIndex((u) => u.id === id);
      if (idx < 0) return null;
      // If email is changing, guard uniqueness (case-insensitive, excluding self).
      if (patch.email !== undefined) {
        const newEmail = patch.email.toLowerCase().trim();
        if (
          users.some(
            (u, i) => i !== idx && u.email.toLowerCase() === newEmail
          )
        ) {
          throw new Error('Email already registered');
        }
      }
      const next: User = {
        ...users[idx],
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.email !== undefined
          ? { email: patch.email.toLowerCase().trim() }
          : {}),
        ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
        ...(patch.preferences !== undefined
          ? { preferences: patch.preferences }
          : {}),
        ...(patch.passwordHash !== undefined
          ? { passwordHash: patch.passwordHash }
          : {}),
      };
      users[idx] = next;
      await writeJsonAtomic(USERS_FILE, users);
      return next;
    });
  },

  async deleteUser(id: string): Promise<boolean> {
    return withLock('users', async () => {
      const users = await FS.listUsers();
      const next = users.filter((u) => u.id !== id);
      const changed = next.length !== users.length;
      if (!changed) return false;
      await writeJsonAtomic(USERS_FILE, next);
      // Also wipe this user's conversation + generation data.
      try {
        await fs.rm(convFile(id), { force: true });
        await fs.rm(genFile(id), { force: true });
      } catch {
        /* ignore */
      }
      return true;
    });
  },

  async listConversations(userId: string): Promise<Conversation[]> {
    const items = await readJson<Conversation[]>(convFile(userId), []);
    return items.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async getConversation(userId: string, id: string) {
    const items = await readJson<Conversation[]>(convFile(userId), []);
    return items.find((c) => c.id === id) ?? null;
  },
  async upsertConversation(conv: Conversation): Promise<Conversation> {
    return withLock(`conv:${conv.userId}`, async () => {
      const file = convFile(conv.userId);
      const items = await readJson<Conversation[]>(file, []);
      const idx = items.findIndex((c) => c.id === conv.id);
      if (idx >= 0) items[idx] = conv;
      else items.push(conv);
      await writeJsonAtomic(file, items);
      return conv;
    });
  },
  async deleteConversation(userId: string, id: string): Promise<boolean> {
    return withLock(`conv:${userId}`, async () => {
      const file = convFile(userId);
      const items = await readJson<Conversation[]>(file, []);
      const next = items.filter((c) => c.id !== id);
      const changed = next.length !== items.length;
      if (changed) await writeJsonAtomic(file, next);
      return changed;
    });
  },

  async listGenerations(userId: string, type?: GenerationType) {
    const items = await readJson<Generation[]>(genFile(userId), []);
    const filtered = type ? items.filter((g) => g.type === type) : items;
    return filtered
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async addGeneration(gen: Generation): Promise<Generation> {
    return withLock(`gen:${gen.userId}`, async () => {
      const file = genFile(gen.userId);
      const items = await readJson<Generation[]>(file, []);
      items.unshift(gen);
      await writeJsonAtomic(file, items);
      return gen;
    });
  },

  async getStats(userId: string) {
    const [conv, gen] = await Promise.all([
      readJson<Conversation[]>(convFile(userId), []),
      readJson<Generation[]>(genFile(userId), []),
    ]);
    return {
      conversations: conv.length,
      images: gen.filter((g) => g.type === 'image').length,
      videos: gen.filter((g) => g.type === 'video').length,
      edits: gen.filter((g) => g.type === 'edit').length,
    };
  },
};

// ============================================================
// Public API — dispatches to Supabase or File store.
// Signatures are IDENTICAL to the original implementation.
//
// Resilience strategy:
//   - Prefer Supabase when configured (`hasSupabase()`).
//   - If a Supabase call fails because the schema hasn't been applied
//     yet (PGRST205 / "table not found" / "schema cache"), silently
//     fall back to the file store AND remember this so subsequent
//     calls skip Supabase until the server restarts.
//   - This makes the app "just work" even before the one-time
//     `supabase/schema.sql` has been executed, while still using the
//     real DB the moment the tables exist.
// ============================================================

// Sticky flag: once Supabase has proven unusable (missing schema),
// remain in fallback mode for the rest of this process.
let SB_DISABLED_REASON: string | null = null;

function useSB() {
  return hasSupabase() && !SB_DISABLED_REASON;
}

function isSchemaMissingError(err: any): boolean {
  if (!err) return false;
  const code = err.code || err?.cause?.code;
  if (code === 'PGRST205' || code === 'PGRST302' || code === '42P01') return true;
  const msg = String(err.message || err).toLowerCase();
  return (
    msg.includes('schema cache') ||
    msg.includes('could not find the table') ||
    msg.includes('relation') && msg.includes('does not exist')
  );
}

async function trySB<T>(
  sbFn: () => Promise<T>,
  fsFn: () => Promise<T>
): Promise<T> {
  if (!useSB()) return fsFn();
  try {
    return await sbFn();
  } catch (err: any) {
    if (isSchemaMissingError(err)) {
      if (!SB_DISABLED_REASON) {
        SB_DISABLED_REASON = err.message || 'schema missing';
        console.warn(
          '[db] Supabase schema not found — falling back to local file store.\n' +
            '     Run supabase/schema.sql in the SQL editor to enable Supabase:\n' +
            '     https://supabase.com/dashboard/project/_/sql/new'
        );
      }
      return fsFn();
    }
    throw err;
  }
}

// ---- Users ----
export async function listUsers(): Promise<User[]> {
  return trySB(() => SB.listUsers(), () => FS.listUsers());
}

export async function findUserByEmail(email: string): Promise<User | null> {
  return trySB(
    () => SB.findUserByEmail(email),
    () => FS.findUserByEmail(email)
  );
}

export async function findUserById(id: string): Promise<User | null> {
  return trySB(() => SB.findUserById(id), () => FS.findUserById(id));
}

export async function createUser(
  data: Omit<User, 'id' | 'createdAt'>
): Promise<User> {
  return trySB(() => SB.createUser(data), () => FS.createUser(data));
}

/**
 * Update mutable user fields. `passwordHash` is handled here too; callers
 * must compute the bcrypt hash before calling.
 * Returns the updated user, or `null` if the id doesn't exist.
 */
export async function updateUser(
  id: string,
  patch: Partial<
    Pick<User, 'name' | 'email' | 'avatarUrl' | 'preferences' | 'passwordHash'>
  >
): Promise<User | null> {
  return trySB(
    () => SB.updateUser(id, patch),
    () => FS.updateUser(id, patch)
  );
}

/**
 * Permanently delete a user and cascade-delete their conversations and
 * generations. Returns true iff a user row was removed.
 */
export async function deleteUser(id: string): Promise<boolean> {
  return trySB(() => SB.deleteUser(id), () => FS.deleteUser(id));
}

// ---- Conversations ----
export async function listConversations(
  userId: string
): Promise<Conversation[]> {
  return trySB(
    () => SB.listConversations(userId),
    () => FS.listConversations(userId)
  );
}

export async function getConversation(
  userId: string,
  id: string
): Promise<Conversation | null> {
  return trySB(
    () => SB.getConversation(userId, id),
    () => FS.getConversation(userId, id)
  );
}

export async function upsertConversation(
  conv: Conversation
): Promise<Conversation> {
  return trySB(
    () => SB.upsertConversation(conv),
    () => FS.upsertConversation(conv)
  );
}

export async function deleteConversation(
  userId: string,
  id: string
): Promise<boolean> {
  return trySB(
    () => SB.deleteConversation(userId, id),
    () => FS.deleteConversation(userId, id)
  );
}

export async function createConversation(
  userId: string,
  title: string
): Promise<Conversation> {
  const now = new Date().toISOString();
  const conv: Conversation = {
    id: newId(),
    userId,
    title: title.trim().slice(0, 80) || 'New chat',
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  return upsertConversation(conv);
}

// ---- Generations ----
export async function listGenerations(
  userId: string,
  type?: GenerationType
): Promise<Generation[]> {
  return trySB(
    () => SB.listGenerations(userId, type),
    () => FS.listGenerations(userId, type)
  );
}

export async function addGeneration(gen: Generation): Promise<Generation> {
  return trySB(() => SB.addGeneration(gen), () => FS.addGeneration(gen));
}

// ---- Stats ----
export async function getStats(userId: string) {
  return trySB(() => SB.getStats(userId), () => FS.getStats(userId));
}
