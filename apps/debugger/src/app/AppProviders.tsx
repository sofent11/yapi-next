import type { ReactNode } from 'react';
import { MantineProvider, createTheme } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();
const theme = createTheme({
  fontFamily: '"Manrope", "PingFang SC", "Microsoft YaHei", sans-serif',
  headings: {
    fontFamily: '"Manrope", "PingFang SC", "Microsoft YaHei", sans-serif'
  },
  primaryColor: 'dark'
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
