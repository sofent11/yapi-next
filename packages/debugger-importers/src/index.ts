import YAML from 'yaml';
import {
  createDefaultEnvironment,
  createDefaultProject,
  createEmptyRequest,
  type CaseDocument,
  type EnvironmentDocument,
  type ImportResult,
  type RequestDocument,
  type ResponseExample
} from '@yapi-debugger/schema';

type ImportedRequestRecord = {
  folderSegments: string[];
  request: RequestDocument;
  cases: CaseDocument[];
};

type ImportContext = {
  projectName: string;
  requests: ImportedRequestRecord[];
  environments: EnvironmentDocument[];
};

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;

function parseStructuredText(content: string) {
  try {
    return JSON.parse(content) as Record<string, any>;
  } catch (_err) {
    return YAML.parse(content) as Record<string, any>;
  }
}

function toRows(items: unknown, keyName = 'name', valueName = 'value') {
  if (!Array.isArray(items)) return [];
  return items
    .map(item => item as Record<string, unknown>)
    .map(item => ({
      name: String(item[keyName] || item.key || ''),
      value: String(item[valueName] || item.value || ''),
      enabled: item.disabled ? false : true,
      description: String(item.description || item.desc || ''),
      kind: 'text' as const
    }))
    .filter(item => item.name);
}

function normalizePath(raw: string) {
  if (!raw) return '/';
  try {
    const parsed = new URL(raw);
    return parsed.pathname || '/';
  } catch (_err) {
    return raw.startsWith('/') ? raw : `/${raw}`;
  }
}

function normalizeUrl(raw: string) {
  if (!raw) return '';
  return raw;
}

function methodLabel(input: string) {
  const upper = input.toUpperCase();
  return (['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(upper) ? upper : 'GET') as RequestDocument['method'];
}

function inferMimeType(contentType: string | undefined, text: string) {
  if (contentType) return contentType;
  if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
    return 'application/json';
  }
  return 'text/plain';
}

function exampleFromSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return null;
  if ('example' in schema) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length > 0) return schema.examples[0];
  if (schema.default != null) return schema.default;
  switch (schema.type) {
    case 'object': {
      const output: Record<string, unknown> = {};
      const properties = schema.properties || {};
      Object.keys(properties).forEach(key => {
        output[key] = exampleFromSchema(properties[key]);
      });
      return output;
    }
    case 'array':
      return [exampleFromSchema(schema.items || { type: 'string' })];
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'string':
      if (schema.format === 'date-time') return new Date().toISOString();
      return '';
    default:
      return null;
  }
}

function prettyText(value: unknown) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch (_err) {
    return '';
  }
}

function pickContent(content: Record<string, any> | undefined) {
  if (!content || typeof content !== 'object') return null;
  const entries = Object.entries(content);
  if (entries.length === 0) return null;
  const preferred = entries.find(([type]) => type.includes('json')) || entries[0];
  return {
    mimeType: preferred[0],
    schema: preferred[1]?.schema,
    example: preferred[1]?.example ?? preferred[1]?.examples?.default?.value
  };
}

function pushRequest(context: ImportContext, folderSegments: string[], request: RequestDocument) {
  context.requests.push({
    folderSegments,
    request,
    cases: []
  });
}

