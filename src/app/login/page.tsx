import Link from 'next/link'

import { Card, Wordmark } from '@/components/ui'
import { getDataSource } from '@/lib/env'

import { LoginClient } from './LoginClient'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-soft px-lg py-xxl">
      <Card className="w-full max-w-[400px] text-left">
        <Link href="/" aria-label="핀사이트 홈"><Wordmark /></Link>
        <h1 className="mt-xl text-title-lg font-title-lg">3초 만에 시작하기</h1>
        <p className="mb-xl mt-xs text-body-sm text-body">카카오 또는 Google 계정으로 데모를 시작하세요.</p>
        <LoginClient dataSource={getDataSource()} />
        <p className="mt-lg text-caption leading-5 text-muted">계속하면 서비스 이용약관과 개인정보 처리방침에 동의한 것으로 간주합니다. Phase 0에서는 고정 데모 사용자로 로그인됩니다.</p>
      </Card>
    </main>
  )
}
