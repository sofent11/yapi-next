const appBase = import.meta.env.BASE_URL || '/';

export function withAppBase(path: string): string {
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return `${appBase}${normalizedPath}`;
}

export function apiPath(path: string): string {
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return withAppBase(`api/${normalizedPath}`);
}
