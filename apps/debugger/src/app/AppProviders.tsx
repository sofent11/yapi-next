import { useEffect, useState, type ReactNode } from 'react';
import { MantineProvider, createTheme } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const PREFERENCES_STORAGE_KEY = 'yapi-debugger.preferences';

const queryClient = new QueryClient();
const theme = createTheme({
  fontFamily: '"Public Sans", "PingFang SC", sans-serif',
  fontFamilyMonospace: '"JetBrains Mono", "SF Mono", "Cascadia Mono", monospace',
  headings: {
    fontFamily: '"Sora", "PingFang SC", sans-serif',
    fontWeight: '600'
  },
  primaryColor: 'indigo',
  defaultRadius: 'xs',
  white: '#ffffff',
  black: '#1a1b1e',
  colors: {
    // Custom gray scale for IDE feel
    gray: [
      '#f8f9fa',
      '#f1f3f5',
      '#e9ecef',
      '#dee2e6',
      '#ced4da',
      '#adb5bd',
      '#868e96',
      '#495057',
      '#343a40',
      '#212529'
    ]
  },
  components: {
    Button: {
      defaultProps: {
        size: 'xs',
        variant: 'filled'
      }
    },
    TextInput: {
      defaultProps: {
        size: 'xs'
      }
    },
    Select: {
      defaultProps: {
        size: 'xs'
      }
    },
    ActionIcon: {
      defaultProps: {
        size: 'sm',
        variant: 'subtle'
      }
    },
    Tabs: {
      styles: {
        tab: {
          paddingTop: '6px',
          paddingBottom: '6px',
          fontSize: '12px'
        }
      }
    }
  }
});

function loadInitialColorScheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return 'light';
    const parsed = JSON.parse(raw) as { theme?: string };
    return parsed.theme === 'dark' ? 'dark' : 'light';
  } catch (_err) {
    return 'light';
  }
}

export function AppProviders(props: { children: ReactNode }) {
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>(loadInitialColorScheme);

  useEffect(() => {
    const root = document.documentElement;
    const syncColorScheme = () => setColorScheme(root.dataset.debuggerTheme === 'dark' ? 'dark' : 'light');
    syncColorScheme();
    const observer = new MutationObserver(syncColorScheme);
    observer.observe(root, { attributes: true, attributeFilter: ['data-debugger-theme'] });
    return () => observer.disconnect();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider forceColorScheme={colorScheme} theme={theme}>
        <ModalsProvider>
          <Notifications position="top-right" />
          {props.children}
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>
  );
}
