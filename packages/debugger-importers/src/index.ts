import YAML from 'yaml';
import {
  createDefaultEnvironment,
  createDefaultProject,
  createEmptyCase,
  createEmptyRequest,
  type CaseDocument,
  type EnvironmentDocument,
  type ImportWarning,
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
  warnings: ImportWarning[];
};

function authProfileVariableName(seed: string, suffix: string) {
  const base = String(seed || 'auth')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part, index) => (index === 0 ? part.toLowerCase() : `${part.charAt(0).toUpperCase()}${part.slice(1)}`))
    .join('');
  return `${base || 'auth'}${suffix}`;
}

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

function shouldEnableImportedParameter(param: Record<string, any>) {
  if (param.required === true || param.in === 'path') return true;
  if (param.example != null) return true;
  if (param.default != null) return true;
  if (param.schema?.example != null) return true;
  if (param.schema?.default != null) return true;
  return false;
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
  const warnings: ImportWarning[] = [];
  const isSwagger2 = String(document.swagger || '').startsWith('2.');
  const hasSecuritySchemes = Boolean(
    document.securityDefinitions ||
      document.components?.securitySchemes ||
      (Array.isArray(document.security) && document.security.length > 0)
  );
  const serverUrl =
    document.servers?.[0]?.url ||
    (document.host
      ? [document.schemes?.[0] || 'http', '://', document.host, document.basePath || ''].join('')
      : '{{baseUrl}}');
  if (serverUrl && serverUrl !== '{{baseUrl}}') {
    project.runtime.baseUrl = serverUrl;
  }

  const securitySchemes = document.components?.securitySchemes || document.securityDefinitions || {};
  const sharedEnvironment = environments[0];
  Object.entries(securitySchemes).forEach(([schemeName, scheme]) => {
    const source = scheme as Record<string, any>;
    if (source.type === 'http' && String(source.scheme || '').toLowerCase() === 'bearer') {
      const tokenVar = authProfileVariableName(schemeName, 'Token');
      sharedEnvironment.vars[tokenVar] = sharedEnvironment.vars[tokenVar] || '';
      sharedEnvironment.authProfiles.push({
        name: String(schemeName),
        auth: {
          type: 'bearer',
          tokenFromVar: tokenVar
        }
      });
      return;
    }

    if (source.type === 'http' && String(source.scheme || '').toLowerCase() === 'basic') {
      const usernameVar = authProfileVariableName(schemeName, 'Username');
      const passwordVar = authProfileVariableName(schemeName, 'Password');
      sharedEnvironment.vars[usernameVar] = sharedEnvironment.vars[usernameVar] || '';
      sharedEnvironment.vars[passwordVar] = sharedEnvironment.vars[passwordVar] || '';
      sharedEnvironment.authProfiles.push({
        name: String(schemeName),
        auth: {
          type: 'basic',
          usernameFromVar: usernameVar,
          passwordFromVar: passwordVar
        }
      });
      return;
    }

    if (source.type === 'apiKey') {
      const valueVar = authProfileVariableName(schemeName, 'Value');
      sharedEnvironment.vars[valueVar] = sharedEnvironment.vars[valueVar] || '';
      sharedEnvironment.authProfiles.push({
        name: String(schemeName),
        auth: {
          type: 'apikey',
          key: String(source.name || 'X-API-Key'),
          addTo: source.in === 'query' ? 'query' : 'header',
          valueFromVar: valueVar
        }
      });
      return;
    }

    if (source.type === 'oauth2' || source.type === 'openIdConnect') {
      const clientCredentials = source.type === 'oauth2' ? source.flows?.clientCredentials : null;
      if (clientCredentials?.tokenUrl) {
        const clientIdVar = authProfileVariableName(schemeName, 'ClientId');
        const clientSecretVar = authProfileVariableName(schemeName, 'ClientSecret');
        sharedEnvironment.vars[clientIdVar] = sharedEnvironment.vars[clientIdVar] || '';
        sharedEnvironment.vars[clientSecretVar] = sharedEnvironment.vars[clientSecretVar] || '';
        sharedEnvironment.authProfiles.push({
          name: String(schemeName),
          auth: {
            type: 'oauth2',
            oauthFlow: 'client_credentials',
            tokenUrl: String(clientCredentials.tokenUrl),
            clientIdFromVar: clientIdVar,
            clientSecretFromVar: clientSecretVar,
            scope: Object.keys(clientCredentials.scopes || {}).join(' '),
            tokenPlacement: 'header',
            tokenName: 'Authorization',
            tokenPrefix: 'Bearer'
          }
        });
        warnings.push({
          level: 'info',
          scope: 'project',
          code: 'oauth-client-credentials-mapped',
          status: 'compatible',
          message: `${schemeName}: OAuth2 client credentials was mapped to an editable environment auth profile.`
        });
        return;
      }

      warnings.push({
        level: 'warning',
        scope: 'project',
        code: 'oauth-review',
        status: 'unsupported',
        message: `${schemeName}: OAuth/OpenID Connect definitions were detected, but only OAuth2 client credentials is supported automatically right now.`
      });
    }
  });

  Object.entries(document.paths || {}).forEach(([pathKey, pathItem]) => {
    const commonParameters = Array.isArray((pathItem as any)?.parameters) ? (pathItem as any).parameters : [];
    HTTP_METHODS.forEach(methodKey => {
      const operation = (pathItem as any)?.[methodKey];
      if (!operation) return;
      if (hasSecuritySchemes || (Array.isArray(operation.security) && operation.security.length > 0)) {
        warnings.push({
          level: 'info',
          scope: 'request',
          requestName: operation.summary || operation.operationId || pathKey,
          code: 'auth-review',
          status: 'degraded',
          message: `${operation.summary || operation.operationId || pathKey}: security requirements were detected and should be reviewed in Environment/Auth settings after import.`
        });
      }

      const parameters = [...commonParameters, ...(Array.isArray(operation.parameters) ? operation.parameters : [])];
      const query = parameters.filter(param => param.in === 'query').map(param => ({
        name: String(param.name || ''),
        value: param.example != null ? String(param.example) : '',
        enabled: shouldEnableImportedParameter(param),
        description: String(param.description || ''),
        kind: 'text' as const
      }));
      const headers = parameters.filter(param => param.in === 'header').map(param => ({
        name: String(param.name || ''),
        value: param.example != null ? String(param.example) : '',
        enabled: shouldEnableImportedParameter(param),
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
                enabled: shouldEnableImportedParameter(param),
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
            role: 'example' as const,
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
        url: normalizeUrl(`{{baseUrl}}${pathKey}`),
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

      const securityName = Array.isArray(operation.security) && operation.security.length > 0
        ? Object.keys(operation.security[0] || {})[0]
        : Array.isArray(document.security) && document.security.length > 0
          ? Object.keys(document.security[0] || {})[0]
          : '';
      if (securityName && sharedEnvironment.authProfiles.some(profile => profile.name === securityName)) {
        request.auth = {
          type: 'profile',
          profileName: securityName
        };
      }

      pushRequest(
        { projectName: project.name, requests, environments, warnings },
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
    requests,
    warnings
  };
}

function importHar(document: Record<string, any>): ImportResult {
  const project = createDefaultProject(document.log?.creator?.name || 'Imported HAR');
  const requests: ImportedRequestRecord[] = [];
  const environments = [createDefaultEnvironment('shared')];
  const warnings: ImportWarning[] = [];
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
          role: 'example' as const,
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
      { projectName: project.name, requests, environments, warnings },
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
    requests,
    warnings
  };
}

function extractPostmanScript(item: any, listen: 'prerequest' | 'test') {
  const events = Array.isArray(item?.event) ? item.event : [];
  const matched = events.filter((event: any) => event?.listen === listen);
  if (matched.length === 0) return '';
  return matched
    .map((event: any) => Array.isArray(event?.script?.exec) ? event.script.exec.join('\n') : String(event?.script?.exec || ''))
    .filter(Boolean)
    .join('\n\n');
}

function collectScriptWarnings(requestName: string, script: string, warnings: ImportWarning[]) {
  if (!script.trim()) return;
  if (script.includes('pm.test(') || script.includes('pm.expect(')) {
    warnings.push({
      level: 'info',
      scope: 'case',
      requestName,
      code: 'postman-script-kept',
      status: 'compatible',
      message: `${requestName}: Postman assertion/test script was preserved and may execute after import.`
    });
  }
  const unsupportedPatterns = [
    {
      token: 'pm.sendRequest',
      code: 'postman-send-request',
      status: 'degraded' as const,
      message: 'pm.sendRequest is supported in lite pre-request mode for common token-fetch flows, but complex usage still needs review.'
    },
    {
      token: 'pm.vault',
      code: 'postman-vault',
      status: 'unsupported' as const,
      message: 'pm.vault is not supported yet and was preserved as script text only.'
    },
    {
      token: 'postman.',
      code: 'postman-legacy-api',
      status: 'degraded' as const,
      message: 'Legacy postman.* APIs may not execute correctly and were preserved as script text only.'
    }
  ];

  unsupportedPatterns.forEach(pattern => {
    if (script.includes(pattern.token)) {
      warnings.push({
        level: 'warning',
        scope: 'case',
        requestName,
        code: pattern.code,
        status: pattern.status,
        message: `${requestName}: ${pattern.message}`
      });
    }
  });
}

function walkPostmanItems(
  items: any[],
  folderSegments: string[],
  requests: ImportedRequestRecord[],
  environments: EnvironmentDocument[],
  warnings: ImportWarning[]
) {
  items.forEach(item => {
    if (Array.isArray(item.item)) {
      walkPostmanItems(item.item, [...folderSegments, String(item.name || 'Folder')], requests, environments, warnings);
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

    const prerequestScript = extractPostmanScript(item, 'prerequest');
    const postResponseScript = extractPostmanScript(item, 'test');
    const importedCases: CaseDocument[] = [];

    if (prerequestScript || postResponseScript) {
      collectScriptWarnings(document.name, `${prerequestScript}\n${postResponseScript}`, warnings);
      const importedCase = createEmptyCase(document.id, 'Imported Script Case');
      importedCase.scripts = {
        preRequest: prerequestScript,
        postResponse: postResponseScript
      };
      importedCases.push(importedCase);
    }

    requests.push({
      folderSegments,
      request: document,
      cases: importedCases
    });
  });
}

function importPostman(document: Record<string, any>): ImportResult {
  const project = createDefaultProject(document.info?.name || 'Imported Collection');
  const environments = [createDefaultEnvironment('shared')];
  const requests: ImportedRequestRecord[] = [];
  const warnings: ImportWarning[] = [];
  walkPostmanItems(Array.isArray(document.item) ? document.item : [], [], requests, environments, warnings);

  return {
    detectedFormat: 'postman',
    summary: {
      requests: requests.length,
      folders: new Set(requests.map(item => item.folderSegments.join('/')).filter(Boolean)).size,
      environments: environments.length
    },
    project,
    environments,
    requests,
    warnings
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
    requests: [],
    warnings: []
  };
}
