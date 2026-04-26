import Ajv from 'ajv';
import {
  caseCheckSchema,
  checkResultSchema,
  createId,
  resolvedRequestPreviewSchema,
  responseHeaderSchema,
  scriptLogSchema,
  sendRequestInputSchema,
  sendRequestResultSchema,
  type CaseCheck,
  type CheckResult,
  type EnvironmentDocument,
  type ParameterRow,
  type ProjectDocument,
  type ResolvedRequestPreview,
  type ResponseExample,
  type ScriptLog,
  type SendRequestResult
} from '@yapi-debugger/schema';

const TEMPLATE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;
const SUPPORTED_PM_REQUIRE_MODULES = ['uuid'] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-([1-5])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Primitive = string | number | boolean | null | undefined;

export type ScriptExecutionState = {
  variables: Record<string, string>;
  globals?: Record<string, string>;
  vault?: Record<string, string>;
  environment: EnvironmentDocument | undefined;
};

export type ScriptRuntimeContext = {
  iterationData?: Record<string, unknown>;
  iteration?: number;
  iterationCount?: number;
  requestId?: string;
  caseId?: string;
  sourceCollection?: {
    id: string;
    name: string;
    stepKey: string;
  };
};

export type ScriptExecutionFlow = {
  skipRequest: boolean;
  nextRequestSet: boolean;
  nextRequest: string | null;
};

type ScriptSendRequestInput = {
  method: string;
  url: string;
  headers: ParameterRow[];
  query: ParameterRow[];
  body: {
    mode: 'none' | 'json' | 'text' | 'xml' | 'graphql' | 'sparql' | 'file' | 'form-urlencoded' | 'multipart';
    mimeType?: string;
    text: string;
    file?: string;
    fields: ParameterRow[];
  };
  timeoutMs?: number;
  followRedirects?: boolean;
};

function normalizePathSegments(path: string) {
  return path
    .trim()
    .replace(/^\$\./, '')
    .replace(/^\$/, '')
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
}

