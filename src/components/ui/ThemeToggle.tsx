'use client'

import { useEffect, useState } from 'react'

import { THEME_STORAGE_KEY, nextTheme, type Theme } from '@/lib/theme'

import { cn } from './styles'

function MoonIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

/**
 * ThemeToggle — 라이트/다크 테마 수동 전환 버튼.
 * 초기 테마는 무플래시 스크립트가 <html data-theme> 로 이미 세팅해 두므로,
 * 마운트 시 그 값을 읽어 동기화한다. 클릭 시 data-theme 갱신 + localStorage 저장.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme')
    setTheme(current === 'dark' ? 'dark' : 'light')
  }, [])

  function toggle() {
    const next = nextTheme(theme)
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // 프라이빗 모드 등 스토리지 접근 실패는 무시
    }
  }

  const isDark = theme === 'dark'
  const label = isDark ? '라이트 모드 켜기' : '다크 모드 켜기'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-body transition-colors hover:text-ink',
        className,
      )}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
