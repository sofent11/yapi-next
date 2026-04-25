import YAML from 'yaml';
import {
  createDefaultEnvironment,
  createDefaultProject,
  createEmptyCase,
  createCollectionStep,
  createEmptyCollection,
  createEmptyRequest,
  type CaseDocument,
  type CollectionDocument,
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

type BruSection = {
  label: string;
  content: string;
};

export type ImportFileEntry = {
  path: string;
  content: string;
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

function looksLikeBruno(content: string) {
  return /^\s*meta\s*\{/m.test(content) ||
    /^\s*type\s+http-request\s*$/m.test(content) ||
    /^\s*(get|post|put|patch|delete|head|options)\s*\{/mi.test(content);
}

function looksLikeInsomnia(document: Record<string, any>) {
  return String(document.__export_format || '').toLowerCase().includes('insomnia') ||
    String(document.type || '').toLowerCase().includes('insomnia') ||
    (Array.isArray(document.resources) && document.resources.some((item: any) => String(item?._type || '').startsWith('request')));
}

function looksLikeOpenCollection(document: Record<string, any>) {
  return typeof document.opencollection === 'string' && document.opencollection.trim().length > 0 &&
    document.info && typeof document.info === 'object';
}

function parseBruSections(content: string) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const sections: BruSection[] = [];
  const consumed = new Set<number>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = /^([A-Za-z][\w:-]*(?:\([^)]*\))?)\s*\{\s*$/.exec(line.trim());
    if (match) {
      const body: string[] = [];
      let cursor = index + 1;
      while (cursor < lines.length && lines[cursor] !== '}') {
        body.push(lines[cursor]);
        consumed.add(cursor);
        cursor += 1;
      }
      if (cursor < lines.length) {
        sections.push({ label: match[1], content: body.join('\n').replace(/\n$/, '') });
        consumed.add(index);
        consumed.add(cursor);
        index = cursor;
      }
      continue;
    }

    const legacyMatch = /^([A-Za-z][\w-]*(?:\([^)]*\))?)\s*$/.exec(line.trim());
    if (legacyMatch) {
      const closeName = legacyMatch[1].split('(')[0];
      const body: string[] = [];
      let cursor = index + 1;
      while (cursor < lines.length && lines[cursor].trim() !== `/${closeName}`) {
        body.push(lines[cursor]);
        consumed.add(cursor);
        cursor += 1;
      }
      if (cursor < lines.length) {
        sections.push({ label: legacyMatch[1], content: body.join('\n').replace(/\n$/, '') });
        consumed.add(index);
        consumed.add(cursor);
        index = cursor;
      }
    }
  }

  return {
    sections,
    prelude: lines.filter((_line, index) => !consumed.has(index)).join('\n')
  };
}

function parseBruKeyValueBlock(content: string) {
  const output: Record<string, string> = {};
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const colon = trimmed.indexOf(':');
    if (colon !== -1) {
      output[trimmed.slice(0, colon).trim()] = trimmed.slice(colon + 1).trim();
      return;
    }
    const match = /^([A-Za-z][\w-]*)\s+(.+)$/.exec(trimmed);
    if (match) output[match[1]] = match[2].trim();
  });
  return output;
}

function parseBruPrelude(content: string) {
  const output: Record<string, string> = {};
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = /^([A-Za-z][\w-]*)\s+(.+)$/.exec(trimmed);
    if (match) output[match[1]] = match[2].trim();
  });
  return output;
}

function findBruSection(sections: BruSection[], label: string) {
  return sections.find(section => section.label.toLowerCase() === label.toLowerCase());
}

function findBruBodySection(sections: BruSection[], mode: string) {
  const normalized = normalizeBruBodyMode(mode);
  const labels = new Set([
    `body:${normalized}`,
    `body(type=${normalized})`
  ]);
  if (normalized === 'form-urlencoded') {
    labels.add('body:formurlencoded');
  }
  if (normalized === 'multipart') {
    labels.add('body:multipart-form');
    labels.add('body:multipartform');
  }
  return sections.find(section => {
    const label = section.label.toLowerCase();
    return labels.has(label);
  });
}

function normalizeBruBodyMode(mode: string) {
  const normalized = mode.toLowerCase();
  if (normalized === 'formurlencoded' || normalized === 'form-urlencoded') return 'form-urlencoded';
  if (normalized === 'multipartform' || normalized === 'multipart-form') return 'multipart';
  return normalized;
}

function parseBruCollectionDocument(content: string, name: string): CollectionDocument {
  const { sections } = parseBruSections(content);
  const authMeta = parseBruKeyValueBlock(findBruSection(sections, 'auth')?.content || '');
  const authMode = authMeta.mode || authMeta.type || 'inherit';
  const authBlock = parseBruKeyValueBlock(
    findBruSection(sections, `auth:${authMode}`)?.content ||
      findBruSection(sections, 'auth')?.content ||
      ''
  );
  const vars = Object.fromEntries(
    parseBruRows(findBruSection(sections, 'vars:pre-request')?.content || '')
      .filter(row => row.enabled !== false)
      .map(row => [row.name, row.value])
  );

  return {
    ...createEmptyCollection(name),
    name,
    headers: parseBruRows(findBruSection(sections, 'headers')?.content || ''),
    vars,
    auth: parseBruAuth(authMode, authBlock),
    scripts: {
      preRequest: findBruSection(sections, 'script:pre-request')?.content.trim() || '',
      postResponse: findBruSection(sections, 'script:post-response')?.content.trim() || '',
      tests: [
        findBruSection(sections, 'tests')?.content.trim() || '',
        findBruSection(sections, 'assert')?.content.trim() || ''
      ].filter(Boolean).join('\n\n')
    },
    docs: findBruSection(sections, 'docs')?.content.trim() || ''
  };
}

