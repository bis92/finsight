export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'fs-theme';

export function resolveInitialTheme(
  stored: string | null,
  systemPrefersDark: boolean
): Theme {
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return systemPrefersDark ? 'dark' : 'light';
}

export function nextTheme(current: Theme): Theme {
  return current === 'light' ? 'dark' : 'light';
}
