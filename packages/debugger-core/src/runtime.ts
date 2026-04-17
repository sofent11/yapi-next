import {
  caseCheckSchema,
  checkResultSchema,
  createId,
  resolvedRequestPreviewSchema,
  responseHeaderSchema,
  scriptLogSchema,
  sendRequestResultSchema,
  type CaseCheck,
  type CheckResult,
  type EnvironmentDocument,
  type ParameterRow,
  type ProjectDocument,
  type ResolvedRequestPreview,
  type ScriptLog,
  type SendRequestResult
} from '@yapi-debugger/schema';

const TEMPLATE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

type Primitive = string | number | boolean | null | undefined;

export type ScriptExecutionState = {
  variables: Record<string, string>;
  environment: EnvironmentDocument | undefined;
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

function buildResponseHeaderMap(response: SendRequestResult) {
  return new Map(response.headers.map(item => [item.name.toLowerCase(), item.value]));
}

function createScriptLog(phase: ScriptLog['phase'], level: ScriptLog['level'], message: string): ScriptLog {
  return scriptLogSchema.parse({ phase, level, message });
}

function buildExpect(actual: unknown) {
  const chain = {
    equal(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${stringifyValue(actual)} to equal ${stringifyValue(expected)}`);
      }
    },
    eql(expected: unknown) {
      const actualValue = stringifyValue(actual);
      const expectedValue = stringifyValue(expected);
      if (actualValue !== expectedValue) {
        throw new Error(`Expected ${actualValue} to deeply equal ${expectedValue}`);
      }
    },
    contain(expected: unknown) {
      if (!String(actual ?? '').includes(String(expected ?? ''))) {
        throw new Error(`Expected ${stringifyValue(actual)} to contain ${stringifyValue(expected)}`);
      }
    },
    match(expected: RegExp) {
      if (!expected.test(String(actual ?? ''))) {
        throw new Error(`Expected ${stringifyValue(actual)} to match ${String(expected)}`);
      }
    },
    exist() {
      if (actual == null || actual === '') {
        throw new Error('Expected value to exist');
      }
    },
    lessThan(expected: number) {
      if (!(Number(actual) < expected)) {
        throw new Error(`Expected ${stringifyValue(actual)} to be less than ${expected}`);
      }
    }
  };

  return {
    to: {
      equal: chain.equal,
      eql: chain.eql,
      contain: chain.contain,
      match: chain.match,
      exist: chain.exist,
      be: {
        lessThan: chain.lessThan
      }
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
}) {
  const responseBody = safeJsonParse(input.response?.bodyText || '');
  const responseHeaders = buildResponseHeaderMap(sendRequestResultSchema.parse(input.response || {
    ok: false,
    status: 0,
    statusText: '',
    url: '',
    durationMs: 0,
    sizeBytes: 0,
    headers: [],
    bodyText: '',
    timestamp: ''
  }));

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

  return {
    variables: {
      get: (key: string) => input.state.variables[key],
      set: (key: string, value: Primitive) => {
        input.state.variables[key] = value == null ? '' : String(value);
      }
    },
    environment: {
      get: (key: string) => input.state.environment?.vars[key],
      set: (key: string, value: Primitive) => {
        if (!input.state.environment) return;
        input.state.environment.vars[key] = value == null ? '' : String(value);
      }
    },
    request: input.request,
    response: input.response
      ? {
          code: input.response.status,
          status: input.response.status,
          text: () => input.response?.bodyText || '',
          json: () => responseBody,
          headers: {
            get: (key: string) => responseHeaders.get(key.toLowerCase()) || ''
          }
        }
      : undefined,
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

export function executeRequestScript(input: {
  phase: ScriptLog['phase'];
  script: string;
  state: ScriptExecutionState;
  request: ResolvedRequestPreview;
  response?: SendRequestResult;
}) {
  const logs: ScriptLog[] = [];
  const testResults: CheckResult[] = [];
  const normalizedScript = input.script.trim();
  if (!normalizedScript) {
    return { request: input.request, state: input.state, logs, testResults };
  }

  const pm = createPmApi({
    phase: input.phase,
    state: input.state,
    request: input.request,
    response: input.response,
    logs,
    testResults
  });
  const scriptConsole = {
    log: (...args: unknown[]) => {
      logs.push(createScriptLog(input.phase, 'log', args.map(stringifyTemplateValue).join(' ')));
    },
    error: (...args: unknown[]) => {
      logs.push(createScriptLog(input.phase, 'error', args.map(stringifyTemplateValue).join(' ')));
    }
  };

  try {
    const runner = new Function('pm', 'console', normalizedScript);
    runner(pm, scriptConsole);
    return {
      request: resolvedRequestPreviewSchema.parse(input.request),
      state: input.state,
      logs,
      testResults
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
      testResults
    };
  }
}

export function evaluateChecks(response: SendRequestResult, checks: CaseCheck[]): CheckResult[] {
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

      if (normalized.type === 'json-equals') {
        const actualValue = readPathValue(jsonPayload, normalized.path);
        let expectedValue: unknown = normalized.expected;
        try {
          expectedValue = JSON.parse(normalized.expected);
        } catch (_error) {
          expectedValue = normalized.expected;
        }
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

  if (preview.body.mode === 'json' || preview.body.mode === 'text') {
    if (preview.body.text.trim()) {
      lines.push(`  --data-raw ${escapeShellValue(preview.body.text)}`);
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
