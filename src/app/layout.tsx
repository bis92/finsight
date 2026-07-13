import type { Metadata } from 'next'

import { Providers } from '@/app/providers'

import './globals.css'

export const metadata: Metadata = {
  title: 'FinSight',
  description: '개인 소비 인사이트 대시보드',
}

type RootLayoutProps = Readonly<{
  children: React.ReactNode
}>

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ko">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
