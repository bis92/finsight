import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server-client'
import type { Profile } from '@/types'
import type { ProfileRow } from '@/types/database'

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    plan: row.plan,
    polarSubscriptionId: row.polar_subscription_id,
    polarCustomerId: row.polar_customer_id,
  }
}

export async function getProfile(userId: string): Promise<Profile> {
  const client = await createSupabaseServerClient()
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }
  if (!data) {
    return {
      id: userId,
      plan: 'free',
      polarSubscriptionId: null,
      polarCustomerId: null,
    }
  }

  return toProfile(data)
}