export function readPathValue(source: unknown, path: string): unknown {
  if (!path.trim()) return undefined;
  return normalizePathSegments(path).reduce<unknown>((current, segment) => {
    if (current == null) return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    if (typeof current === 'object') {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, source);
}

function stringifyTemplateValue(value: unknown) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
}

export function interpolateString(input: string, sources: Array<Record<string, unknown>>) {
  if (!input.includes('{{')) return input;
  const exact = input.match(/^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/);
  if (exact) {
    const value = lookupVariable(exact[1], sources);
    return stringifyTemplateValue(value);
  }

  return input.replace(TEMPLATE_PATTERN, (_, key: string) => stringifyTemplateValue(lookupVariable(key, sources)));
}

export function interpolateRows(rows: ParameterRow[], sources: Array<Record<string, unknown>>) {
  return rows.map(row => ({
    ...row,
    value: interpolateString(row.value, sources),
    filePath: row.filePath ? interpolateString(row.filePath, sources) : row.filePath
  }));
}

export function interpolateResolvedRequest(
  preview: ResolvedRequestPreview,
  sources: Array<Record<string, unknown>>
) {
  return resolvedRequestPreviewSchema.parse({
    ...preview,
    url: interpolateString(preview.url, sources),
    requestPath: interpolateString(preview.requestPath, sources),
    headers: interpolateRows(preview.headers, sources),
    query: interpolateRows(preview.query, sources),
    body: {
      ...preview.body,
      text: interpolateString(preview.body.text, sources),
      file: preview.body.file ? interpolateString(preview.body.file, sources) : preview.body.file,
      grpc: preview.body.grpc
        ? {
            ...preview.body.grpc,
            protoFile: preview.body.grpc.protoFile
              ? interpolateString(preview.body.grpc.protoFile, sources)
              : preview.body.grpc.protoFile,
            importPaths: (preview.body.grpc.importPaths || []).map(item => interpolateString(item, sources)),
            service: preview.body.grpc.service
              ? interpolateString(preview.body.grpc.service, sources)
              : preview.body.grpc.service,
            method: preview.body.grpc.method
              ? interpolateString(preview.body.grpc.method, sources)
              : preview.body.grpc.method,
            message: interpolateString(preview.body.grpc.message || '', sources),
            messages: (preview.body.grpc.messages || []).map(message => ({
              ...message,
              name: interpolateString(message.name || '', sources),
              content: interpolateString(message.content || '', sources)
            }))
          }
        : preview.body.grpc,
      fields: interpolateRows(preview.body.fields, sources)
    }
  });
}

export function mergeTemplateSources(input: {
  project: ProjectDocument;
  environment?: EnvironmentDocument;
  extraSources?: Array<Record<string, unknown>>;
}) {
  const environment = input.environment;
  const baseUrl = environment?.vars.baseUrl || input.project.runtime.baseUrl || '';
  return [
    ...(input.extraSources || []),
    environment?.vars || {},
    input.project.runtime.vars || {},
    { baseUrl }
  ];
}

function lookupVariable(key: string, sources: Array<Record<string, unknown>>) {
  for (const source of sources) {
    if (!source) continue;
    const value = readPathValue(source, key);
    if (value !== undefined) return value;
  }
  return '';
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch (_error) {
    return undefined;
  }
}

function stringifyValue(input: unknown) {
  if (typeof input === 'string') return input;
  if (input == null) return '';
  try {
    return JSON.stringify(input);
  } catch (_error) {
    return String(input);
  }
}

function generateUuidV4() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function supportedPmRequireModulesLabel() {
  return SUPPORTED_PM_REQUIRE_MODULES.join(', ');
}

function normalizePmRequireModuleName(name: string) {
  return name.trim().toLowerCase();
}

function resolvePmRequireModule(name: string) {
  const normalized = normalizePmRequireModuleName(name);
  if (normalized === 'uuid') {
    return {
      v4: () => generateUuidV4(),
      validate: (value: unknown) => UUID_PATTERN.test(String(value || '')),
      version: (value: unknown) => {
        const match = String(value || '').match(UUID_PATTERN);
        return match ? Number(match[1]) : 0;
      }
    };
  }
  throw createUnsupportedApiError(
    'pm.require',
    `Supported built-in modules: ${supportedPmRequireModulesLabel()}. Requested module: ${name || 'unknown'}.`
  );
}

function renderVisualizerTemplate(template: string, data?: unknown) {
  if (!template.includes('{{')) return template;
  return template.replace(TEMPLATE_PATTERN, (_match, key: string) => stringifyTemplateValue(readPathValue(data, key.trim())));
}

function buildResponseHeaderMap(response: SendRequestResult) {
  return new Map(response.headers.map(item => [item.name.toLowerCase(), item.value]));
}

function buildResponseCookieMap(response: SendRequestResult) {
  return new Map(
    response.headers
      .filter(header => header.name.toLowerCase() === 'set-cookie')
      .map(header => {
        const [cookiePart] = header.value.split(';');
        const [name, ...rest] = cookiePart.split('=');
        return [name?.trim() || 'cookie', rest.join('=').trim()] as const;
      })
  );
}

function scriptRowIndex(rows: ParameterRow[], key: string) {
  const normalized = key.trim().toLowerCase();
  return rows.findIndex(row => row.name.trim().toLowerCase() === normalized);
}

function normalizeScriptRowEntry(nameOrEntry: unknown, value?: Primitive): ParameterRow {
  if (typeof nameOrEntry === 'string') {
    return {
      name: nameOrEntry,
      value: value == null ? '' : String(value),
      enabled: true,
      kind: 'text' as const
    };
  }
  const source = (nameOrEntry || {}) as Record<string, unknown>;
  return {
    name: String(source.key || source.name || ''),
    value: source.value == null ? '' : String(source.value),
    enabled: source.disabled === true ? false : true,
    kind: source.type === 'file' ? 'file' : 'text',
    filePath: typeof source.src === 'string' ? source.src : typeof source.filePath === 'string' ? source.filePath : undefined
  };
}

function createScriptRowApi(rows: ParameterRow[]) {
  return {
    get(key: string) {
      const index = scriptRowIndex(rows, key);
      return index >= 0 ? rows[index]?.value || '' : '';
    },
    has(key: string) {
      return scriptRowIndex(rows, key) >= 0;
    },
    add(nameOrEntry: unknown, value?: Primitive) {
      const next = normalizeScriptRowEntry(nameOrEntry, value);
      if (!next.name.trim()) return;
      rows.push(next);
    },
    upsert(nameOrEntry: unknown, value?: Primitive) {
      const next = normalizeScriptRowEntry(nameOrEntry, value);
      if (!next.name.trim()) return;
      const index = scriptRowIndex(rows, next.name);
      if (index >= 0) {
        rows[index] = next;
        return;
      }
      rows.push(next);
    },
    remove(key: string) {
      const index = scriptRowIndex(rows, key);
      if (index >= 0) rows.splice(index, 1);
    },
    clear() {
      rows.splice(0, rows.length);
    },
    toObject() {
      return Object.fromEntries(rows.filter(row => row.name.trim() && row.enabled !== false).map(row => [row.name, row.value]));
    }
  };
}

function createVariableApi(target: Record<string, string>, fallbackSources: Array<Record<string, unknown>>) {
  return {
    get: (key: string) => target[key],
    set: (key: string, value: Primitive) => {
      target[key] = value == null ? '' : String(value);
    },
    unset: (key: string) => {
      delete target[key];
    },
    has: (key: string) => Object.prototype.hasOwnProperty.call(target, key),
    toObject: () => ({ ...target }),
    replaceIn: (value: string) => interpolateString(String(value || ''), [target, ...fallbackSources])
  };
}

function createScopedVariableApi(target: Record<string, string>, fallbackSources: Array<Record<string, unknown>>) {
  const sources = [target, ...fallbackSources];
  return {
    get: (key: string) => stringifyTemplateValue(lookupVariable(key, sources)),
    set: (key: string, value: Primitive) => {
      target[key] = value == null ? '' : String(value);
    },
    unset: (key: string) => {
      delete target[key];
    },
    has: (key: string) => sources.some(source => source && readPathValue(source, key) !== undefined),
    toObject: () => {
      const merged: Record<string, string> = {};
      [...fallbackSources].reverse().forEach(source => {
        Object.entries(source || {}).forEach(([key, value]) => {
          if (value !== undefined) merged[key] = stringifyTemplateValue(value);
        });
      });
      Object.entries(target).forEach(([key, value]) => {
        merged[key] = value;
      });
      return merged;
    },
    replaceIn: (value: string) => interpolateString(String(value || ''), sources)
  };
}

function createReadonlyVariableApi(source: Record<string, string>, fallbackSources: Array<Record<string, unknown>>) {
  return {
    get: (key: string) => source[key],
    has: (key: string) => Object.prototype.hasOwnProperty.call(source, key),
    toObject: () => ({ ...source }),
    replaceIn: (value: string) => interpolateString(String(value || ''), [source, ...fallbackSources])
  };
}

function createVaultApi(target: Record<string, string>) {
  return {
    get: async (key: string) => target[key],
    set: async (key: string, value: Primitive) => {
      target[key] = value == null ? '' : String(value);
    },
    unset: async (key: string) => {
      delete target[key];
    },
    has: async (key: string) => Object.prototype.hasOwnProperty.call(target, key)
  };
}

function createUnsupportedApiError(name: string, guidance?: string) {
  return new Error(guidance ? `${name} is not supported by the local debugger runtime yet. ${guidance}` : `${name} is not supported by the local debugger runtime yet.`);
}

function createUnsupportedVariableApi(name: string, fallbackSources: Array<Record<string, unknown>>) {
  return {
    get: (_key: string) => {
      throw createUnsupportedApiError(name);
    },
    set: (_key: string, _value: Primitive) => {
      throw createUnsupportedApiError(name);
    },
    unset: (_key: string) => {
      throw createUnsupportedApiError(name);
    },
    has: (_key: string) => {
      throw createUnsupportedApiError(name);
    },
    toObject: () => {
      throw createUnsupportedApiError(name);
    },
    replaceIn: (value: string) => interpolateString(String(value || ''), fallbackSources)
  };
}

function createRequestApi(request: ResolvedRequestPreview) {
  const headerApi = createScriptRowApi(request.headers);
  const queryApi = createScriptRowApi(request.query);
  const bodyApi = {
    text: () => request.body.text,
    json: () => safeJsonParse(request.body.text),
    setText: (value: Primitive, mimeType?: string) => {
      request.body.text = value == null ? '' : String(value);
      request.body.mode = request.body.mode === 'none' ? 'text' : request.body.mode;
      if (mimeType !== undefined) request.body.mimeType = mimeType;
    },
    setJson: (value: unknown) => {
      request.body.mode = 'json';
      request.body.mimeType = 'application/json';
      request.body.text = typeof value === 'string' ? value : JSON.stringify(value);
      request.body.fields = [];
    },
    clear: () => {
      request.body.mode = 'none';
      request.body.text = '';
      request.body.fields = [];
    }
  };
  const api: Record<string, unknown> = {
    headers: headerApi,
    query: queryApi,
    body: bodyApi,
    setUrl: (value: Primitive) => {
      request.url = value == null ? '' : String(value);
    },
    setMethod: (value: Primitive) => {
      request.method = String(value || 'GET').toUpperCase() as ResolvedRequestPreview['method'];
    }
  };
  Object.defineProperties(api, {
    url: {
      enumerable: true,
      get: () => request.url,
      set: (value: Primitive) => {
        request.url = value == null ? '' : String(value);
      }
    },
    method: {
      enumerable: true,
      get: () => request.method,
      set: (value: Primitive) => {
        request.method = String(value || 'GET').toUpperCase() as ResolvedRequestPreview['method'];
      }
    }
  });
  return api;
}

const ajv = new Ajv({ strict: false, allErrors: true });

function createScriptLog(phase: ScriptLog['phase'], level: ScriptLog['level'], message: string): ScriptLog {
  return scriptLogSchema.parse({ phase, level, message });
}

function createScriptResponse(response: SendRequestResult) {
  const responseHeaders = buildResponseHeaderMap(response);
  const responseCookies = buildResponseCookieMap(response);
  const responseBody = safeJsonParse(response.bodyText);
  const headerRows = response.headers.map(header => ({
    key: header.name,
    name: header.name,
    value: header.value
  }));
  const cookieRows = Array.from(responseCookies.entries()).map(([name, value]) => ({ name, value }));
  const assertJsonResponse = () => {
    const contentType = responseHeaders.get('content-type') || '';
    if (!contentType.toLowerCase().includes('json')) {
      throw new Error(`Expected response content-type to be JSON, got ${contentType || 'missing'}`);
    }
    if (responseBody === undefined) {
      throw new Error('Expected response body to be valid JSON');
    }
  };
  const assertResponseBody = (expected?: string) => {
    if (!response.bodyText) {
      throw new Error('Expected response to have a body');
    }
    if (expected !== undefined && response.bodyText !== expected) {
      throw new Error(`Expected response body to equal ${expected}`);
    }
  };
  return {
    code: response.status,
    status: response.status,
    statusText: response.statusText,
    reason: () => response.statusText,
    responseTime: response.durationMs,
    responseSize: response.sizeBytes,
    text: () => response.bodyText,
    json: (path?: string) => path ? readPathValue(responseBody, path) : responseBody,
    headers: {
      get: (key: string) => responseHeaders.get(key.toLowerCase()) || '',
      has: (key: string) => responseHeaders.has(key.toLowerCase()),
      all: () => headerRows,
      toObject: () => Object.fromEntries(response.headers.map(header => [header.name.toLowerCase(), header.value]))
    },
    cookies: {
      get: (key: string) => responseCookies.get(key) || '',
      has: (key: string) => responseCookies.has(key),
      all: () => cookieRows,
      toObject: () => Object.fromEntries(responseCookies.entries())
    },
    to: {
      be: {
        ok() {
          if (response.status < 200 || response.status >= 300) {
            throw new Error(`Expected response status ${response.status} to be 2xx`);
          }
        },
        json: assertJsonResponse,
        withBody: assertResponseBody
      },
      have: {
        status(expected: number) {
          if (response.status !== expected) {
            throw new Error(`Expected response status ${response.status} to equal ${expected}`);
          }
        },
        header(name: string, expected?: string) {
          const actual = responseHeaders.get(name.toLowerCase());
          if (!actual) {
            throw new Error(`Expected response to have header ${name}`);
          }
          if (expected !== undefined && actual !== expected) {
            throw new Error(`Expected response header ${name} to equal ${expected}, got ${actual}`);
          }
        },
        body: assertResponseBody,
        jsonBody(path?: string) {
          assertJsonResponse();
          if (path && readPathValue(responseBody, path) === undefined) {
            throw new Error(`Expected response JSON body to include path ${path}`);
          }
        }
      }
    }
  };
}

function createScriptExecutionFlow(): ScriptExecutionFlow {
  return {
    skipRequest: false,
    nextRequestSet: false,
    nextRequest: null
  };
}

function normalizeScriptRows(
  rows: unknown,
  keyName: 'key' | 'name',
  valueName: 'value'
): ParameterRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map(row => {
      const source = row as Record<string, unknown>;
      return {
        name: String(source[keyName] || ''),
        value: String(source[valueName] || ''),
        enabled: source.disabled === true ? false : true,
        kind: source.type === 'file' ? 'file' : 'text',
        filePath: typeof source.src === 'string' ? source.src : typeof source.filePath === 'string' ? source.filePath : undefined
      } satisfies ParameterRow;
    })
    .filter(row => row.name.trim());
}

