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

function handleSchemaList(sourceList: unknown, mergeList: unknown): unknown {
  if (!Array.isArray(mergeList)) {
    return mergeList;
  }
  const source = Array.isArray(sourceList) ? sourceList : [];
  return mergeList.map((item, index) => handleSchema(source[index], item));
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

  if (Object.prototype.hasOwnProperty.call(merge, 'additionalProperties')) {
    const additionalProperties = merge.additionalProperties;
    result.additionalProperties =
      isPlainObject(additionalProperties) && isPlainObject(source.additionalProperties)
        ? handleSchema(source.additionalProperties, additionalProperties)
        : additionalProperties;
  }

  if (Object.prototype.hasOwnProperty.call(merge, 'definitions')) {
    result.definitions = handleProperties(source.definitions, merge.definitions);
  }

  if (Object.prototype.hasOwnProperty.call(merge, '$defs')) {
    result.$defs = handleProperties(source.$defs, merge.$defs);
  }

  if (Object.prototype.hasOwnProperty.call(merge, '$ref')) {
    result.$ref = merge.$ref;
  }

  if (Object.prototype.hasOwnProperty.call(merge, 'not')) {
    result.not = handleSchema(source.not, merge.not);
  }

  if (Object.prototype.hasOwnProperty.call(merge, 'allOf')) {
    result.allOf = handleSchemaList(source.allOf, merge.allOf);
  }

  if (Object.prototype.hasOwnProperty.call(merge, 'anyOf')) {
    result.anyOf = handleSchemaList(source.anyOf, merge.anyOf);
  }

  if (Object.prototype.hasOwnProperty.call(merge, 'oneOf')) {
    result.oneOf = handleSchemaList(source.oneOf, merge.oneOf);
  }

  return result;
}

export function mergeJsonSchema(sourceJsonSchema: unknown, mergeJsonSchemaValue: unknown): unknown {
  return handleSchema(sourceJsonSchema, mergeJsonSchemaValue);
}

export default mergeJsonSchema;
