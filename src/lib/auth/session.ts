import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server-client'

/** Returns the user authenticated by the request cookie, preserving RLS context. */
export async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    return null
  }

  return data.user.id
}
