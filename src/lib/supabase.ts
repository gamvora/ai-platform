/**
 * Nova AI — Supabase Server Client
 *
 * Creates a privileged server-side Supabase client using the SERVICE ROLE key.
 * Never import this from client components — it has full DB access.
 *
 * Env vars required:
 *   SUPABASE_URL                = https://<project-ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   = <service_role JWT>
 *
 * `hasSupabase()` can be used to detect if credentials are configured.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;
let _warned = false;

export function hasSupabase(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function getSupabase(): SupabaseClient | null {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    if (!_warned) {
      console.warn(
        '[supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — ' +
          'falling back to local file store.'
      );
      _warned = true;
    }
    return null;
  }

  _client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: { schema: 'public' },
  });

  return _client;
}
