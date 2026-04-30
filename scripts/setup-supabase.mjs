#!/usr/bin/env node
/**
 * Nova AI — Supabase schema setup
 *
 * Reads `supabase/schema.sql` and runs it against the project using the
 * Supabase service_role key. Idempotent.
 *
 * Strategy:
 *   1. Try PostgREST RPC `exec_sql(sql text)` if the user has created it.
 *   2. Otherwise, POST to the Supabase SQL REST endpoint used by the dashboard
 *      (https://<ref>.supabase.co/rest/v1/rpc/...) — which is not exposed,
 *      so we gracefully fall back to printing instructions for manually
 *      pasting the SQL into the SQL Editor.
 *
 * Usage:  node scripts/setup-supabase.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('.', import.meta.url).pathname, '..');

// Load .env.local
async function loadEnv() {
  try {
    const raw = await fs.readFile(path.join(root, '.env.local'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      if (!process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* ignore */
  }
}

async function main() {
  await loadEnv();

  const URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!URL || !KEY) {
    console.error(
      '❌ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env.local'
    );
    process.exit(1);
  }

  const sqlPath = path.join(root, 'supabase', 'schema.sql');
  const sql = await fs.readFile(sqlPath, 'utf8');
  console.log(`📄 Loaded schema (${sql.length} chars) from ${sqlPath}`);

  console.log(`🔌 Trying exec_sql RPC on ${URL} ...`);
  const res = await fetch(`${URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify({ sql }),
  }).catch((e) => ({ ok: false, status: 0, statusText: e.message }));

  if (res && res.ok) {
    console.log('✅ Schema applied via exec_sql RPC');
    return;
  }

  console.warn(
    `⚠️  exec_sql RPC not available (${res?.status ?? '?'} ${
      res?.statusText ?? ''
    }).`
  );
  console.log('');
  console.log('👉  Please create the schema manually (one-time step):');
  console.log('    1. Open https://supabase.com/dashboard → your project');
  console.log('    2. Go to SQL Editor → New query');
  console.log(`    3. Paste the contents of supabase/schema.sql and Run`);
  console.log('');
  console.log(
    '    (After this, the Nova AI app will use Supabase as its real database.)'
  );
}

main().catch((err) => {
  console.error('❌ setup-supabase failed:', err);
  process.exit(1);
});
