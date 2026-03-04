export type InputMap = Record<string, unknown>;

export function pickString(input: unknown): string | undefined {
  if (typeof input === 'string') {
    const value = input.trim();
    return value ? value : undefined;
  }
  return undefined;
}

export function pickNumber(input: unknown): number | undefined {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string' && input.trim() !== '') {
    const value = Number(input);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

export function pickBoolean(input: unknown): boolean {
  if (typeof input === 'boolean') return input;
  if (typeof input === 'string') return input.toLowerCase() === 'true';
  if (typeof input === 'number') return input === 1;
  return false;
}

export function pickJson(input: unknown): string | undefined {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') {
    return JSON.stringify(input);
  }
  return undefined;
}

export function pickOneOrMany(input: unknown): string | string[] | undefined {
  if (typeof input === 'string') {
    const value = input.trim();
    return value ? value : undefined;
  }
  if (Array.isArray(input)) {
    const values = input
      .filter(item => typeof item === 'string')
      .map(item => String(item).trim())
      .filter(Boolean);
    if (values.length === 0) return undefined;
    return values;
  }
  return undefined;
}

export function pickArray<T = unknown>(input: unknown): T[] | undefined {
  if (Array.isArray(input)) return input as T[];
  if (typeof input === 'string' && input.trim()) {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) return parsed as T[];
    } catch (_err) {
      return undefined;
    }
  }
  return undefined;
}

export function hasHttpPrefix(input: string | undefined): boolean {
  if (!input) return false;
  return input.startsWith('http://') || input.startsWith('https://');
}
