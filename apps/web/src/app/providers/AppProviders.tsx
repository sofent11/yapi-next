import type { ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { bootstrapWebPlugins, webPlugins } from '../../plugins';
import { registerDynamicReducers, store } from '../../store';
import { appTheme } from '../../design/theme';
import { ThemeProvider, useTheme } from '../../hooks/useTheme';

bootstrapWebPlugins();
registerDynamicReducers(webPlugins.getDynamicReducers());

type AppProvidersProps = {
  children: ReactNode;
};

const routerBase = import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '');

function ThemedProviders(props: AppProvidersProps) {
  const { theme } = useTheme();

  return (
    <MantineProvider forceColorScheme={theme} theme={appTheme}>
      <ModalsProvider>
        <Notifications position="top-right" />
        <BrowserRouter
          basename={routerBase}
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true
          }}
        >
          {props.children}
        </BrowserRouter>
      </ModalsProvider>
    </MantineProvider>
  );
}

export function AppProviders(props: AppProvidersProps) {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <ThemedProviders>{props.children}</ThemedProviders>
      </ThemeProvider>
    </Provider>
  );
}
