import 'server-only'

import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/env'
import type { Database } from '@/types/database'

/** Creates the default user-scoped client. The session cookie keeps RLS enforced. */
export async function createSupabaseServerClient(): Promise<
  SupabaseClient<Database>
> {
  const cookieStore = await cookies()

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // Server Components cannot write cookies. Middleware refreshes sessions.
        }
      },
    },
  })
}
