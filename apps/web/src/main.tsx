import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { App } from './App';
import { bootstrapWebPlugins, webPlugins } from './plugins';
import { registerDynamicReducers, store } from './store';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './tailwind.css';

bootstrapWebPlugins();
registerDynamicReducers(webPlugins.getDynamicReducers());

createRoot(document.getElementById('root') as HTMLElement).render(
  <Provider store={store}>
    <MantineProvider
      defaultColorScheme="light"
      theme={{
        primaryColor: 'indigo',
        fontFamily: 'var(--font-sans)',
        headings: { fontFamily: 'var(--font-sans)' },
        defaultRadius: 'md'
      }}
    >
      <ModalsProvider>
        <Notifications position="top-right" />
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true
          }}
        >
          <App />
        </BrowserRouter>
      </ModalsProvider>
    </MantineProvider>
  </Provider>
);
