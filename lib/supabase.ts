// Supabase クライアント (server only)
// アーカイブ用の Postgres と Storage に service_role key で接続する。
// service_role は管理者権限なので絶対に client component に流さない。

import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
export const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET ?? 'events-archive';

let _client: SupabaseClient | null = null;

/**
 * service_role key を持った server-only クライアント。
 * 環境変数が未設定の場合は null を返し、 呼び出し側で graceful skip する。
 */
export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  if (_client) return _client;
  _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export function isSupabaseEnabled(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}
