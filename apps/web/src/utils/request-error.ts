export function getRequestErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    const data = value.data as Record<string, unknown> | undefined;
    const errmsg = typeof data?.errmsg === 'string' ? data.errmsg : '';
    if (errmsg.trim()) return errmsg;
    const message = typeof value.message === 'string' ? value.message : '';
    if (message.trim()) return message;
    const statusText = typeof value.error === 'string' ? value.error : '';
    if (statusText.trim()) return statusText;
  }
  return fallback;
}