function normalizeImportPath(path: string) {
  return path.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '');
}

function basename(path: string) {
  return normalizeImportPath(path).split('/').filter(Boolean).at(-1) || '';
}

function dirnameSegments(path: string) {
  const segments = normalizeImportPath(path).split('/').filter(Boolean);
  return segments.slice(0, -1);
}

function folderNameMap(files: ImportFileEntry[]) {
  const map = new Map<string, string>();
  files.forEach(file => {
    if (basename(file.path).toLowerCase() !== 'folder.bru') return;
    const folderSegments = dirnameSegments(file.path);
    if (folderSegments.length === 0) return;
    const metadata = parseBruKeyValueBlock(findBruSection(parseBruSections(file.content).sections, 'meta')?.content || '');
    map.set(folderSegments.join('/'), metadata.name || folderSegments.at(-1) || 'Folder');
  });
  return map;
}

function displayFolderSegments(rawSegments: string[], names: Map<string, string>) {
  let current = '';
  return rawSegments.map(segment => {
    current = current ? `${current}/${segment}` : segment;
    return names.get(current) || segment;
  });
}

function parseBrunoProjectName(content: string | undefined) {
  if (!content) return 'Imported Bruno Collection';
  try {
    const parsed = JSON.parse(content) as { name?: string };
    return parsed.name || 'Imported Bruno Collection';
  } catch (_error) {
    return 'Imported Bruno Collection';
  }
}

function parseBruEnvironmentDocument(name: string, content: string): EnvironmentDocument {
  const { sections } = parseBruSections(content);
  const vars = Object.fromEntries(
    parseBruRows(findBruSection(sections, 'vars')?.content || '')
      .filter(row => row.enabled !== false)
      .map(row => [row.name, row.value])
  );
  parseBruArrayNames(findBruSection(sections, 'vars:secret')?.content || '').forEach(secretName => {
    const normalizedName = secretName.startsWith('~') ? secretName.slice(1) : secretName;
    if (normalizedName && !(normalizedName in vars)) {
      vars[normalizedName] = '';
    }
  });

  return {
    ...createDefaultEnvironment(name),
    name,
    vars,
    sharedVars: vars,
    headers: [],
    sharedHeaders: [],
    authProfiles: [],
    overlayMode: 'standalone'
  };
}

function parseBruRows(content: string) {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const oldRow = /^([01])\s+(\S+)(?:\s+(.*))?$/.exec(line);
      if (oldRow) {
        return {
          name: oldRow[2],
          value: oldRow[3] || '',
          enabled: oldRow[1] === '1',
          description: '',
          kind: 'text' as const
        };
      }
      const colon = line.indexOf(':');
      const rawName = colon === -1 ? line : line.slice(0, colon).trim();
      const disabled = rawName.startsWith('~');
      return {
        name: disabled ? rawName.slice(1) : rawName,
        value: colon === -1 ? '' : line.slice(colon + 1).trim(),
        enabled: !disabled,
        description: '',
        kind: 'text' as const
      };
    })
    .filter(row => row.name);
}

function parseBruArrayNames(content: string) {
  return content
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => item.replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function parseBruAuth(mode: string, authBlock: Record<string, string>) {
  const normalized = mode.toLowerCase();
  if (!normalized || normalized === 'none') return { type: 'none' as const };
  if (normalized === 'inherit') return { type: 'inherit' as const };
  if (normalized === 'bearer') {
    return {
      type: 'bearer' as const,
      token: authBlock.token || ''
    };
  }
  if (normalized === 'basic') {
    return {
      type: 'basic' as const,
      username: authBlock.username || '',
      password: authBlock.password || ''
    };
  }
  if (normalized === 'apikey' || normalized === 'api-key') {
    return {
      type: 'apikey' as const,
      key: authBlock.key || authBlock.name || 'X-API-Key',
      value: authBlock.value || '',
      addTo: authBlock.placement === 'query' || authBlock.in === 'query' ? 'query' as const : 'header' as const
    };
  }
  if (normalized === 'oauth2') {
    return {
      type: 'oauth2' as const,
      oauthFlow: authBlock.grant_type === 'client_credentials' ? 'client_credentials' as const : undefined,
      tokenUrl: authBlock.access_token_url || authBlock.token_url || '',
      clientId: authBlock.client_id || '',
      clientSecret: authBlock.client_secret || '',
      scope: authBlock.scope || '',
      tokenPlacement: authBlock.token_placement === 'query' ? 'query' as const : 'header' as const,
      tokenName: authBlock.token_placement === 'query' ? 'access_token' : 'Authorization',
      tokenPrefix: authBlock.token_header_prefix || 'Bearer'
    };
  }
  if (normalized === 'digest') {
    return {
      type: 'digest' as const,
      username: authBlock.username || '',
      password: authBlock.password || '',
      realm: authBlock.realm || '',
      nonce: authBlock.nonce || '',
      qop: authBlock.qop || 'auth',
      algorithm: authBlock.algorithm || 'MD5'
    };
  }
  if (normalized === 'ntlm') {
    return {
      type: 'ntlm' as const,
      username: authBlock.username || '',
      password: authBlock.password || '',
      domain: authBlock.domain || '',
      workstation: authBlock.workstation || ''
    };
  }
  if (normalized === 'oauth1') {
    return {
      type: 'oauth1' as const,
      consumerKey: authBlock.consumer_key || authBlock.consumerKey || '',
      consumerSecret: authBlock.consumer_secret || authBlock.consumerSecret || '',
      token: authBlock.access_token || '',
      secretKey: authBlock.token_secret || '',
      signatureMethod: authBlock.signature_method || authBlock.signatureMethod || 'HMAC-SHA1',
      nonce: authBlock.nonce || '',
      version: authBlock.version || '1.0',
      realm: authBlock.realm || ''
    };
  }
  if (normalized === 'awsv4') {
    return {
      type: 'awsv4' as const,
      accessKey: authBlock.accessKeyId || authBlock.access_key || '',
      secretKey: authBlock.secretAccessKey || authBlock.secret_key || '',
      sessionToken: authBlock.sessionToken || authBlock.session_token || '',
      service: authBlock.service || '',
      region: authBlock.region || ''
    };
  }
  if (normalized === 'wsse') {
    return {
      type: 'wsse' as const,
      username: authBlock.username || '',
      password: authBlock.password || ''
    };
  }
  return { type: 'inherit' as const };
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
    collections: [],
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
    collections: [],
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
    collections: [],
    warnings
  };
}

