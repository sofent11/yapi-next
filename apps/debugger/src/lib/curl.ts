import type { AuthConfig, ParameterRow, RequestBody, RequestDocument } from '@yapi-debugger/schema';

type ParsedCurlDataPart =
  | { kind: 'raw'; value: string }
  | { kind: 'urlencoded'; value: string }
  | { kind: 'form'; value: string };

export type ParsedCurlRequest = {
  method: RequestDocument['method'];
  url: string;
  path: string;
  query: ParameterRow[];
  headers: ParameterRow[];
  body: RequestBody;
  auth: AuthConfig;
};

function createRow(name: string, value: string): ParameterRow {
  return {
    name,
    value,
    enabled: true,
    kind: 'text'
  };
}

function tokenizeCurlCommand(input: string) {
  const normalized = input.replace(/\\\r?\n/g, ' ');
  const tokens: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];

    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === '\\') {
      if (quote === "'") {
        current += character;
      } else {
        escaped = true;
      }
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }

    if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += character;
  }

  if (current) tokens.push(current);
  return tokens;
}

function parseHeaderValue(input: string) {
  const separatorIndex = input.indexOf(':');
  if (separatorIndex === -1) {
    return createRow(input.trim(), '');
  }
  return createRow(input.slice(0, separatorIndex).trim(), input.slice(separatorIndex + 1).trim());
}

function parseQueryRows(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const rows: ParameterRow[] = [];
    url.searchParams.forEach((value, key) => {
      rows.push(createRow(key, value));
    });
    url.search = '';
    return {
      url: url.toString(),
      path: `${url.pathname || '/'}${url.hash || ''}`,
      query: rows
    };
  } catch (_error) {
    const [baseUrl, queryString = ''] = rawUrl.split('?');
    const rows = queryString
      .split('&')
      .filter(Boolean)
      .map(part => {
        const [name, ...rest] = part.split('=');
        return createRow(decodeURIComponent(name || ''), decodeURIComponent(rest.join('=') || ''));
      });
    return {
      url: baseUrl,
      path: baseUrl,
      query: rows
    };
  }
}

function parseFormField(input: string): ParameterRow {
  const separatorIndex = input.indexOf('=');
  if (separatorIndex === -1) {
    return createRow(input.trim(), '');
  }
  const name = input.slice(0, separatorIndex).trim();
  const value = input.slice(separatorIndex + 1);
  if (value.startsWith('@')) {
    return {
      ...createRow(name, value.slice(1)),
      kind: 'file',
      filePath: value.slice(1)
    };
  }
  return createRow(name, value);
}

function parseUrlEncodedPart(input: string): ParameterRow {
  const separatorIndex = input.indexOf('=');
  if (separatorIndex === -1) {
    return createRow(decodeURIComponent(input.trim()), '');
  }
  return createRow(
    decodeURIComponent(input.slice(0, separatorIndex).trim()),
    decodeURIComponent(input.slice(separatorIndex + 1))
  );
}