function normalizeScriptRequestInput(input: unknown, fallback: ResolvedRequestPreview): ScriptSendRequestInput {
  if (typeof input === 'string') {
    return sendRequestInputSchema.parse({
      method: 'GET',
      url: input,
      headers: [],
      query: [],
      body: { mode: 'none', text: '', fields: [] }
    });
  }

  const source = (input || {}) as Record<string, unknown>;
  const headerRows = normalizeScriptRows(source.header, 'key', 'value');
  const bodySource = (source.body || {}) as Record<string, unknown>;
  const bodyMode = String(bodySource.mode || 'none');
  const contentType = headerRows.find(row => row.name.toLowerCase() === 'content-type')?.value || '';
  const normalizedBody =
    bodyMode === 'raw'
      ? {
          mode: contentType.includes('json') ? 'json' : 'text',
          mimeType: contentType || (String(bodySource.raw || '').trim().startsWith('{') ? 'application/json' : 'text/plain'),
          text: String(bodySource.raw || ''),
          fields: []
        }
      : bodyMode === 'urlencoded'
        ? {
            mode: 'form-urlencoded' as const,
            mimeType: 'application/x-www-form-urlencoded',
            text: '',
            fields: normalizeScriptRows(bodySource.urlencoded, 'key', 'value')
          }
        : bodyMode === 'formdata'
          ? {
              mode: 'multipart' as const,
              mimeType: 'multipart/form-data',
              text: '',
              fields: normalizeScriptRows(bodySource.formdata, 'key', 'value')
            }
          : {
              mode: 'none' as const,
              mimeType: undefined,
              text: '',
              fields: []
            };

  return sendRequestInputSchema.parse({
    method: String(source.method || fallback.method || 'GET'),
    url: String(source.url || fallback.url || ''),
    headers: headerRows,
    query: normalizeScriptRows(source.query, 'key', 'value'),
    body: normalizedBody,
    timeoutMs: typeof source.timeoutMs === 'number' ? source.timeoutMs : undefined,
    followRedirects: typeof source.followRedirects === 'boolean' ? source.followRedirects : undefined
  });
}