function insomniaRows(items: unknown, keyName = 'name', valueName = 'value') {
  return toRows(items, keyName, valueName).map(row => ({
    ...row,
    value: insomniaTemplate(row.value),
    enabled: row.enabled !== false
  }));
}

function insomniaTemplate(value: string) {
  return String(value || '').replace(/\{\{\s*_\.(.+?)\s*\}\}/g, (_match, name: string) => `{{${name.trim()}}}`);
}

function insomniaFolderSegments(
  parentId: string | undefined,
  groupsById: Map<string, any>,
  workspaceIds: Set<string>
) {
  const reversed: string[] = [];
  let cursor = parentId || '';
  const visited = new Set<string>();
  while (cursor && !workspaceIds.has(cursor) && !visited.has(cursor)) {
    visited.add(cursor);
    const group = groupsById.get(cursor);
    if (!group) break;
    reversed.push(String(group.name || 'Folder'));
    cursor = String(group.parentId || '');
  }
  return reversed.reverse();
}

function insomniaBody(body: any): RequestDocument['body'] {
  const mimeType = String(body?.mimeType || '');
  const text = insomniaTemplate(String(body?.text || ''));
  const params = Array.isArray(body?.params) ? body.params : [];
  if (params.length > 0 || mimeType.includes('x-www-form-urlencoded') || mimeType.includes('multipart/form-data')) {
    const isMultipart = mimeType.includes('multipart/form-data');
    return {
      mode: isMultipart ? 'multipart' : 'form-urlencoded',
      mimeType: isMultipart ? 'multipart/form-data' : 'application/x-www-form-urlencoded',
      text: '',
      fields: insomniaRows(params).map(row => ({
        ...row,
        kind: isMultipart && row.value.startsWith('@file(') ? 'file' : 'text'
      }))
    };
  }
  if (!text.trim()) {
    return {
      mode: 'none',
      mimeType: '',
      text: '',
      fields: []
    };
  }
  if (mimeType.includes('json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
    return {
      mode: 'json',
      mimeType: mimeType || 'application/json',
      text,
      fields: []
    };
  }
  if (mimeType.includes('xml')) {
    return {
      mode: 'xml',
      mimeType: mimeType || 'application/xml',
      text,
      fields: []
    };
  }
  return {
    mode: 'text',
    mimeType: mimeType || 'text/plain',
    text,
    fields: []
  };
}

function insomniaAuth(authentication: any): RequestDocument['auth'] {
  const type = String(authentication?.type || '').toLowerCase();
  if (!type || type === 'none') return { type: 'inherit' };
  if (type === 'bearer') {
    return {
      type: 'bearer',
      token: insomniaTemplate(String(authentication.token || ''))
    };
  }
  if (type === 'basic') {
    return {
      type: 'basic',
      username: insomniaTemplate(String(authentication.username || '')),
      password: insomniaTemplate(String(authentication.password || ''))
    };
  }
  if (type === 'apikey' || type === 'apiKey'.toLowerCase()) {
    return {
      type: 'apikey',
      key: String(authentication.key || authentication.name || 'X-API-Key'),
      value: insomniaTemplate(String(authentication.value || '')),
      addTo: authentication.addTo === 'query' || authentication.in === 'query' ? 'query' : 'header'
    };
  }
  if (type === 'oauth2') {
    return {
      type: 'oauth2',
      oauthFlow: authentication.grantType === 'client_credentials' ? 'client_credentials' : undefined,
      tokenUrl: insomniaTemplate(String(authentication.accessTokenUrl || authentication.tokenUrl || '')),
      clientId: insomniaTemplate(String(authentication.clientId || '')),
      clientSecret: insomniaTemplate(String(authentication.clientSecret || '')),
      scope: String(authentication.scope || '')
    };
  }
  return { type: 'inherit' };
}

function importInsomnia(document: Record<string, any>): ImportResult {
  const resources = Array.isArray(document.resources) ? document.resources : [];
  const workspaces = resources.filter((item: any) => item?._type === 'workspace');
  const workspaceIds = new Set(workspaces.map((item: any) => String(item._id || '')));
  const projectName = String(workspaces[0]?.name || document.name || 'Imported Insomnia Collection');
  const project = createDefaultProject(projectName);
  const groupsById = new Map(
    resources
      .filter((item: any) => item?._type === 'request_group')
      .map((item: any) => [String(item._id || ''), item])
  );
  const environments = resources
    .filter((item: any) => item?._type === 'environment')
    .map((item: any) => {
      const data = item.data && typeof item.data === 'object' ? item.data : {};
      return {
        ...createDefaultEnvironment(String(item.name || 'shared')),
        name: String(item.name || 'shared'),
        vars: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value ?? '')])),
        sharedVars: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value ?? '')])),
        headers: [],
        sharedHeaders: [],
        authProfiles: [],
        overlayMode: 'standalone' as const
      };
    });
  const warnings: ImportWarning[] = [];
  const requests: ImportedRequestRecord[] = resources
    .filter((item: any) => item?._type === 'request')
    .map((item: any) => {
      const request = {
        ...createEmptyRequest(String(item.name || item.url || 'Insomnia Request')),
        name: String(item.name || normalizePath(String(item.url || ''))),
        method: methodLabel(String(item.method || 'GET')),
        url: insomniaTemplate(String(item.url || '')),
        path: normalizePath(insomniaTemplate(String(item.url || ''))),
        description: String(item.description || ''),
        headers: insomniaRows(item.headers),
        query: insomniaRows(item.parameters),
        pathParams: [],
        body: insomniaBody(item.body),
        auth: insomniaAuth(item.authentication),
        examples: []
      };
      return {
        folderSegments: insomniaFolderSegments(String(item.parentId || ''), groupsById, workspaceIds),
        request,
        cases: []
      };
    });

  if (requests.length > 0) {
    warnings.push({
      level: 'info',
      scope: 'project',
      code: 'insomnia-import',
      status: 'compatible',
      message: `${projectName}: Insomnia export imported with ${requests.length} request${requests.length === 1 ? '' : 's'}.`
    });
  }

  return {
    detectedFormat: 'insomnia',
    summary: {
      requests: requests.length,
      folders: new Set(requests.map(item => item.folderSegments.join('/')).filter(Boolean)).size,
      environments: environments.length || 1
    },
    project,
    environments: environments.length > 0 ? environments : [createDefaultEnvironment('shared')],
    requests,
    collections: [],
    warnings
  };
}

