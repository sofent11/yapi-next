import type { RuleObject } from 'antd/es/form';

function legacyStringLength(input: string): number {
  let length = 0;
  for (let i = 0; i < input.length; i += 1) {
    length += input.charCodeAt(i) > 255 ? 2 : 1;
  }
  return length;
}

export function legacyNameValidator(label: string, limit = 100) {
  const message = `请输入${label}名称，长度不超过${limit}字符(中文算作2字符)!`;
  return (_rule: RuleObject, value: unknown): Promise<void> => {
    const text = String(value || '').trim();
    const length = legacyStringLength(text);
    if (!text || length <= 0 || length > limit) {
      return Promise.reject(new Error(message));
    }
    return Promise.resolve();
  };
}

