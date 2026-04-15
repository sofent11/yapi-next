import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppProviders } from './app/AppProviders';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './styles/app.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <AppProviders>
    <App />
  </AppProviders>
);
