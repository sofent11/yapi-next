export function toJsonText(value: unknown): string {
  if (!value) return '[]';
  try {
    return JSON.stringify(value, null, 2);
  } catch (_err) {
    return '[]';
  }
}

export function parseJsonArray(value: string, label: string): Array<Record<string, unknown>> {
  if (!value.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (_err) {
    throw new Error(`${label} 不是合法 JSON`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} 必须是数组 JSON`);
  }
  return parsed as Array<Record<string, unknown>>;
}
