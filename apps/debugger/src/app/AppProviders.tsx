import type { ReactNode } from 'react';
import { MantineProvider, createTheme } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

export function AppProviders(props: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider forceColorScheme="light" theme={theme}>
        <ModalsProvider>
          <Notifications position="top-right" />
          {props.children}
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>
  );
}