function detectBodyMode(parts: ParsedCurlDataPart[], headers: ParameterRow[]): RequestBody {
  if (parts.length === 0) {
    return {
      mode: 'none',
      text: '',
      fields: []
    };
  }

  if (parts.some(part => part.kind === 'form')) {
    return {
      mode: 'multipart',
      text: '',
      fields: parts.filter(part => part.kind === 'form').map(part => parseFormField(part.value))
    };
  }

  const contentType = headers.find(header => header.name.toLowerCase() === 'content-type')?.value.toLowerCase() || '';
  const rawPayload = parts.map(part => part.value).join('&');
  const urlencodedParts = parts.filter(part => part.kind === 'urlencoded');
  const canBeForm =
    urlencodedParts.length === parts.length ||
    contentType.includes('application/x-www-form-urlencoded');

  if (canBeForm) {
    return {
      mode: 'form-urlencoded',
      text: '',
      fields: parts.flatMap(part => part.value.split('&').filter(Boolean).map(parseUrlEncodedPart))
    };
  }

  const trimmed = rawPayload.trim();
  if (contentType.includes('application/json') || /^[\[{]/.test(trimmed)) {
    return {
      mode: 'json',
      text: rawPayload,
      fields: []
    };
  }

  return {
    mode: 'text',
    text: rawPayload,
    fields: []
  };
}

function parseMethodValue(input: string) {
  const uppercased = input.toUpperCase();
  const allowed = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
  return (allowed.find(method => method === uppercased) || 'GET') as RequestDocument['method'];
}

export function parseCurlCommand(input: string): ParsedCurlRequest | null {
  const trimmed = input.trim();
  if (!trimmed.toLowerCase().startsWith('curl ')) return null;

  const tokens = tokenizeCurlCommand(trimmed);
  if (tokens[0] !== 'curl') return null;

  let method: RequestDocument['method'] | null = null;
  let url = '';
  let followRedirects = true;
  let basicAuthValue: string | null = null;
  const headers: ParameterRow[] = [];
  const bodyParts: ParsedCurlDataPart[] = [];

  const nextToken = (index: number) => tokens[index + 1] || '';

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === '-X' || token === '--request') {
      method = parseMethodValue(nextToken(index));
      index += 1;
      continue;
    }
    if (token.startsWith('-X') && token.length > 2) {
      method = parseMethodValue(token.slice(2));
      continue;
    }

    if (token === '-H' || token === '--header') {
      headers.push(parseHeaderValue(nextToken(index)));
      index += 1;
      continue;
    }
    if (token.startsWith('-H') && token.length > 2) {
      headers.push(parseHeaderValue(token.slice(2)));
      continue;
    }

    if (token === '-A' || token === '--user-agent') {
      headers.push(createRow('User-Agent', nextToken(index)));
      index += 1;
      continue;
    }

    if (token === '-u' || token === '--user') {
      basicAuthValue = nextToken(index);
      index += 1;
      continue;
    }

    if (token === '-b' || token === '--cookie') {
      headers.push(createRow('Cookie', nextToken(index)));
      index += 1;
      continue;
    }

    if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary' || token === '--data-ascii') {
      bodyParts.push({ kind: 'raw', value: nextToken(index) });
      index += 1;
      continue;
    }

    if (token === '--data-urlencode') {
      bodyParts.push({ kind: 'urlencoded', value: nextToken(index) });
      index += 1;
      continue;
    }

    if (token === '-F' || token === '--form' || token === '--form-string') {
      bodyParts.push({ kind: 'form', value: nextToken(index) });
      index += 1;
      continue;
    }

    if (token === '--url') {
      url = nextToken(index);
      index += 1;
      continue;
    }

    if (token === '-I' || token === '--head') {
      method = 'HEAD';
      continue;
    }

    if (token === '-G' || token === '--get') {
      method = 'GET';
      continue;
    }

    if (token === '--location' || token === '-L' || token === '--compressed' || token === '--silent' || token === '-s') {
      continue;
    }

    if (!token.startsWith('-') && !url) {
      url = token;
    }
  }

  if (!url) return null;

  const normalizedUrl = parseQueryRows(url);
  const body = detectBodyMode(bodyParts, headers);
  const auth: AuthConfig = {
    type: 'inherit'
  };

  if (basicAuthValue) {
    const separatorIndex = basicAuthValue.indexOf(':');
    auth.type = 'basic';
    auth.username = separatorIndex === -1 ? basicAuthValue : basicAuthValue.slice(0, separatorIndex);
    auth.password = separatorIndex === -1 ? '' : basicAuthValue.slice(separatorIndex + 1);
  } else {
    const authorizationHeader = headers.find(header => header.name.toLowerCase() === 'authorization');
    if (authorizationHeader?.value.startsWith('Bearer ')) {
      auth.type = 'bearer';
      auth.token = authorizationHeader.value.slice('Bearer '.length);
    }
  }

  const nextMethod = method || (body.mode === 'none' ? 'GET' : 'POST');
  return {
    method: nextMethod,
    url: normalizedUrl.url,
    path: normalizedUrl.path || normalizedUrl.url,
    query: normalizedUrl.query,
    headers,
    body,
    auth
  };
}