function buildExpect(actual: unknown) {
  const failPrefix = (negated: boolean) => negated ? 'Expected not ' : 'Expected ';
  const chain = {
    equal(expected: unknown, negated = false) {
      const ok = actual === expected;
      if (negated ? ok : !ok) {
        throw new Error(`${failPrefix(negated)}${stringifyValue(actual)} to equal ${stringifyValue(expected)}`);
      }
    },
    eql(expected: unknown, negated = false) {
      const actualValue = stringifyValue(actual);
      const expectedValue = stringifyValue(expected);
      const ok = actualValue === expectedValue;
      if (negated ? ok : !ok) {
        throw new Error(`${failPrefix(negated)}${actualValue} to deeply equal ${expectedValue}`);
      }
    },
    contain(expected: unknown, negated = false) {
      const ok = Array.isArray(actual)
        ? actual.includes(expected)
        : String(actual ?? '').includes(String(expected ?? ''));
      if (negated ? ok : !ok) {
        throw new Error(`${failPrefix(negated)}${stringifyValue(actual)} to contain ${stringifyValue(expected)}`);
      }
    },
    match(expected: RegExp, negated = false) {
      const ok = expected.test(String(actual ?? ''));
      if (negated ? ok : !ok) {
        throw new Error(`${failPrefix(negated)}${stringifyValue(actual)} to match ${String(expected)}`);
      }
    },
    exist(negated = false) {
      const ok = actual != null && actual !== '';
      if (negated ? ok : !ok) {
        throw new Error(`${failPrefix(negated)}value to exist`);
      }
    },
    lessThan(expected: number, negated = false) {
      const ok = Number(actual) < expected;
      if (negated ? ok : !ok) {
        throw new Error(`${failPrefix(negated)}${stringifyValue(actual)} to be less than ${expected}`);
      }
    },
    greaterThan(expected: number, negated = false) {
      const ok = Number(actual) > expected;
      if (negated ? ok : !ok) {
        throw new Error(`${failPrefix(negated)}${stringifyValue(actual)} to be greater than ${expected}`);
      }
    },
    true(negated = false) {
      const ok = actual === true;
      if (negated ? ok : !ok) {
        throw new Error(`${failPrefix(negated)}${stringifyValue(actual)} to be true`);
      }
    },
    false(negated = false) {
      const ok = actual === false;
      if (negated ? ok : !ok) {
        throw new Error(`${failPrefix(negated)}${stringifyValue(actual)} to be false`);
      }
    },
    lengthOf(expected: number, negated = false) {
      const actualLength = normalizeLength(actual);
      const ok = actualLength === expected;
      if (negated ? ok : !ok) {
        throw new Error(`${failPrefix(negated)}length ${actualLength} to equal ${expected}`);
      }
    },
    property(expected: string, value?: unknown, negated = false, hasExpectedValue = false) {
      const hasProperty = Boolean(actual && typeof actual === 'object' && expected in (actual as Record<string, unknown>));
      const valueMatches = !hasExpectedValue || (actual as Record<string, unknown>)[expected] === value;
      const ok = hasProperty && valueMatches;
      if (negated ? ok : !ok) {
        throw new Error(`${failPrefix(negated)}${stringifyValue(actual)} to have property ${expected}`);
      }
    },
    oneOf(expected: unknown[], negated = false) {
      const ok = expected.some(item => item === actual);
      if (negated ? ok : !ok) {
        throw new Error(`${failPrefix(negated)}${stringifyValue(actual)} to be one of ${stringifyValue(expected)}`);
      }
    },
    empty(negated = false) {
      const length = normalizeLength(actual);
      const ok = Number.isFinite(length) ? length === 0 : actual == null || actual === '';
      if (negated ? ok : !ok) {
        throw new Error(`${failPrefix(negated)}${stringifyValue(actual)} to be empty`);
      }
    },
    typeOf(expected: string, negated = false) {
      const normalizedExpected = expected.toLowerCase();
      const actualType = normalizedType(actual);
      const ok = actualType === normalizedExpected || (normalizedExpected === 'object' && actualType === 'object');
      if (negated ? ok : !ok) {
        throw new Error(`${failPrefix(negated)}${stringifyValue(actual)} to be a ${expected}`);
      }
    },
    keys(expected: string[], negated = false, mode: 'exact' | 'all' | 'any' = 'exact') {
      const actualKeys = actual && typeof actual === 'object' ? Object.keys(actual as Record<string, unknown>) : [];
      const ok =
        mode === 'any'
          ? expected.some(key => actualKeys.includes(key))
          : mode === 'all'
            ? expected.every(key => actualKeys.includes(key))
            : expected.length === actualKeys.length && expected.every(key => actualKeys.includes(key));
      if (negated ? ok : !ok) {
        throw new Error(`${failPrefix(negated)}${stringifyValue(actual)} to have keys ${expected.join(', ')}`);
      }
    },
    members(expected: unknown[], negated = false) {
      const actualItems = Array.isArray(actual) ? actual : [];
      const ok = expected.every(item => actualItems.some(actualItem => stringifyValue(actualItem) === stringifyValue(item)));
      if (negated ? ok : !ok) {
        throw new Error(`${failPrefix(negated)}${stringifyValue(actual)} to include members ${stringifyValue(expected)}`);
      }
    },
    deepInclude(expected: unknown, negated = false) {
      const ok = Array.isArray(actual)
        ? actual.some(item => stringifyValue(item) === stringifyValue(expected))
        : objectIncludes(actual, expected);
      if (negated ? ok : !ok) {
        throw new Error(`${failPrefix(negated)}${stringifyValue(actual)} to deeply include ${stringifyValue(expected)}`);
      }
    },
    ok(negated = false) {
      const ok = Boolean(actual);
      if (negated ? ok : !ok) {
        throw new Error(`${failPrefix(negated)}${stringifyValue(actual)} to be truthy`);
      }
    },
    null(negated = false) {
      const ok = actual === null;
      if (negated ? ok : !ok) {
        throw new Error(`${failPrefix(negated)}${stringifyValue(actual)} to be null`);
      }
    },
    undefined(negated = false) {
      const ok = actual === undefined;
      if (negated ? ok : !ok) {
        throw new Error(`${failPrefix(negated)}${stringifyValue(actual)} to be undefined`);
      }
    }
  };

  function makeChain(negated = false) {
    const include = Object.assign(
      (expected: unknown) => chain.contain(expected, negated),
      {
        members: (expected: unknown[]) => chain.members(expected, negated)
      }
    );
    return {
      equal: (expected: unknown) => chain.equal(expected, negated),
      eql: (expected: unknown) => chain.eql(expected, negated),
      contain: (expected: unknown) => chain.contain(expected, negated),
      include,
      match: (expected: RegExp) => chain.match(expected, negated),
      exist: () => chain.exist(negated),
      oneOf: (expected: unknown[]) => chain.oneOf(expected, negated),
      deep: {
        equal: (expected: unknown) => chain.eql(expected, negated),
        eql: (expected: unknown) => chain.eql(expected, negated),
        include: (expected: unknown) => chain.deepInclude(expected, negated)
      },
      have: {
        lengthOf: (expected: number) => chain.lengthOf(expected, negated),
        property(expected: string, value?: unknown) {
          return chain.property(expected, value, negated, arguments.length > 1);
        },
        keys: (...expected: unknown[]) => chain.keys(normalizeExpectedKeys(expected), negated),
        all: {
          keys: (...expected: unknown[]) => chain.keys(normalizeExpectedKeys(expected), negated, 'all')
        },
        any: {
          keys: (...expected: unknown[]) => chain.keys(normalizeExpectedKeys(expected), negated, 'any')
        }
      },
      be: {
        a: (expected: string) => chain.typeOf(expected, negated),
        an: (expected: string) => chain.typeOf(expected, negated),
        lessThan: (expected: number) => chain.lessThan(expected, negated),
        below: (expected: number) => chain.lessThan(expected, negated),
        greaterThan: (expected: number) => chain.greaterThan(expected, negated),
        above: (expected: number) => chain.greaterThan(expected, negated),
        true: () => chain.true(negated),
        false: () => chain.false(negated),
        ok: () => chain.ok(negated),
        null: () => chain.null(negated),
        undefined: () => chain.undefined(negated),
        empty: () => chain.empty(negated),
        oneOf: (expected: unknown[]) => chain.oneOf(expected, negated)
      }
    };
  }

  const positive = makeChain(false);
  return {
    to: {
      ...positive,
      not: makeChain(true)
    },
    not: {
      to: makeChain(true)
    }
  };
}

