import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { getSupabaseServiceRoleKey, getSupabaseUrl } from '@/lib/env'
import type { Database } from '@/types/database'

// 오직 Polar 웹훅 plan 갱신 전용. 유저 데이터 접근에 사용 금지.
export function createSupabaseServiceRoleClient(): SupabaseClient<Database> {
  return createClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