function importOpenApiLike(document: Record<string, any>): ImportResult {
  const project = createDefaultProject(document.info?.title || 'Imported API');
  const environments = [createDefaultEnvironment('shared')];
  const requests: ImportedRequestRecord[] = [];
  const isSwagger2 = String(document.swagger || '').startsWith('2.');
  const serverUrl =
    document.servers?.[0]?.url ||
    (document.host
      ? [document.schemes?.[0] || 'http', '://', document.host, document.basePath || ''].join('')
      : '{{baseUrl}}');

  Object.entries(document.paths || {}).forEach(([pathKey, pathItem]) => {
    const commonParameters = Array.isArray((pathItem as any)?.parameters) ? (pathItem as any).parameters : [];
    HTTP_METHODS.forEach(methodKey => {
      const operation = (pathItem as any)?.[methodKey];
      if (!operation) return;

      const parameters = [...commonParameters, ...(Array.isArray(operation.parameters) ? operation.parameters : [])];
      const query = parameters.filter(param => param.in === 'query').map(param => ({
        name: String(param.name || ''),
        value: param.example != null ? String(param.example) : '',
        enabled: true,
        description: String(param.description || ''),
        kind: 'text' as const
      }));
      const headers = parameters.filter(param => param.in === 'header').map(param => ({
        name: String(param.name || ''),
        value: param.example != null ? String(param.example) : '',
        enabled: true,
        description: String(param.description || ''),
        kind: 'text' as const
      }));
      const pathParams = parameters.filter(param => param.in === 'path').map(param => ({
        name: String(param.name || ''),
        value: param.example != null ? String(param.example) : '',
        enabled: true,
        description: String(param.description || ''),
        kind: 'text' as const
      }));

      let body: RequestDocument['body'] = {
        mode: 'none' as const,
        mimeType: '',
        text: '',
        fields: []
      };

      if (isSwagger2) {
        const bodyParam = parameters.find(param => param.in === 'body' || param.in === 'formData');
        if (bodyParam?.in === 'body') {
          const example = exampleFromSchema(bodyParam.schema);
          body = {
            mode: 'json',
            mimeType: 'application/json',
            text: prettyText(example),
            fields: []
          };
        } else if (bodyParam?.in === 'formData') {
          body = {
            mode: 'multipart',
            mimeType: 'multipart/form-data',
            text: '',
            fields: parameters
              .filter(param => param.in === 'formData')
              .map(param => ({
                name: String(param.name || ''),
                value: '',
                enabled: true,
                description: String(param.description || ''),
                kind: param.type === 'file' ? 'file' : 'text'
              }))
          };
        }
      } else {
        const selected = pickContent(operation.requestBody?.content);
        if (selected) {
          const example = selected.example ?? exampleFromSchema(selected.schema);
          body = {
            mode: selected.mimeType.includes('json') ? 'json' : 'text',
            mimeType: selected.mimeType,
            text: prettyText(example),
            fields: []
          };
        }
      }

      const responses = Object.entries(operation.responses || {});
      const examples: ResponseExample[] = responses
        .slice(0, 3)
        .map(([status, response]) => {
          const selected = isSwagger2
            ? {
                mimeType: ((response as any).produces || ['application/json'])[0],
                example: (response as any).examples || exampleFromSchema((response as any).schema)
              }
            : pickContent((response as any).content);

          return {
            name: `response-${status}`,
            status: Number(status) || undefined,
            mimeType: selected?.mimeType || 'application/json',
            text: prettyText(selected?.example ?? {})
          };
        })
        .filter(item => item.text.trim());

      const request: RequestDocument = {
        ...createEmptyRequest(operation.summary || operation.operationId || pathKey),
        name: operation.summary || operation.operationId || pathKey,
        method: methodLabel(methodKey),
        url: normalizeUrl(serverUrl ? `${serverUrl}${pathKey}` : pathKey),
        path: normalizePath(pathKey),
        description: operation.description || operation.summary || '',
        tags: Array.isArray(operation.tags) ? operation.tags : [],
        headers,
        query,
        pathParams,
        body,
        auth: { type: 'inherit' as const },
        examples
      };

      pushRequest(
        { projectName: project.name, requests, environments },
        Array.isArray(operation.tags) && operation.tags.length > 0 ? [String(operation.tags[0])] : [],
        request
      );
    });
  });

  return {
    detectedFormat: isSwagger2 ? 'swagger2' : 'openapi3',
    summary: {
      requests: requests.length,
      folders: new Set(requests.map(item => item.folderSegments.join('/')).filter(Boolean)).size,
      environments: environments.length
    },
    project,
    environments,
    requests
  };
}

function importHar(document: Record<string, any>): ImportResult {
  const project = createDefaultProject(document.log?.creator?.name || 'Imported HAR');
  const requests: ImportedRequestRecord[] = [];
  const environments = [createDefaultEnvironment('shared')];
  const entries = Array.isArray(document.log?.entries) ? document.log.entries : [];

  entries.forEach((entry: any) => {
    const url = String(entry.request?.url || '');
    const request: RequestDocument = {
      ...createEmptyRequest(normalizePath(url)),
      name: `${entry.request?.method || 'GET'} ${normalizePath(url)}`,
      method: methodLabel(entry.request?.method || 'GET'),
      url,
      path: normalizePath(url),
      headers: toRows(entry.request?.headers, 'name', 'value'),
      query: toRows(entry.request?.queryString, 'name', 'value'),
      pathParams: [],
      body:
        entry.request?.postData?.text
          ? {
              mode: String(entry.request?.postData?.mimeType || '').includes('json') ? 'json' : 'text',
              mimeType: String(entry.request?.postData?.mimeType || 'text/plain'),
              text: String(entry.request?.postData?.text || ''),
              fields: []
            }
          : {
              mode: 'none',
              mimeType: '',
              text: '',
              fields: []
            },
      auth: { type: 'inherit' as const },
      examples: [
        {
          name: 'response',
          status: Number(entry.response?.status || 0) || undefined,
          mimeType: inferMimeType(entry.response?.content?.mimeType, String(entry.response?.content?.text || '')),
          text: String(entry.response?.content?.text || '')
        }
      ].filter(item => item.text.trim())
    };

    let folderName = 'captured';
    try {
      folderName = new URL(url).hostname || 'captured';
    } catch (_err) {
      folderName = 'captured';
    }

    pushRequest(
      { projectName: project.name, requests, environments },
      [folderName],
      request
    );
  });

  return {
    detectedFormat: 'har',
    summary: {
      requests: requests.length,
      folders: new Set(requests.map(item => item.folderSegments.join('/')).filter(Boolean)).size,
      environments: environments.length
    },
    project,
    environments,
    requests
  };
}

