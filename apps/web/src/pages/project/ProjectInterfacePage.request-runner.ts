import { useCallback, useState } from 'react';
import { notifications } from '@mantine/notifications';

import { webPlugins } from '../../plugins';
import { apiPath } from '../../utils/base-path';

const message = {
  success(text: string) {
    notifications.show({ color: 'teal', message: text });
  },
  error(text: string) {
    notifications.show({ color: 'red', message: text });
  }
};

type RequestMeta = {
  type: 'inter' | 'case';
  projectId: number;
  interfaceId: number;
  caseId?: string;
};

type RequestRunnerResetInput = {
  method?: string;
  path?: string;
  query?: string;
  headers?: string;
  body?: string;
};

type RequestRunnerRunOptions = {
  interfaceId: number;
  requestMeta: RequestMeta;
  bodyMode?: 'json' | 'raw';
};

export type ProjectInterfaceRequestRunnerState = {
  method: string;
  path: string;
  query: string;
  headers: string;
  body: string;
  response: string;
  loading: boolean;
  setMethod: (value: string) => void;
  setPath: (value: string) => void;
  setQuery: (value: string) => void;
  setHeaders: (value: string) => void;
  setBody: (value: string) => void;
  reset: (next: RequestRunnerResetInput) => void;
  formatQuery: () => void;
  formatHeaders: () => void;
  formatBody: () => void;
  clearQuery: () => void;
  clearHeaders: () => void;
  clearBody: () => void;
  clearResponse: () => void;
  run: (options: RequestRunnerRunOptions) => Promise<unknown>;
};

const TEST_ROUTE_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'] as const;

export function parseJsonText(text: string, label: string): unknown {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (_err) {
    throw new Error(`${label} 不是合法 JSON`);
  }
}

export function stringifyPretty(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch (_err) {
    return String(value ?? '');
  }
}

function formatJsonText(text: string, label: string): string | null {
  try {
    const parsed = parseJsonText(text, label);
    return JSON.stringify(parsed, null, 2);
  } catch (err) {
    message.error((err as Error).message || `${label} 格式错误`);
    return null;
  }
}

export function useProjectInterfaceRequestRunner(): ProjectInterfaceRequestRunnerState {
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('');
  const [query, setQuery] = useState('{}');
  const [headers, setHeaders] = useState('{}');
  const [body, setBody] = useState('{}');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = useCallback((next: RequestRunnerResetInput) => {
    setMethod(String(next.method || 'GET').toUpperCase());
    setPath(next.path || '');
    setQuery(next.query || '{}');
    setHeaders(next.headers || '{}');
    setBody(next.body || '{}');
    setResponse('');
  }, []);

  const formatQuery = useCallback(() => {
    const formatted = formatJsonText(query, 'Query 参数');
    if (formatted == null) return;
    setQuery(formatted);
  }, [query]);

  const formatHeaders = useCallback(() => {
    const formatted = formatJsonText(headers, 'Header 参数');
    if (formatted == null) return;
    setHeaders(formatted);
  }, [headers]);

  const formatBody = useCallback(() => {
    const formatted = formatJsonText(body, 'Body 参数');
    if (formatted == null) return;
    setBody(formatted);
  }, [body]);

  const clearQuery = useCallback(() => setQuery('{}'), []);
  const clearHeaders = useCallback(() => setHeaders('{}'), []);
  const clearBody = useCallback(() => setBody('{}'), []);
  const clearResponse = useCallback(() => setResponse(''), []);

  const run = useCallback(
    async ({ interfaceId, requestMeta, bodyMode = 'json' }: RequestRunnerRunOptions) => {
      let queryData: unknown;
      let headerData: unknown;
      let bodyData: unknown;

      try {
        queryData = parseJsonText(query, 'Query 参数');
        headerData = parseJsonText(headers, 'Header 参数');
        bodyData = bodyMode === 'raw' ? String(body || '') : parseJsonText(body, 'Body 参数');
      } catch (err) {
        message.error((err as Error).message || '参数格式错误');
        return null;
      }

      const requestMethod = method.toUpperCase();
      const routeMethod = requestMethod.toLowerCase();
      const routePath = TEST_ROUTE_METHODS.includes(routeMethod as (typeof TEST_ROUTE_METHODS)[number])
        ? routeMethod
        : 'post';
      const queryMode = routeMethod === 'get' || routeMethod === 'head' || routeMethod === 'options';
      const payload = {
        interface_id: interfaceId,
        method: requestMethod,
        path,
        req_query: queryData,
        req_headers: headerData,
        req_body: bodyData
      };

      setLoading(true);
      setResponse('');
      try {
        const pluginPayload = await webPlugins.runBeforeRequest(payload, requestMeta);
        const queryString = queryMode ? `?payload=${encodeURIComponent(JSON.stringify(pluginPayload))}` : '';
        const res = await fetch(`${apiPath(`test/${routePath}`)}${queryString}`, {
          method: requestMethod,
          headers: {
            'Content-Type': 'application/json'
          },
          body: queryMode ? undefined : JSON.stringify(pluginPayload),
          credentials: 'include'
        });
        const text = await res.text();
        let responsePayload: Record<string, unknown> = {
          raw: text,
          method: requestMethod,
          path,
          interfaceId
        };
        if (requestMeta.caseId) {
          responsePayload = { ...responsePayload, caseId: requestMeta.caseId };
        }
        try {
          const parsed = JSON.parse(text);
          responsePayload = { ...responsePayload, ...(parsed as Record<string, unknown>) };
        } catch (_err) {
          // Keep raw text.
        }
        const pluginResult = await webPlugins.runAfterRequest(responsePayload, requestMeta);
        setResponse(stringifyPretty(pluginResult));
        return pluginResult;
      } catch (err) {
        setResponse(String((err as Error).message || err));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [body, headers, method, path, query]
  );

  return {
    method,
    path,
    query,
    headers,
    body,
    response,
    loading,
    setMethod,
    setPath,
    setQuery,
    setHeaders,
    setBody,
    reset,
    formatQuery,
    formatHeaders,
    formatBody,
    clearQuery,
    clearHeaders,
    clearBody,
    clearResponse,
    run
  };
}