function createPmApi(input: {
  phase: ScriptLog['phase'];
  state: ScriptExecutionState;
  request: ResolvedRequestPreview;
  response?: SendRequestResult;
  logs: ScriptLog[];
  testResults: CheckResult[];
  sendRequest?: (request: ScriptSendRequestInput) => Promise<SendRequestResult>;
  pendingRequests: Set<Promise<SendRequestResult>>;
  context?: ScriptRuntimeContext;
  execution: ScriptExecutionFlow;
}) {
  function recordTest(label: string, ok: boolean, message: string, expected?: string, actual?: string) {
    input.testResults.push(
      checkResultSchema.parse({
        id: createId('script'),
        label,
        ok,
        message,
        expected,
        actual,
        source: 'script'
      })
    );
  }

  const globalsStore = (input.state.globals ||= {});
  const fallbackTemplateSources = [globalsStore, input.state.environment?.vars || {}];
  const variablesApi = createVariableApi(input.state.variables, fallbackTemplateSources);
  const environmentApi = input.state.environment
    ? createVariableApi(input.state.environment.vars, [input.state.variables, globalsStore])
    : {
        get: (_key: string) => undefined,
        set: () => undefined,
        unset: () => undefined,
        has: (_key: string) => false,
        replaceIn: (value: string) => String(value || '')
      };
  const iterationData = Object.fromEntries(
    Object.entries(input.context?.iterationData || {}).map(([key, value]) => [key, stringifyTemplateValue(value)])
  );
  const iterationDataApi = createReadonlyVariableApi(iterationData, [
    input.state.variables,
    globalsStore,
    input.state.environment?.vars || {}
  ]);
  const responseApi = input.response ? createScriptResponse(input.response) : undefined;
  const globalsApi = createVariableApi(globalsStore, [input.state.variables, input.state.environment?.vars || {}]);
  const vaultStore = (input.state.vault ||= {});
  const scopedVariablesApi = createScopedVariableApi(input.state.variables, [
    iterationData,
    input.state.environment?.vars || {},
    globalsStore
  ]);
  const setNextRequest = (apiName: 'pm.execution.setNextRequest' | 'postman.setNextRequest', name?: string | null) => {
    if (!input.context?.sourceCollection) {
      throw createUnsupportedApiError(apiName, 'Only collection runs can redirect flow.');
    }
    if (name != null && !String(name).trim()) {
      throw new Error(`${apiName} requires a non-empty step target or null.`);
    }
    input.execution.nextRequestSet = true;
    input.execution.nextRequest = name == null ? null : String(name).trim();
  };
  const executionApi = {
    setNextRequest: (name?: string | null) => {
      setNextRequest('pm.execution.setNextRequest', name);
    },
    skipRequest: () => {
      if (input.phase !== 'pre-request') {
        throw createUnsupportedApiError('pm.execution.skipRequest', 'Only pre-request scripts can skip the current request.');
      }
      input.execution.skipRequest = true;
    }
  };

  return {
    variables: scopedVariablesApi,
    collectionVariables: variablesApi,
    iterationData: iterationDataApi,
    environment: environmentApi,
    globals: globalsApi,
    info: {
      eventName: input.phase === 'pre-request' ? 'prerequest' : 'test',
      iteration: input.context?.iteration ?? 0,
      iterationCount: input.context?.iterationCount ?? 1,
      requestName: input.request.name,
      requestId: input.context?.requestId || '',
      caseId: input.context?.caseId || '',
      collectionId: input.context?.sourceCollection?.id || '',
      collectionName: input.context?.sourceCollection?.name || '',
      stepKey: input.context?.sourceCollection?.stepKey || ''
    },
    execution: executionApi,
    vault: createVaultApi(vaultStore),
    visualizer: {
      set: (_template: string, _data?: unknown) => {
        const rendered = renderVisualizerTemplate(_template, _data);
        input.logs.push(
          createScriptLog(
            input.phase,
            'log',
            `Visualizer output:\n${rendered || '<empty>'}`
          )
        );
      }
    },
    require: (_name: string) => resolvePmRequireModule(String(_name || '')),
    cookies: responseApi?.cookies || {
      get: (_key: string) => '',
      has: (_key: string) => false,
      toObject: () => ({})
    },
    sendRequest: (requestInput: unknown, callback?: (error: Error | null, response?: ReturnType<typeof createScriptResponse>) => void) => {
      if (!input.sendRequest) {
        throw new Error('pm.sendRequest is unavailable in this runtime.');
      }
      const request = normalizeScriptRequestInput(requestInput, input.request);
      const task = input.sendRequest(request)
        .then(response => {
          callback?.(null, createScriptResponse(response));
          return response;
        })
        .catch(error => {
          callback?.(error as Error);
          throw error;
        })
        .finally(() => {
          input.pendingRequests.delete(task);
        });
      input.pendingRequests.add(task);
      return task.then(response => createScriptResponse(response));
    },
    request: createRequestApi(input.request),
    response: responseApi,
    expect: buildExpect,
    test: (name: string, fn: () => void) => {
      try {
        fn();
        recordTest(name, true, `${name} passed`);
      } catch (error) {
        const message = (error as Error).message || `${name} failed`;
        recordTest(name, false, message);
      }
    }
  };
}

