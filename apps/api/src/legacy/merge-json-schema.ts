export type JsonObject = Record<string, unknown>;

function isPlainObject(input: unknown): input is JsonObject {
  return !!input && typeof input === 'object' && Object.getPrototypeOf(input) === Object.prototype;
}

function handleProperties(sourceProperties: unknown, mergeProperties: unknown): unknown {
  if (!isPlainObject(mergeProperties)) {
    return mergeProperties;
  }
  if (!isPlainObject(sourceProperties)) {
    return mergeProperties;
  }
  const result: JsonObject = { ...mergeProperties };
  for (const key of Object.keys(result)) {
    result[key] = handleSchema(sourceProperties[key], result[key]);
  }
  return result;
}

function handleSchema(source: unknown, merge: unknown): unknown {
  if (!isPlainObject(source)) return merge;
  if (!isPlainObject(merge)) return merge;

  const result: JsonObject = {
    ...source,
    ...merge
  };

  if (merge.type === 'object') {
    result.properties = handleProperties(source.properties, merge.properties);
  } else if (merge.type === 'array') {
    result.items = handleSchema(source.items, merge.items);
  }

  return result;
}

export function mergeJsonSchema(sourceJsonSchema: unknown, mergeJsonSchemaValue: unknown): unknown {
  return handleSchema(sourceJsonSchema, mergeJsonSchemaValue);
}

export default mergeJsonSchema;
