import { describe, it, expect } from 'vitest';
import {
  resolveInitialTheme,
  nextTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from './theme';

describe('THEME_STORAGE_KEY', () => {
  it('is the string "fs-theme"', () => {
    expect(THEME_STORAGE_KEY).toBe('fs-theme');
  });
});

describe('resolveInitialTheme', () => {
  it('returns stored value when it is "light"', () => {
    expect(resolveInitialTheme('light', true)).toBe('light');
    expect(resolveInitialTheme('light', false)).toBe('light');
  });

  it('returns stored value when it is "dark"', () => {
    expect(resolveInitialTheme('dark', false)).toBe('dark');
    expect(resolveInitialTheme('dark', true)).toBe('dark');
  });

  it('falls back to system preference when stored is null', () => {
    expect(resolveInitialTheme(null, true)).toBe('dark');
    expect(resolveInitialTheme(null, false)).toBe('light');
  });

  it('falls back to system preference when stored is invalid', () => {
    expect(resolveInitialTheme('purple', true)).toBe('dark');
    expect(resolveInitialTheme('', false)).toBe('light');
    expect(resolveInitialTheme('DARK', false)).toBe('light');
  });
});

describe('nextTheme', () => {
  it('inverts the current theme', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
  });

  it('round-trips back to the original after two toggles', () => {
    const start: Theme = 'light';
    expect(nextTheme(nextTheme(start))).toBe(start);
    const startDark: Theme = 'dark';
    expect(nextTheme(nextTheme(startDark))).toBe(startDark);
  });
});
