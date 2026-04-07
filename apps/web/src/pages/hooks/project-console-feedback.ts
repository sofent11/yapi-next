import { useCallback } from 'react';
import { notifications } from '@mantine/notifications';
import { safeApiRequest } from '../../utils/safe-request';

function showNotification(color: 'red' | 'teal' | 'yellow' | 'blue', message: string) {
  notifications.show({ color, message });
}

export const projectConsoleMessage = {
  success(text: string) {
    showNotification('teal', text);
  },
  error(text: string) {
    showNotification('red', text);
  },
  warning(text: string) {
    showNotification('yellow', text);
  },
  info(text: string) {
    showNotification('blue', text);
  }
};

export function useProjectConsoleApiCall() {
  return useCallback(
    <T extends { errcode?: number; errmsg?: string }>(request: Promise<T>, fallback: string) =>
      safeApiRequest(request, { fallback, onError: msg => projectConsoleMessage.error(msg) }),
    []
  );
}
