'use client'

import { useEffect } from 'react'

import { captureEvent, identifyUser, resetUser } from '@/lib/analytics/client'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client'

export function PostHogUserSync(): null {
  useEffect(() => {
    const supabase = createSupabaseBrowserClient()

    const identify = (user: {
      id: string
      email?: string | null
      app_metadata?: { provider?: string }
      created_at?: string
    }) => {
      identifyUser(user.id, {
        email: user.email ?? undefined,
        auth_provider: user.app_metadata?.provider,
        signup_at: user.created_at,
      })
    }

    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) identify(data.user)
    })

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        identify(session.user)
        captureEvent(ANALYTICS_EVENTS.signedIn, { auth_provider: session.user.app_metadata?.provider })
      }
      if (event === 'SIGNED_OUT') {
        resetUser()
      }
    })

    return () => data.subscription.unsubscribe()
  }, [])

  return null
}
