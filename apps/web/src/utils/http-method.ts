const METHOD_CLASS_MAP: Record<string, string> = {
  GET: 'legacy-method-get',
  POST: 'legacy-method-post',
  PUT: 'legacy-method-put',
  DELETE: 'legacy-method-delete',
  PATCH: 'legacy-method-patch',
  HEAD: 'legacy-method-head',
  OPTIONS: 'legacy-method-options'
};

export function normalizeHttpMethod(method?: string): string {
  const normalized = String(method || 'GET').trim().toUpperCase();
  return normalized || 'GET';
}

export function getHttpMethodBadgeClassName(method?: string): string {
  const normalized = normalizeHttpMethod(method);
  return `legacy-method-pill ${METHOD_CLASS_MAP[normalized] || METHOD_CLASS_MAP.GET}`;
}