export async function executeRequestScript(input: {
  phase: ScriptLog['phase'];
  script: string;
  state: ScriptExecutionState;
  request: ResolvedRequestPreview;
  response?: SendRequestResult;
  sendRequest?: (request: ScriptSendRequestInput) => Promise<SendRequestResult>;
  context?: ScriptRuntimeContext;
}) {
  const logs: ScriptLog[] = [];
  const testResults: CheckResult[] = [];
  const execution = createScriptExecutionFlow();
  const normalizedScript = input.script.trim();
  if (!normalizedScript) {
    return { request: input.request, state: input.state, logs, testResults, execution };
  }

  const pendingRequests = new Set<Promise<SendRequestResult>>();

  const pm = createPmApi({
    phase: input.phase,
    state: input.state,
    request: input.request,
    response: input.response,
    logs,
    testResults,
    sendRequest: input.sendRequest,
    pendingRequests,
    context: input.context,
    execution
  });
  const postman = {
    setNextRequest: (name?: string | null) => {
      if (!input.context?.sourceCollection) {
        throw createUnsupportedApiError('postman.setNextRequest', 'Only collection runs can redirect flow.');
      }
      if (name != null && !String(name).trim()) {
        throw new Error('postman.setNextRequest requires a non-empty step target or null.');
      }
      execution.nextRequestSet = true;
      execution.nextRequest = name == null ? null : String(name).trim();
    }
  };
  const scriptConsole = {
    log: (...args: unknown[]) => {
      logs.push(createScriptLog(input.phase, 'log', args.map(stringifyTemplateValue).join(' ')));
    },
    error: (...args: unknown[]) => {
      logs.push(createScriptLog(input.phase, 'error', args.map(stringifyTemplateValue).join(' ')));
    }
  };

  try {
    const runner = new Function('pm', 'postman', 'console', `return (async () => {\n${normalizedScript}\n})();`);
    await runner(pm, postman, scriptConsole);
    while (pendingRequests.size > 0) {
      await Promise.all([...pendingRequests]);
    }
      return {
        request: resolvedRequestPreviewSchema.parse(input.request),
        state: input.state,
        logs,
        testResults,
        execution
      };
  } catch (error) {
    logs.push(createScriptLog(input.phase, 'error', (error as Error).message || 'Script execution failed'));
    testResults.push(
      checkResultSchema.parse({
        id: createId('script'),
        label: input.phase === 'pre-request' ? 'Pre-request script' : 'Post-response script',
        ok: false,
        message: (error as Error).message || 'Script execution failed',
        source: 'script'
      })
    );
      return {
        request: input.request,
        state: input.state,
        logs,
        testResults,
        execution
      };
  }
}

function parseExpectedJsonValue(input: string) {
  try {
    return JSON.parse(input);
  } catch (_error) {
    return input;
  }
}

function inferJsonValueType(input: unknown) {
  if (Array.isArray(input)) return 'array';
  if (input === null) return 'null';
  return typeof input;
}

function normalizeLength(input: unknown) {
  if (Array.isArray(input) || typeof input === 'string') {
    return input.length;
  }
  if (input && typeof input === 'object') {
    return Object.keys(input).length;
  }
  return Number.NaN;
}

function normalizedType(input: unknown) {
  if (Array.isArray(input)) return 'array';
  if (input === null) return 'null';
  return typeof input;
}

function normalizeExpectedKeys(input: unknown[]) {
  if (input.length === 1 && Array.isArray(input[0])) {
    return input[0].map(item => String(item));
  }
  return input.map(item => String(item));
}

function objectIncludes(left: unknown, right: unknown) {
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) || Array.isArray(right)) {
    return false;
  }
  return Object.entries(right as Record<string, unknown>).every(([key, value]) => stringifyValue((left as Record<string, unknown>)[key]) === stringifyValue(value));
}

function normalizeNumberRange(expected: string) {
  const parsed = parseExpectedJsonValue(expected);
  if (Array.isArray(parsed) && parsed.length >= 2) {
    return {
      min: Number(parsed[0]),
      max: Number(parsed[1])
    };
  }
  const [min, max] = expected.split(',').map(item => Number(item.trim()));
  return { min, max };
}