function openCollectionRows(items: unknown) {
  if (!Array.isArray(items)) return [];
  return items
    .map(item => item as Record<string, any>)
    .map(item => ({
      name: String(item.name || item.key || ''),
      value: Array.isArray(item.value) ? item.value.map(String).join(',') : String(item.value ?? ''),
      enabled: item.disabled !== true,
      description: typeof item.description === 'string' ? item.description : String(item.description?.content || item.desc || ''),
      kind: item.type === 'file' ? 'file' as const : 'text' as const,
      filePath: item.type === 'file' ? String(Array.isArray(item.value) ? item.value[0] || '' : item.value || '') : undefined
    }))
    .filter(item => item.name);
}

function openCollectionParamRows(items: unknown, type: 'query' | 'path') {
  if (!Array.isArray(items)) return [];
  return openCollectionRows(
    items.filter((item: any) => String(item?.type || 'query').toLowerCase() === type)
  );
}

function openCollectionScalar(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'data' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>).data ?? '');
  }
  if (value == null) return '';
  return String(value);
}

function openCollectionDescription(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'content' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>).content ?? '');
  }
  return '';
}

function openCollectionAssertions(runtime: any) {
  if (!Array.isArray(runtime?.assertions)) return '';
  return runtime.assertions
    .filter((assertion: any) => assertion?.disabled !== true && assertion?.expression)
    .map((assertion: any) => {
      const operator = String(assertion.operator || 'eq');
      const value = openCollectionScalar(assertion.value);
      return `// OpenCollection assertion: ${assertion.expression} ${operator} ${value}`;
    })
    .join('\n');
}

function openCollectionBody(body: any): RequestDocument['body'] {
  if (!body) {
    return {
      mode: 'none',
      mimeType: '',
      text: '',
      fields: []
    };
  }
  const type = String(body.type || '').toLowerCase();
  if (type === 'json' || type === 'text' || type === 'xml' || type === 'sparql') {
    return {
      mode: type as 'json' | 'text' | 'xml' | 'sparql',
      mimeType: type === 'json' ? 'application/json' : type === 'xml' ? 'application/xml' : 'text/plain',
      text: typeof body.data === 'string' ? body.data : JSON.stringify(body.data ?? '', null, 2),
      fields: []
    };
  }
  if (type === 'form-urlencoded' || type === 'multipart-form') {
    const multipart = type === 'multipart-form';
    return {
      mode: multipart ? 'multipart' : 'form-urlencoded',
      mimeType: multipart ? 'multipart/form-data' : 'application/x-www-form-urlencoded',
      text: '',
      fields: openCollectionRows(Array.isArray(body.data) ? body.data : []).map(row => ({
        ...row,
        kind: multipart && row.kind === 'file' ? 'file' : 'text'
      }))
    };
  }
  if (type === 'file') {
    const file = Array.isArray(body.data) ? body.data.find((item: any) => item?.selected !== false) || body.data[0] : null;
    return {
      mode: 'file',
      mimeType: file?.contentType || 'application/octet-stream',
      text: '',
      file: String(file?.filePath || ''),
      fields: []
    };
  }
  return {
    mode: 'none',
    mimeType: '',
    text: '',
    fields: []
  };
}

function openCollectionSelectedBody<T extends Record<string, any>>(body: T | Array<{ selected?: boolean; body?: T }> | undefined): T | undefined {
  if (!body) return undefined;
  if (Array.isArray(body)) {
    return body.find(item => item?.selected)?.body || body[0]?.body;
  }
  return body;
}

function openCollectionGraphqlBody(body: any): RequestDocument['body'] {
  const selected = openCollectionSelectedBody(body) || {};
  const query = String(selected.query || '');
  const variables = selected.variables == null
    ? '{}'
    : typeof selected.variables === 'string'
      ? selected.variables
      : JSON.stringify(selected.variables, null, 2);
  const operationName = selected.operationName ? String(selected.operationName) : undefined;
  const payload: Record<string, unknown> = { query };
  if (variables.trim()) {
    try {
      payload.variables = JSON.parse(variables);
    } catch (_error) {
      payload.variables = variables;
    }
  }
  if (operationName) payload.operationName = operationName;
  return {
    mode: 'graphql',
    mimeType: 'application/json',
    text: JSON.stringify(payload, null, 2),
    fields: [],
    graphql: {
      query,
      variables,
      operationName,
      schemaUrl: selected.schemaUrl ? String(selected.schemaUrl) : undefined
    }
  };
}

