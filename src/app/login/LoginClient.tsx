'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ApiError, apiClient } from '@/lib/apiClient'

type StubLoginResponse = { redirectTo: string }

export function LoginClient() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const login = async () => {
    setPending(true)
    setError(null)
    try {
      const result = await apiClient.post<StubLoginResponse>('/api/auth/stub', {})
      router.push(result.redirectTo)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '로그인 중 오류가 발생했습니다')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-sm">
      <button type="button" disabled={pending} onClick={login} className="flex min-h-12 w-full items-center justify-center rounded-pill bg-[#FEE500] px-lg text-button font-button text-[#191919] disabled:opacity-60">
        카카오로 계속하기
      </button>
      <button type="button" disabled={pending} onClick={login} className="flex min-h-12 w-full items-center justify-center gap-sm rounded-pill border border-hairline bg-canvas px-lg text-button font-button text-ink disabled:opacity-60">
        <span aria-hidden="true" className="font-sans text-primary">G</span>
        Google로 계속하기
      </button>
      {error ? <p role="alert" className="text-body-sm text-semantic-down">{error}</p> : null}
    </div>
  )
}
