import type { ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { bootstrapWebPlugins, webPlugins } from '../../plugins';
import { registerDynamicReducers, store } from '../../store';
import { appTheme } from '../../design/theme';

bootstrapWebPlugins();
registerDynamicReducers(webPlugins.getDynamicReducers());

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders(props: AppProvidersProps) {
  return (
    <Provider store={store}>
      <MantineProvider defaultColorScheme="light" theme={appTheme}>
        <ModalsProvider>
          <Notifications position="top-right" />
          <BrowserRouter
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true
            }}
          >
            {props.children}
          </BrowserRouter>
        </ModalsProvider>
      </MantineProvider>
    </Provider>
  );
}