function openCollectionWebsocketBody(message: any): RequestDocument['body'] {
  const messages = (() => {
    if (!message) return [];
    if (Array.isArray(message)) {
      return message.map((item: any, index: number) => ({
        name: String(item.title || `message ${index + 1}`),
        body: openCollectionScalar(item.message?.data),
        enabled: item.selected !== false
      }));
    }
    if (typeof message === 'object' && 'data' in message) {
      return [{
        name: 'message 1',
        body: openCollectionScalar(message.data),
        enabled: true
      }];
    }
    return [];
  })();
  return {
    mode: 'none',
    mimeType: '',
    text: '',
    fields: [],
    websocket: {
      messages: messages.length > 0 ? messages : [{ name: 'Message 1', body: '', enabled: true }]
    }
  };
}

function openCollectionGrpcMessage(message: any) {
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) {
    const selected = message.find((item: any) => item?.selected !== false) || message[0];
    return typeof selected?.message === 'string' ? selected.message : '';
  }
  return '';
}

function splitGrpcMethod(method: string) {
  const normalized = method.replace(/^\/+/, '');
  const slashIndex = normalized.lastIndexOf('/');
  if (slashIndex !== -1) {
    return {
      service: normalized.slice(0, slashIndex),
      method: normalized.slice(slashIndex + 1)
    };
  }
  const dotIndex = normalized.lastIndexOf('.');
  if (dotIndex !== -1) {
    return {
      service: normalized.slice(0, dotIndex),
      method: normalized.slice(dotIndex + 1)
    };
  }
  return {
    service: '',
    method: normalized
  };
}

function openCollectionGrpcBody(grpc: any): RequestDocument['body'] {
  const methodParts = splitGrpcMethod(String(grpc.method || ''));
  return {
    mode: 'none',
    mimeType: 'application/grpc',
    text: '',
    fields: [],
    grpc: {
      protoFile: grpc.protoFilePath ? String(grpc.protoFilePath) : undefined,
      importPaths: Array.isArray(grpc.importPaths) ? grpc.importPaths.map((item: any) => String(item.path || item)).filter(Boolean) : [],
      service: methodParts.service,
      method: methodParts.method,
      message: openCollectionGrpcMessage(grpc.message)
    }
  };
}

function openCollectionAuth(auth: any): RequestDocument['auth'] {
  if (!auth) return { type: 'inherit' };
  if (auth === 'inherit') return { type: 'inherit' };
  const type = String(auth.type || '').toLowerCase();
  if (!type) return { type: 'inherit' };
  if (type === 'bearer') return { type: 'bearer', token: String(auth.token || '') };
  if (type === 'basic') return { type: 'basic', username: String(auth.username || ''), password: String(auth.password || '') };
  if (type === 'apikey') {
    return {
      type: 'apikey',
      key: String(auth.key || 'X-API-Key'),
      value: String(auth.value || ''),
      addTo: auth.placement === 'query' ? 'query' : 'header'
    };
  }
  if (type === 'digest') return { type: 'digest', username: String(auth.username || ''), password: String(auth.password || '') };
  if (type === 'ntlm') return { type: 'ntlm', username: String(auth.username || ''), password: String(auth.password || ''), domain: String(auth.domain || '') };
  if (type === 'wsse') return { type: 'wsse', username: String(auth.username || ''), password: String(auth.password || '') };
  if (type === 'awsv4') {
    return {
      type: 'awsv4',
      accessKey: String(auth.accessKeyId || ''),
      secretKey: String(auth.secretAccessKey || ''),
      sessionToken: String(auth.sessionToken || ''),
      service: String(auth.service || ''),
      region: String(auth.region || '')
    };
  }
  if (type === 'oauth1') {
    return {
      type: 'oauth1',
      consumerKey: String(auth.consumerKey || ''),
      consumerSecret: String(auth.consumerSecret || ''),
      token: String(auth.accessToken || ''),
      secretKey: String(auth.accessTokenSecret || ''),
      signatureMethod: String(auth.signatureMethod || 'HMAC-SHA1'),
      version: String(auth.version || '1.0'),
      realm: String(auth.realm || '')
    };
  }
  if (type === 'oauth2') {
    return {
      type: 'oauth2',
      oauthFlow: auth.grantType === 'client_credentials' ? 'client_credentials' : undefined,
      tokenUrl: String(auth.tokenUrl || auth.accessTokenUrl || ''),
      clientId: String(auth.clientId || ''),
      clientSecret: String(auth.clientSecret || ''),
      scope: String(auth.scope || '')
    };
  }
  return { type: 'inherit' };
}

function openCollectionScripts(runtime: any) {
  const scripts = runtime?.scripts || {};
  if (Array.isArray(scripts)) {
    const preRequest = scripts.find((script: any) => script?.type === 'before-request')?.code || '';
    const postResponse = scripts.find((script: any) => script?.type === 'after-response')?.code || '';
    const tests = [
      scripts.find((script: any) => script?.type === 'tests')?.code || '',
      openCollectionAssertions(runtime)
    ].filter(Boolean).join('\n\n');
    return {
      preRequest: String(preRequest),
      postResponse: String(postResponse),
      tests
    };
  }
  return {
    preRequest: String(scripts.preRequest || scripts.req || ''),
    postResponse: String(scripts.postResponse || scripts.res || ''),
    tests: [String(scripts.tests || ''), openCollectionAssertions(runtime)].filter(Boolean).join('\n\n')
  };
}