function walkPostmanItems(
  items: any[],
  folderSegments: string[],
  requests: ImportedRequestRecord[],
  environments: EnvironmentDocument[]
) {
  items.forEach(item => {
    if (Array.isArray(item.item)) {
      walkPostmanItems(item.item, [...folderSegments, String(item.name || 'Folder')], requests, environments);
      return;
    }

    const requestSource = item.request || {};
    const urlValue = requestSource.url;
    const rawUrl =
      typeof urlValue === 'string' ? urlValue : String(urlValue?.raw || urlValue?.host?.join?.('.') || '');
    const body = requestSource.body || {};
    const headers = toRows(requestSource.header, 'key', 'value');

    const document: RequestDocument = {
      ...createEmptyRequest(String(item.name || normalizePath(rawUrl))),
      name: String(item.name || normalizePath(rawUrl)),
      method: methodLabel(String(requestSource.method || 'GET')),
      url: rawUrl,
      path: normalizePath(rawUrl),
      description: String(requestSource.description || ''),
      headers,
      query: toRows(urlValue?.query, 'key', 'value'),
      pathParams: [],
      body:
        body.mode === 'raw'
          ? {
              mode: headers.some((row: any) => row.name.toLowerCase() === 'content-type' && row.value.includes('json'))
                ? 'json'
                : 'text',
              mimeType:
                headers.find((row: any) => row.name.toLowerCase() === 'content-type')?.value || 'text/plain',
              text: String(body.raw || ''),
              fields: []
            }
          : body.mode === 'urlencoded' || body.mode === 'formdata'
            ? {
                mode: body.mode === 'formdata' ? 'multipart' : 'form-urlencoded',
                mimeType: body.mode === 'formdata' ? 'multipart/form-data' : 'application/x-www-form-urlencoded',
                text: '',
                fields: toRows(body[body.mode], 'key', 'value').map(row => ({
                  ...row,
                  kind: body.mode === 'formdata' ? 'file' : 'text'
                }))
              }
            : {
                mode: 'none',
                mimeType: '',
                text: '',
                fields: []
              },
      auth: { type: 'inherit' as const },
      examples: Array.isArray(item.response)
        ? item.response
            .slice(0, 3)
            .map((response: any, index: number) => ({
              name: `saved-${index + 1}`,
              status: Number(response.code || 0) || undefined,
              mimeType: inferMimeType(response.header?.find?.((header: any) => header.key === 'Content-Type')?.value, String(response.body || '')),
              text: String(response.body || '')
            }))
            .filter((example: ResponseExample) => example.text.trim())
        : []
    };

    requests.push({
      folderSegments,
      request: document,
      cases: []
    });
  });
}

function importPostman(document: Record<string, any>): ImportResult {
  const project = createDefaultProject(document.info?.name || 'Imported Collection');
  const environments = [createDefaultEnvironment('shared')];
  const requests: ImportedRequestRecord[] = [];
  walkPostmanItems(Array.isArray(document.item) ? document.item : [], [], requests, environments);

  return {
    detectedFormat: 'postman',
    summary: {
      requests: requests.length,
      folders: new Set(requests.map(item => item.folderSegments.join('/')).filter(Boolean)).size,
      environments: environments.length
    },
    project,
    environments,
    requests
  };
}

export function importSourceText(content: string): ImportResult {
  const document = parseStructuredText(content);
  if (document.openapi) {
    return importOpenApiLike(document);
  }
  if (document.swagger) {
    return importOpenApiLike(document);
  }
  if (document.log?.entries) {
    return importHar(document);
  }
  if (document.info?.schema || document.info?.name || document.item) {
    return importPostman(document);
  }

  return {
    detectedFormat: 'unknown',
    summary: { requests: 0, folders: 0, environments: 1 },
    project: createDefaultProject('Imported Workspace'),
    environments: [createDefaultEnvironment('shared')],
    requests: []
  };
}
