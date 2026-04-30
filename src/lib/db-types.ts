/**
 * Shared DB types — safe to import from edge runtime.
 * Contains only type declarations (zero runtime code).
 */

/**
 * User preference knobs. All optional; unknown fields are preserved but
 * ignored by the client. Extend as needed — just remember to update the
 * default merge in the preferences API route.
 */
export interface UserPreferences {
  theme?: 'dark' | 'light' | 'system';
  defaultChatModel?: string;
  defaultImageModel?: string;
  /** Default image generation size (e.g. '1024x1024'). Free-form string. */
  defaultImageSize?: string;
  saveHistory?: boolean;
  voiceReplies?: boolean;
  language?: string;
  /** Custom assistant/bot avatar image URL shown in chat bubbles. */
  botAvatarUrl?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  avatarUrl?: string | null;
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
  images?: string[]; // data URLs or public URLs
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