function openCollectionVariables(runtime: any): RequestDocument['vars'] {
  const req = Array.isArray(runtime?.variables)
    ? runtime.variables
        .map((variable: any) => ({
          name: String(variable.name || ''),
          value: openCollectionScalar(variable.value),
          enabled: variable.disabled !== true,
          description: openCollectionDescription(variable.description),
          kind: 'text' as const,
          scope: 'request' as const,
          secret: variable.secret === true
        }))
        .filter((variable: { name: string }) => variable.name)
    : [];
  return { req, res: [] };
}

function openCollectionRuntime(settings: any): RequestDocument['runtime'] {
  const timeoutMs = Number(settings?.timeout || 0);
  return {
    timeoutMs: timeoutMs > 0 ? timeoutMs : 30000,
    followRedirects: settings?.followRedirects !== false
  };
}

function openCollectionBaseRequest(info: any, url: string, kind: RequestDocument['kind']): RequestDocument {
  return {
    ...createEmptyRequest(String(info.name || url || 'OpenCollection Request')),
    kind,
    name: String(info.name || normalizePath(url)),
    url,
    path: normalizePath(url),
    description: '',
    tags: Array.isArray(info.tags) ? info.tags.map(String) : [],
    order: Number(info.seq || 0) || 0
  };
}

function pushOpenCollectionRequest(
  requests: ImportedRequestRecord[],
  folderSegments: string[],
  request: RequestDocument
) {
  requests.push({ folderSegments, request, cases: [] });
}

function walkOpenCollectionItems(
  items: any[],
  folderSegments: string[],
  requests: ImportedRequestRecord[],
  warnings: ImportWarning[]
) {
  items.forEach(item => {
    const info = item?.info || {};
    const type = String(
      info.type ||
      (item.items ? 'folder' : item.http ? 'http' : item.graphql ? 'graphql' : item.websocket ? 'websocket' : item.grpc ? 'grpc' : typeof item.script === 'string' ? 'script' : '')
    ).toLowerCase();
    if (type === 'folder') {
      walkOpenCollectionItems(Array.isArray(item.items) ? item.items : [], [...folderSegments, String(info.name || 'Folder')], requests, warnings);
      return;
    }
    if (type === 'http') {
      const http = item.http || {};
      const runtime = item.runtime || {};
      const request: RequestDocument = {
        ...openCollectionBaseRequest(info, String(http.url || ''), 'http'),
        method: methodLabel(String(http.method || 'GET')),
        description: openCollectionDescription(item.docs),
        headers: openCollectionRows(http.headers),
        query: openCollectionParamRows(http.params, 'query'),
        pathParams: openCollectionParamRows(http.params, 'path'),
        body: openCollectionBody(openCollectionSelectedBody(http.body) || http.body),
        auth: openCollectionAuth(http.auth),
        runtime: openCollectionRuntime(item.settings),
        vars: openCollectionVariables(runtime),
        scripts: openCollectionScripts(runtime),
        docs: openCollectionDescription(item.docs),
        examples: Array.isArray(item.examples)
          ? item.examples.slice(0, 3).map((example: any, index: number) => ({
              name: String(example.name || `example-${index + 1}`),
              role: 'example' as const,
              status: Number(example.response?.status || 0) || undefined,
              mimeType: example.response?.body?.type === 'json' ? 'application/json' : 'text/plain',
              text: typeof example.response?.body?.data === 'string'
                ? example.response.body.data
                : JSON.stringify(example.response?.body?.data ?? '', null, 2)
            })).filter((example: ResponseExample) => example.text.trim())
          : []
      };
      pushOpenCollectionRequest(requests, folderSegments, request);
      return;
    }

    if (type === 'graphql') {
      const graphql = item.graphql || {};
      const runtime = item.runtime || {};
      const request: RequestDocument = {
        ...openCollectionBaseRequest(info, String(graphql.url || ''), 'graphql'),
        method: methodLabel(String(graphql.method || 'POST')),
        description: openCollectionDescription(item.docs),
        headers: openCollectionRows(graphql.headers),
        query: openCollectionParamRows(graphql.params, 'query'),
        pathParams: openCollectionParamRows(graphql.params, 'path'),
        body: openCollectionGraphqlBody(graphql.body),
        auth: openCollectionAuth(graphql.auth),
        runtime: openCollectionRuntime(item.settings),
        vars: openCollectionVariables(runtime),
        scripts: openCollectionScripts(runtime),
        docs: openCollectionDescription(item.docs)
      };
      pushOpenCollectionRequest(requests, folderSegments, request);
      return;
    }

    if (type === 'websocket') {
      const websocket = item.websocket || {};
      const runtime = item.runtime || {};
      const request: RequestDocument = {
        ...openCollectionBaseRequest(info, String(websocket.url || ''), 'websocket'),
        method: 'GET',
        description: openCollectionDescription(item.docs),
        headers: openCollectionRows(websocket.headers),
        body: openCollectionWebsocketBody(websocket.message),
        auth: openCollectionAuth(websocket.auth),
        vars: openCollectionVariables(runtime),
        scripts: openCollectionScripts(runtime),
        docs: openCollectionDescription(item.docs)
      };
      pushOpenCollectionRequest(requests, folderSegments, request);
      return;
    }

    if (type === 'grpc') {
      const grpc = item.grpc || {};
      const runtime = item.runtime || {};
      const request: RequestDocument = {
        ...openCollectionBaseRequest(info, String(grpc.url || ''), 'grpc'),
        method: 'POST',
        description: openCollectionDescription(item.docs),
        headers: openCollectionRows(grpc.metadata),
        body: openCollectionGrpcBody(grpc),
        auth: openCollectionAuth(grpc.auth),
        vars: openCollectionVariables(runtime),
        scripts: openCollectionScripts(runtime),
        docs: openCollectionDescription(item.docs)
      };
      pushOpenCollectionRequest(requests, folderSegments, request);
      return;
    }

    if (type === 'script') {
      const request: RequestDocument = {
        ...openCollectionBaseRequest(info, '', 'script'),
        method: 'GET',
        description: openCollectionDescription(item.docs),
        body: {
          mode: 'text',
          mimeType: 'application/javascript',
          text: String(item.script || ''),
          fields: []
        },
        scripts: {
          preRequest: String(item.script || ''),
          postResponse: '',
          tests: ''
        },
        docs: openCollectionDescription(item.docs)
      };
      pushOpenCollectionRequest(requests, folderSegments, request);
      return;
    }

    if (type) {
      warnings.push({
        level: 'warning',
        scope: 'request',
        code: 'opencollection-item-review',
        status: 'degraded',
        message: `OpenCollection item type "${type}" was skipped in the current importer.`
      });
      return;
    }
  });
}