export function evaluateChecks(
  response: SendRequestResult,
  checks: CaseCheck[],
  context?: { examples?: ResponseExample[] }
): CheckResult[] {
  const parsedResponse = sendRequestResultSchema.parse(response);
  const jsonPayload = safeJsonParse(parsedResponse.bodyText);
  const headerMap = buildResponseHeaderMap(parsedResponse);

  return checks
    .filter(check => check.enabled)
    .map(check => {
      const normalized = caseCheckSchema.parse(check);
      const label = normalized.label || normalized.type;

      if (normalized.type === 'status-equals') {
        const expected = normalized.expected || '200';
        const actual = String(parsedResponse.status);
        return {
          id: normalized.id,
          label,
          ok: actual === expected,
          message: actual === expected ? `Status is ${actual}` : `Expected status ${expected}, got ${actual}`,
          expected,
          actual,
          source: 'builtin' as const
        };
      }

      if (normalized.type === 'header-equals') {
        const actual = headerMap.get(normalized.path.trim().toLowerCase()) || '';
        const expected = normalized.expected || '';
        return {
          id: normalized.id,
          label,
          ok: actual === expected,
          message: actual === expected
            ? `Header ${normalized.path} matches expected value`
            : `Header ${normalized.path} expected "${expected}" but got "${actual}"`,
          expected,
          actual,
          source: 'builtin' as const
        };
      }

      if (normalized.type === 'header-includes') {
        const actual = headerMap.get(normalized.path.trim().toLowerCase()) || '';
        const expected = normalized.expected || '';
        return {
          id: normalized.id,
          label,
          ok: actual.includes(expected),
          message: actual.includes(expected)
            ? `Header ${normalized.path} contains expected value`
            : `Header ${normalized.path} does not include "${expected}"`,
          expected,
          actual,
          source: 'builtin' as const
        };
      }

      if (normalized.type === 'json-exists') {
        const actualValue = readPathValue(jsonPayload, normalized.path);
        const actual = stringifyValue(actualValue);
        return {
          id: normalized.id,
          label,
          ok: actualValue !== undefined,
          message:
            actualValue !== undefined ? `JSON path ${normalized.path} exists` : `JSON path ${normalized.path} not found`,
          actual,
          source: 'builtin' as const
        };
      }

      if (normalized.type === 'json-not-exists') {
        const actualValue = readPathValue(jsonPayload, normalized.path);
        return {
          id: normalized.id,
          label,
          ok: actualValue === undefined,
          message:
            actualValue === undefined ? `JSON path ${normalized.path} is absent` : `JSON path ${normalized.path} should be absent`,
          actual: stringifyValue(actualValue),
          source: 'builtin' as const
        };
      }

      if (normalized.type === 'json-equals') {
        const actualValue = readPathValue(jsonPayload, normalized.path);
        const expectedValue = parseExpectedJsonValue(normalized.expected);
        const actual = stringifyValue(actualValue);
        const expected = stringifyValue(expectedValue);
        const ok = actual === expected;
        return {
          id: normalized.id,
          label,
          ok,
          message: ok ? `JSON path ${normalized.path} matches expected value` : `JSON path ${normalized.path} does not match`,
          expected,
          actual,
          source: 'builtin' as const
        };
      }

      if (normalized.type === 'json-type') {
        const actualValue = readPathValue(jsonPayload, normalized.path);
        const actual = inferJsonValueType(actualValue);
        const expected = normalized.expected.trim().toLowerCase();
        return {
          id: normalized.id,
          label,
          ok: actualValue !== undefined && actual === expected,
          message:
            actualValue !== undefined && actual === expected
              ? `JSON path ${normalized.path} has type ${expected}`
              : `JSON path ${normalized.path} expected type ${expected}, got ${actual}`,
          expected,
          actual,
          source: 'builtin' as const
        };
      }

      if (normalized.type === 'json-length') {
        const actualValue = readPathValue(jsonPayload, normalized.path);
        const actualLength = normalizeLength(actualValue);
        const expected = Number(normalized.expected || '0');
        const actual = Number.isFinite(actualLength) ? String(actualLength) : 'NaN';
        return {
          id: normalized.id,
          label,
          ok: Number.isFinite(actualLength) && actualLength === expected,
          message:
            Number.isFinite(actualLength) && actualLength === expected
              ? `JSON path ${normalized.path} length is ${expected}`
              : `JSON path ${normalized.path} expected length ${expected}, got ${actual}`,
          expected: String(expected),
          actual,
          source: 'builtin' as const
        };
      }

      if (normalized.type === 'body-contains') {
        const actual = parsedResponse.bodyText;
        const expected = normalized.expected || '';
        return {
          id: normalized.id,
          label,
          ok: actual.includes(expected),
          message: actual.includes(expected)
            ? 'Response body contains expected text'
            : `Response body does not include "${expected}"`,
          expected,
          actual,
          source: 'builtin' as const
        };
      }

      if (normalized.type === 'body-regex') {
        const actual = parsedResponse.bodyText;
        const expected = normalized.expected || '';
        let ok = false;
        let message = 'Response body does not match the expected pattern';
        try {
          ok = new RegExp(expected).test(actual);
          if (ok) message = 'Response body matches expected pattern';
        } catch (error) {
          message = (error as Error).message || message;
        }
        return {
          id: normalized.id,
          label,
          ok,
          message,
          expected,
          actual,
          source: 'builtin' as const
        };
      }

      if (normalized.type === 'number-gt' || normalized.type === 'number-lt') {
        const actualValue = readPathValue(jsonPayload, normalized.path);
        const actualNumber = Number(actualValue);
        const expectedNumber = Number(normalized.expected || '0');
        const ok =
          Number.isFinite(actualNumber) &&
          Number.isFinite(expectedNumber) &&
          (normalized.type === 'number-gt' ? actualNumber > expectedNumber : actualNumber < expectedNumber);
        return {
          id: normalized.id,
          label,
          ok,
          message: ok
            ? `JSON path ${normalized.path} satisfies ${normalized.type === 'number-gt' ? '>' : '<'} ${expectedNumber}`
            : `JSON path ${normalized.path} expected ${normalized.type === 'number-gt' ? '>' : '<'} ${expectedNumber}, got ${stringifyValue(actualValue)}`,
          expected: String(expectedNumber),
          actual: stringifyValue(actualValue),
          source: 'builtin' as const
        };
      }

      if (normalized.type === 'number-between') {
        const actualValue = readPathValue(jsonPayload, normalized.path);
        const actualNumber = Number(actualValue);
        const range = normalizeNumberRange(normalized.expected);
        const ok =
          Number.isFinite(actualNumber) &&
          Number.isFinite(range.min) &&
          Number.isFinite(range.max) &&
          actualNumber >= range.min &&
          actualNumber <= range.max;
        return {
          id: normalized.id,
          label,
          ok,
          message: ok
            ? `JSON path ${normalized.path} is between ${range.min} and ${range.max}`
            : `JSON path ${normalized.path} expected between ${range.min} and ${range.max}, got ${stringifyValue(actualValue)}`,
          expected: `${range.min},${range.max}`,
          actual: stringifyValue(actualValue),
          source: 'builtin' as const
        };
      }

      if (normalized.type === 'schema-match') {
        let schema: unknown;
        try {
          schema = JSON.parse(normalized.expected || '{}');
        } catch (error) {
          return {
            id: normalized.id,
            label,
            ok: false,
            message: (error as Error).message || 'Schema JSON parse failed',
            expected: normalized.expected,
            actual: '',
            source: 'builtin' as const
          };
        }

        const validator = ajv.compile(schema as object);
        const ok = validator(jsonPayload);
        const actual = ok ? '' : ajv.errorsText(validator.errors, { separator: '; ' });
        return {
          id: normalized.id,
          label,
          ok: Boolean(ok),
          message: ok ? 'Response matches JSON schema' : actual || 'Response does not match JSON schema',
          expected: normalized.expected,
          actual,
          source: 'builtin' as const
        };
      }

      if (normalized.type === 'snapshot-match') {
        const snapshotName = normalized.expected || '';
        const snapshot = (context?.examples || []).find(example => example.name === snapshotName || `${example.role}:${example.name}` === snapshotName);
        if (!snapshot) {
          return {
            id: normalized.id,
            label,
            ok: false,
            message: `Snapshot ${snapshotName || '(empty)'} was not found`,
            expected: snapshotName,
            actual: parsedResponse.bodyText,
            source: 'baseline' as const
          };
        }
        const ok = snapshot.text === parsedResponse.bodyText;
        return {
          id: normalized.id,
          label,
          ok,
          message: ok ? `Snapshot ${snapshot.name} matches` : `Snapshot ${snapshot.name} does not match`,
          expected: snapshot.text,
          actual: parsedResponse.bodyText,
          source: 'baseline' as const
        };
      }

      const expected = normalized.expected || '1000';
      const actual = String(parsedResponse.durationMs);
      const threshold = Number(expected);
      const ok = Number.isFinite(threshold) ? parsedResponse.durationMs < threshold : false;
      return {
        id: normalized.id,
        label,
        ok,
        message: ok
          ? `Response time ${parsedResponse.durationMs}ms is below ${expected}ms`
          : `Response time ${parsedResponse.durationMs}ms is not below ${expected}ms`,
        expected,
        actual,
        source: 'builtin' as const
      };
    })
    .map(item => checkResultSchema.parse(item));
}

