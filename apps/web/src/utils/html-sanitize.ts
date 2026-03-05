import DOMPurify from 'dompurify';

export function sanitizeHtml(value: unknown): string {
  return DOMPurify.sanitize(String(value || ''), {
    USE_PROFILES: { html: true }
  });
}