function importOpenCollection(document: Record<string, any>): ImportResult {
  const projectName = String(document.info?.name || 'Imported OpenCollection');
  const project = createDefaultProject(projectName);
  const environments = Array.isArray(document.config?.environments)
    ? document.config.environments.map((environment: any) => {
        const vars = Object.fromEntries(
          (Array.isArray(environment.variables) ? environment.variables : [])
            .filter((variable: any) => variable?.disabled !== true)
            .map((variable: any) => [
              String(variable.name || ''),
              variable.secret ? '' : typeof variable.value === 'object' ? String(variable.value?.data || '') : String(variable.value ?? '')
            ])
            .filter(([name]: [string, string]) => name)
        );
        return {
          ...createDefaultEnvironment(String(environment.name || 'shared')),
          name: String(environment.name || 'shared'),
          vars,
          sharedVars: vars,
          headers: [],
          sharedHeaders: [],
          authProfiles: [],
          overlayMode: 'standalone' as const
        };
      })
    : [];
  const requests: ImportedRequestRecord[] = [];
  const warnings: ImportWarning[] = [];
  walkOpenCollectionItems(Array.isArray(document.items) ? document.items : [], [], requests, warnings);
  warnings.push({
    level: 'info',
    scope: 'project',
    code: 'opencollection-import',
    status: 'compatible',
    message: `${projectName}: OpenCollection imported with ${requests.length} item${requests.length === 1 ? '' : 's'}.`
  });

  return {
    detectedFormat: 'opencollection',
    summary: {
      requests: requests.length,
      folders: new Set(requests.map(item => item.folderSegments.join('/')).filter(Boolean)).size,
      environments: environments.length || 1
    },
    project,
    environments: environments.length > 0 ? environments : [createDefaultEnvironment('shared')],
    requests,
    collections: [],
    warnings
  };
}

function importBruno(content: string): ImportResult {
  const { sections, prelude } = parseBruSections(content);
  const metadata = parseBruKeyValueBlock(findBruSection(sections, 'meta')?.content || '');
  const legacy = parseBruPrelude(prelude);
  const methodSection = sections.find(section => HTTP_METHODS.includes(section.label.toLowerCase() as any));
  const methodFields = parseBruKeyValueBlock(methodSection?.content || '');
  const method = methodLabel(methodSection?.label || legacy.method || 'GET');
  const name = metadata.name || legacy.name || methodFields.name || 'Imported Bruno Request';
  const url = methodFields.url || legacy.url || '';
  const bodyMode = normalizeBruBodyMode(methodFields.body || legacy['body-mode'] || 'none');
  const authMode = methodFields.auth || legacy.auth || 'inherit';
  const authBlock = parseBruKeyValueBlock(
    findBruSection(sections, `auth:${authMode}`)?.content ||
      findBruSection(sections, 'auth')?.content ||
      ''
  );
  const bodySection = findBruBodySection(sections, bodyMode);
  const graphqlVariablesSection = findBruSection(sections, 'body:graphql:vars');
  const docs = findBruSection(sections, 'docs')?.content.trim() || '';
  const preRequestScript = findBruSection(sections, 'script:pre-request')?.content.trim() || '';
  const postResponseScript = findBruSection(sections, 'script:post-response')?.content.trim() || '';
  const testScript = [
    findBruSection(sections, 'tests')?.content.trim() || '',
    findBruSection(sections, 'assert')?.content.trim() || ''
  ].filter(Boolean).join('\n\n');
  const genericScript = findBruSection(sections, 'script')?.content.trim() || '';
  const headers = parseBruRows(findBruSection(sections, 'headers')?.content || '');
  const query = parseBruRows(findBruSection(sections, 'params:query')?.content || findBruSection(sections, 'params')?.content || '');
  const pathParams = parseBruRows(findBruSection(sections, 'params:path')?.content || '');
  const warnings: ImportWarning[] = [];
  const unsupportedSections = sections
    .map(section => section.label)
    .filter(label => /^(body:grpc|grpc|body:ws|vars:|settings)/i.test(label));

  unsupportedSections.forEach(label => {
    warnings.push({
      level: 'warning',
      scope: 'request',
      requestName: name,
      code: 'bruno-section-review',
      status: 'degraded',
      message: `${name}: Bruno section "${label}" was preserved only where compatible and should be reviewed after import.`
    });
  });
  if (genericScript) {
    warnings.push({
      level: 'info',
      scope: 'request',
      requestName: name,
      code: 'bruno-script-kept',
      status: 'compatible',
      message: `${name}: Bruno script was preserved in request scripts for review.`
    });
  }

  const body =
    bodyMode === 'json' || bodyMode === 'graphql' || bodyMode === 'xml' || bodyMode === 'sparql' || bodyMode === 'text'
      ? {
          mode: bodyMode === 'graphql' ? 'graphql' as const : bodyMode === 'xml' ? 'xml' as const : bodyMode === 'sparql' ? 'sparql' as const : bodyMode === 'json' ? 'json' as const : 'text' as const,
          mimeType: bodyMode === 'json' || bodyMode === 'graphql'
            ? 'application/json'
            : bodyMode === 'xml'
              ? 'application/xml'
              : 'text/plain',
          text: bodySection?.content.trim() || '',
          fields: [],
          graphql: bodyMode === 'graphql'
            ? {
                query: bodySection?.content.trim() || '',
                variables: graphqlVariablesSection?.content.trim() || '{}'
              }
            : undefined
        }
      : bodyMode === 'form-urlencoded'
        ? {
            mode: 'form-urlencoded' as const,
            mimeType: 'application/x-www-form-urlencoded',
            text: '',
            fields: parseBruRows(bodySection?.content || '')
          }
        : bodyMode === 'multipart'
          ? {
              mode: 'multipart' as const,
              mimeType: 'multipart/form-data',
              text: '',
              fields: parseBruRows(bodySection?.content || '')
            }
          : bodyMode === 'file'
            ? {
                mode: 'file' as const,
                mimeType: 'application/octet-stream',
                text: '',
                file: parseBruRows(bodySection?.content || '')[0]?.value.replace(/^@file\((.*)\)$/, '$1') || '',
                fields: []
              }
            : {
                mode: 'none' as const,
                mimeType: '',
                text: '',
                fields: []
              };

  const request: RequestDocument = {
    ...createEmptyRequest(name),
    name,
    kind: metadata.type === 'websocket' || bodyMode === 'ws' ? 'websocket' : 'http',
    method,
    url,
    path: normalizePath(url),
    description: docs,
    docs,
    order: Number(metadata.seq || legacy.seq || 0) || 0,
    headers,
    query,
    pathParams,
    body,
    auth: parseBruAuth(authMode, authBlock),
    scripts: {
      preRequest: [preRequestScript, genericScript].filter(Boolean).join('\n\n'),
      postResponse: postResponseScript,
      tests: testScript
    },
    examples: []
  };

  return {
    detectedFormat: 'bruno',
    summary: {
      requests: 1,
      folders: 0,
      environments: 1
    },
    project: createDefaultProject('Imported Bruno Collection'),
    environments: [createDefaultEnvironment('shared')],
    requests: [
      {
        folderSegments: [],
        request,
        cases: []
      }
    ],
    collections: [],
    warnings
  };
}

