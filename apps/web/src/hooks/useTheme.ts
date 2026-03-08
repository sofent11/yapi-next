import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';

type ThemeValue = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'yapi_theme';

type ThemeContextValue = {
  preference: ThemeValue;
  theme: ResolvedTheme;
  setTheme: (value: ThemeValue) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getStoredPreference(): ThemeValue {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Ignore localStorage access failures and fall back to system preference.
  }
  return 'system';
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;

  const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColorMeta) {
    const canvasColor = getComputedStyle(root).getPropertyValue('--surface-canvas').trim();
    themeColorMeta.content = canvasColor || (resolved === 'dark' ? '#0c0f1a' : '#f5f7fb');
  }
}

export function ThemeProvider(props: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemeValue>(getStoredPreference);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };
    setSystemTheme(mq.matches ? 'dark' : 'light');

    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }

    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      setPreference(getStoredPreference());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const resolved = preference === 'system' ? systemTheme : preference;

  useLayoutEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const setTheme = useCallback((value: ThemeValue) => {
    setPreference(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Ignore localStorage access failures and keep the in-memory preference.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const next = resolved === 'light' ? 'dark' : 'light';
    setTheme(next);
  }, [resolved, setTheme]);

  const value = useMemo(
    () => ({
      preference,
      theme: resolved,
      setTheme,
      toggleTheme
    }),
    [preference, resolved, setTheme, toggleTheme]
  );

  return createElement(ThemeContext.Provider, { value }, props.children);
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
