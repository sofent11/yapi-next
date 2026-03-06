const METHOD_CLASS_MAP: Record<string, string> = {
  GET: 'http-method-get',
  POST: 'http-method-post',
  PUT: 'http-method-put',
  DELETE: 'http-method-delete',
  PATCH: 'http-method-patch',
  HEAD: 'http-method-head',
  OPTIONS: 'http-method-options'
};

export function normalizeHttpMethod(method?: string): string {
  const normalized = String(method || 'GET').trim().toUpperCase();
  return normalized || 'GET';
}

export function getHttpMethodBadgeClassName(method?: string): string {
  const normalized = normalizeHttpMethod(method);
  return `http-method-pill ${METHOD_CLASS_MAP[normalized] || METHOD_CLASS_MAP.GET}`;
}