export function importBrunoCollectionFiles(files: ImportFileEntry[]): ImportResult {
  const normalizedFiles = files
    .map(file => ({
      path: normalizeImportPath(file.path),
      content: file.content
    }))
    .filter(file => file.path && file.content != null);
  const brunoJson = normalizedFiles.find(file => basename(file.path).toLowerCase() === 'bruno.json');
  const projectName = parseBrunoProjectName(brunoJson?.content);
  const collectionFile = normalizedFiles.find(file => basename(file.path).toLowerCase() === 'collection.bru');
  const folderNames = folderNameMap(normalizedFiles);
  const warnings: ImportWarning[] = [];
  const environments = normalizedFiles
    .filter(file => {
      const segments = normalizeImportPath(file.path).split('/').filter(Boolean);
      return segments.length >= 2 &&
        segments.at(-2)?.toLowerCase() === 'environments' &&
        segments.at(-1)?.toLowerCase().endsWith('.bru');
    })
    .map(file => parseBruEnvironmentDocument(basename(file.path).replace(/\.bru$/i, ''), file.content));
  const requests = normalizedFiles
    .filter(file => file.path.toLowerCase().endsWith('.bru'))
    .filter(file => {
      const name = basename(file.path).toLowerCase();
      return name !== 'collection.bru' && name !== 'folder.bru';
    })
    .filter(file => looksLikeBruno(file.content))
    .map(file => {
      const result = importBruno(file.content);
      warnings.push(...(result.warnings || []));
      const request = result.requests[0];
      return request
        ? {
            ...request,
            folderSegments: displayFolderSegments(dirnameSegments(file.path), folderNames),
            sourcePath: file.path
          }
        : null;
    })
    .filter((record): record is ImportedRequestRecord & { sourcePath: string } => Boolean(record))
    .sort((left, right) => {
      const seqDiff = (left.request.order || 0) - (right.request.order || 0);
      return seqDiff || left.sourcePath.localeCompare(right.sourcePath, 'zh-CN');
    });

  const collection = parseBruCollectionDocument(collectionFile?.content || '', projectName);
  if (environments[0]) {
    collection.defaultEnvironment = environments[0].name;
  }
  collection.steps = requests.map((record, index) =>
    createCollectionStep({
      key: `step_${index + 1}`,
      requestId: record.request.id,
      name: record.request.name
    })
  );

  warnings.push({
    level: 'info',
    scope: 'project',
    code: 'bruno-collection-import',
    status: 'compatible',
    message: `${projectName}: Bruno collection folder imported with ${requests.length} request file${requests.length === 1 ? '' : 's'}.`
  });

  return {
    detectedFormat: 'bruno',
    summary: {
      requests: requests.length,
      folders: new Set(requests.map(item => item.folderSegments.join('/')).filter(Boolean)).size,
      environments: 1
    },
    project: {
      ...createDefaultProject(projectName),
      defaultEnvironment: environments[0]?.name || 'shared'
    },
    environments: environments.length > 0 ? environments : [createDefaultEnvironment('shared')],
    requests: requests.map(({ sourcePath: _sourcePath, ...record }) => record),
    collections: [
      {
        collection,
        dataText: ''
      }
    ],
    warnings
  };
}

export function importSourceText(content: string): ImportResult {
  if (looksLikeBruno(content)) {
    return importBruno(content);
  }
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
  if (looksLikeOpenCollection(document)) {
    return importOpenCollection(document);
  }
  if (looksLikeInsomnia(document)) {
    return importInsomnia(document);
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
    collections: [],
    warnings: []
  };
}
