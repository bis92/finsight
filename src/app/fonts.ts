import { Inter, JetBrains_Mono } from 'next/font/google'
import localFont from 'next/font/local'

/**
 * 폰트 self-host (next/font). 스타일시트 @import 체인(렌더 차단)을 제거하고
 * 빌드 타임에 self-host 되는 woff2 로 대체한다. 각 폰트는 CSS 변수로 노출되어
 * globals.css 의 --font-* 디자인 토큰이 이를 참조한다.
 *
 * - display: 'swap' — 폰트 로드 전 폴백으로 즉시 텍스트 표시(FCP 차단 방지).
 * - variable — <html className> 에 주입되는 CSS 변수명.
 * - Pretendard 는 랜딩에서 실제 사용하는 weight(400/500/600)만 로컬 포함.
 */

export const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
  fallback: ['system-ui', 'sans-serif'],
})

export const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
  fallback: ['ui-monospace', 'monospace'],
})

export const pretendard = localFont({
  src: [
    {
      path: '../../public/fonts/pretendard/Pretendard-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/pretendard/Pretendard-Medium.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../../public/fonts/pretendard/Pretendard-SemiBold.woff2',
      weight: '600',
      style: 'normal',
    },
  ],
  display: 'swap',
  variable: '--font-pretendard',
  fallback: ['Inter', 'system-ui', 'sans-serif'],
})
