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

// 무플래시: 페인트 전에 저장된 테마(또는 OS 선호)를 <html data-theme> 로 세팅
const THEME_SCRIPT = `(function(){try{var k='fs-theme';var s=localStorage.getItem(k);var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){}})()`

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
