'use client'

import { useEffect } from 'react'
import posthog from 'posthog-js'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    posthog.captureException(error)
  }, [error])

  return (
    <html lang="ko">
      <body>
        <main className="mx-auto max-w-container px-lg py-xxl text-left">
          <p role="alert" className="text-body-sm text-semantic-down">
            일시적인 오류가 발생했습니다.
          </p>
          <button type="button" onClick={reset} className="mt-base text-body-sm text-primary">
            다시 시도
          </button>
        </main>
      </body>
    </html>
  )
}
