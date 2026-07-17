'use client'

import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ApiError, apiClient } from '@/lib/apiClient'
import type { DataSource } from '@/lib/env'

type StubLoginResponse = { redirectTo: string }

type OAuthProvider = 'kakao' | 'google'

export function LoginClient({ dataSource }: { dataSource: DataSource }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const login = async (provider: OAuthProvider) => {
    setPending(true)
    setError(null)
    try {
      if (dataSource === 'mock') {
        const result = await apiClient.post<StubLoginResponse>('/api/auth/stub', {})
        router.push(result.redirectTo)
        return
      }

      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      const next = new URLSearchParams(window.location.search).get('next')
      const callback = new URL('/auth/callback', window.location.origin)
      if (next?.startsWith('/') && !next.startsWith('//')) {
        callback.searchParams.set('next', next)
      }
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: callback.toString() },
      })
      if (oauthError) throw oauthError
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '로그인 중 오류가 발생했습니다')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-sm">
      <button type="button" disabled={pending} onClick={() => login('kakao')} className="flex min-h-12 w-full items-center justify-center rounded-pill bg-[#FEE500] px-lg text-button font-button text-[#191919] disabled:opacity-60">
        카카오로 계속하기
      </button>
      <button type="button" disabled={pending} onClick={() => login('google')} className="flex min-h-12 w-full items-center justify-center gap-sm rounded-pill border border-hairline bg-canvas px-lg text-button font-button text-ink disabled:opacity-60">
        <span aria-hidden="true" className="font-sans text-primary">G</span>
        Google로 계속하기
      </button>
      {error ? <p role="alert" className="text-body-sm text-semantic-down">{error}</p> : null}
    </div>
  )
}