export function applyCollectionRules(input: {
  requireSuccessStatus: boolean;
  maxDurationMs?: number;
  requiredJsonPaths?: string[];
  response: SendRequestResult;
}) {
  const output: CheckResult[] = [];
  if (input.requireSuccessStatus) {
    output.push(
      checkResultSchema.parse({
        id: createId('rule'),
        label: '2xx Status',
        ok: input.response.ok,
        message: input.response.ok ? 'Response status is successful' : `Received HTTP ${input.response.status}`,
        expected: '2xx',
        actual: String(input.response.status),
        source: 'collection-rule'
      })
    );
  }

  if (input.maxDurationMs != null) {
    output.push(
      checkResultSchema.parse({
        id: createId('rule'),
        label: 'Response Time',
        ok: input.response.durationMs < input.maxDurationMs,
        message:
          input.response.durationMs < input.maxDurationMs
            ? `Response time ${input.response.durationMs}ms is within limit`
            : `Response time ${input.response.durationMs}ms exceeds ${input.maxDurationMs}ms`,
        expected: String(input.maxDurationMs),
        actual: String(input.response.durationMs),
        source: 'collection-rule'
      })
    );
  }

  const jsonPayload = safeJsonParse(input.response.bodyText);
  (input.requiredJsonPaths || []).forEach(path => {
    const actualValue = readPathValue(jsonPayload, path);
    output.push(
      checkResultSchema.parse({
        id: createId('rule'),
        label: `JSON Path ${path}`,
        ok: actualValue !== undefined,
        message: actualValue !== undefined ? `JSON path ${path} exists` : `JSON path ${path} not found`,
        actual: stringifyValue(actualValue),
        source: 'collection-rule'
      })
    );
  });

  return output;
}

function escapeShellValue(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

export function buildCurlCommand(preview: ResolvedRequestPreview) {
  const url = new URL(preview.url);
  preview.query
    .filter(item => item.enabled && item.name.trim())
    .forEach(item => url.searchParams.append(item.name, item.value));

  const lines = [`curl -X ${preview.method} ${escapeShellValue(url.toString())}`];
  preview.headers
    .filter(item => item.enabled && item.name.trim())
    .forEach(item => {
      lines.push(`  -H ${escapeShellValue(`${item.name}: ${item.value}`)}`);
    });

  if (
    preview.body.mode === 'json' ||
    preview.body.mode === 'text' ||
    preview.body.mode === 'xml' ||
    preview.body.mode === 'graphql' ||
    preview.body.mode === 'sparql'
  ) {
    if (preview.body.text.trim()) {
      lines.push(`  --data-raw ${escapeShellValue(preview.body.text)}`);
    }
  } else if (preview.body.mode === 'file') {
    const filePath = preview.body.file || preview.body.text;
    if (filePath.trim()) {
      lines.push(`  --data-binary ${escapeShellValue(`@${filePath}`)}`);
    }
  } else if (preview.body.mode === 'form-urlencoded') {
    preview.body.fields
      .filter(item => item.enabled && item.name.trim())
      .forEach(item => {
        lines.push(`  --data-urlencode ${escapeShellValue(`${item.name}=${item.value}`)}`);
      });
  } else if (preview.body.mode === 'multipart') {
    preview.body.fields
      .filter(item => item.enabled && item.name.trim())
      .forEach(item => {
        if (item.kind === 'file' && (item.filePath || item.value)) {
          lines.push(`  -F ${escapeShellValue(`${item.name}=@${item.filePath || item.value}`)}`);
          return;
        }
        lines.push(`  -F ${escapeShellValue(`${item.name}=${item.value}`)}`);
      });
  }

  return lines.join(' \\\n');
}

export function normalizeResponseHeaders(headers: Array<{ name: string; value: string }>) {
  return headers.map(header => responseHeaderSchema.parse(header));
}
