import { useCallback, useEffect, useState } from 'react';

type ThemeValue = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'yapi_theme';

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(value: ThemeValue): 'light' | 'dark' {
  return value === 'system' ? getSystemTheme() : value;
}

function applyTheme(resolved: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', resolved);
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemeValue>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    return 'system';
  });

  const resolved = resolveTheme(preference);

  // Apply theme to DOM
  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  // Listen for system theme changes when in 'system' mode
  useEffect(() => {
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme(getSystemTheme());
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [preference]);

  const setTheme = useCallback((value: ThemeValue) => {
    setPreference(value);
    localStorage.setItem(STORAGE_KEY, value);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = resolved === 'light' ? 'dark' : 'light';
    setTheme(next);
  }, [resolved, setTheme]);

  return {
    /** User preference: 'light' | 'dark' | 'system' */
    preference,
    /** Resolved actual theme: 'light' | 'dark' */
    theme: resolved,
    /** Set theme preference */
    setTheme,
    /** Toggle between light and dark */
    toggleTheme
  };
}
