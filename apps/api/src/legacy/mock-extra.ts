/**
 * Legacy mockJs enhancement script ported for Next runtime.
 */
const STR_REGEX = /\${([a-zA-Z]+)\.?([a-zA-Z0-9_\.]*)}/i;
const VAR_SPLIT = '.';
const MOCK_SPLIT = '|';

let mockjsPatched = false;

function tryPatchMockJsRandom(): void {
  if (mockjsPatched) return;
  mockjsPatched = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mockJs = require('mockjs') as {
      Random?: { extend?: (input: Record<string, (...args: unknown[]) => unknown>) => void };
    };
    mockJs?.Random?.extend?.({
      timestamp() {
        const time = `${Date.now()}`;
        return Number(time.slice(0, Math.max(time.length - 3, 1)));
      }
    });
  } catch (_err) {
    // ignore when mockjs is not installed
  }
}

function handleRegexp(item: string): RegExp {
  return new RegExp(item);
}

function handleStr(str: string, context: Record<string, unknown>): unknown {
  if (str.indexOf('{') === -1 || str.indexOf('}') === -1 || str.indexOf('$') === -1) {
    return str;
  }

  const matches = str.match(STR_REGEX);
  if (!matches) {
    return str;
  }

  const name = matches[1] + (matches[2] ? `.${matches[2]}` : '');
  if (!name) return str;

  const names = name.split(VAR_SPLIT);
  let data: unknown = context;

  if (typeof context[names[0]] === 'undefined') {
    return str;
  }

  for (const part of names) {
    if (data === '') return '';
    if (
      data &&
      typeof data === 'object' &&
      Object.prototype.hasOwnProperty.call(data, part)
    ) {
      data = (data as Record<string, unknown>)[part];
    } else {
      data = '';
    }
  }

  return data;
}

function parseNode(input: unknown, context: Record<string, unknown>): unknown {
  const filtersMap: Record<string, (value: string) => unknown> = {
    regexp: handleRegexp
  };

  if (Array.isArray(input)) {
    return input.map(item => parseNode(item, context));
  }

  if (!input || typeof input !== 'object') {
    if (typeof input === 'string') {
      return handleStr(input, context);
    }
    return input;
  }

  const source = input as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const [rawKey, rawValue] of Object.entries(source)) {
    const parsedValue = parseNode(rawValue, context);
    const filters = rawKey.split(MOCK_SPLIT);

    if (filters.length === 1) {
      output[rawKey] = parsedValue;
      continue;
    }

    const loweredFilters = filters.map(item => item.toLowerCase());
    const baseKeyParts = [...filters];
    let transformed = false;

    for (let i = 1; i < loweredFilters.length; i++) {
      const filterName = loweredFilters[i];
      const handler = filtersMap[filterName];
      if (!handler) continue;

      const filterKey = filters[i];
      const removeIndex = baseKeyParts.indexOf(filterKey);
      if (removeIndex >= 0) {
        baseKeyParts.splice(removeIndex, 1);
      }
      output[baseKeyParts.join(MOCK_SPLIT)] = handler(String(parsedValue));
      transformed = true;
    }

    if (!transformed) {
      output[rawKey] = parsedValue;
    }
  }

  return output;
}

export function mockExtra(mockJson: unknown, context: Record<string, unknown> = {}): unknown {
  tryPatchMockJsRandom();
  if (!mockJson || typeof mockJson !== 'object') {
    return mockJson;
  }
  return parseNode(mockJson, context);
}

export default mockExtra;
