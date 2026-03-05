import json5 from 'json5';

function getMockValueForType(type: string, schema: Record<string, any> = {}): any {
  if (schema.default !== undefined) return schema.default;
  if (schema.example !== undefined) return schema.example;
  if (schema.mock && schema.mock.mock !== undefined) {
    return schema.mock.mock;
  }
  
  switch (type) {
    case 'string':
      return '';
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      if (schema.items) {
        return [generateMockFromJsonSchema(schema.items)];
      }
      return [];
    case 'object':
      const obj: Record<string, any> = {};
      if (schema.properties) {
        for (const [key, value] of Object.entries(schema.properties)) {
          obj[key] = generateMockFromJsonSchema(value as Record<string, any>);
        }
      }
      return obj;
    case 'null':
      return null;
    default:
      return '';
  }
}

export function generateMockFromJsonSchema(schema: unknown): any {
  if (!schema || typeof schema !== 'object') {
    return '';
  }
  const s = schema as Record<string, any>;
  
  if (s.type) {
    return getMockValueForType(String(s.type).toLowerCase(), s);
  } else if (s.properties) {
    return getMockValueForType('object', s);
  } else if (s.items) {
    return getMockValueForType('array', s);
  }
  
  return '';
}

export function generateMockStringFromJsonSchema(schemaStr: string): string {
  if (!schemaStr) return '{}';
  try {
    const parsed = json5.parse(schemaStr);
    const mockObj = generateMockFromJsonSchema(parsed);
    return JSON.stringify(mockObj, null, 2);
  } catch (err) {
    return '{}';
  }
}
