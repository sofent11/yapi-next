const swagger2openapi = require('swagger2openapi');
const SwaggerParser = require('@apidevtools/swagger-parser');
const URL = require('url').URL;

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

function handlePath(path) {
  if (path === '/') return path;
  if (path.charAt(0) !== '/') {
    path = '/' + path;
  }
  if (path.charAt(path.length - 1) === '/') {
    path = path.substr(0, path.length - 1);
  }
  return path;
}

function safeJsonParse(content) {
  if (typeof content !== 'string') return content;
  return JSON.parse(content);
}

function parseServerBasePath(spec) {
  if (!spec || !Array.isArray(spec.servers) || !spec.servers[0] || !spec.servers[0].url) {
    return '';
  }
  const serverUrl = spec.servers[0].url;
  try {
    const parsed = new URL(serverUrl, 'http://yapi.local');
    return parsed.pathname && parsed.pathname !== '/' ? handlePath(parsed.pathname) : '';
  } catch (e) {
    if (serverUrl.charAt(0) === '/') {
      return handlePath(serverUrl);
    }
    return '';
  }
}

function pickMediaType(content) {
  if (!content || typeof content !== 'object') return null;
  const prefer = [
    'application/json',
    'application/hal+json',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain',
    '*/*'
  ];
  for (let i = 0; i < prefer.length; i++) {
    if (content[prefer[i]]) return prefer[i];
  }
  const keys = Object.keys(content);
  return keys.length > 0 ? keys[0] : null;
}

function isVersionTag(tag) {
  return /^v[0-9.]+$/i.test(tag);
}

function selectCategory(tags, rootTags) {
  if (!Array.isArray(tags) || tags.length === 0) return null;
  for (let i = 0; i < tags.length; i++) {
    if (!isVersionTag(tags[i])) {
      if (rootTags.length === 0 || rootTags.indexOf(tags[i]) >= 0) {
        return tags[i];
      }
    }
  }
  return tags[0];
}

function normalizeParameter(param) {
  return {
    name: param.name,
    desc: param.description,
    required: param.required ? '1' : '0'
  };
}

function handleParameters(operation, api) {
  const params = Array.isArray(operation.parameters) ? operation.parameters : [];
  params.forEach(param => {
    const data = normalizeParameter(param);
    switch (param.in) {
      case 'path':
        api.req_params.push(data);
        break;
      case 'query':
        api.req_query.push(data);
        break;
      case 'header':
        api.req_headers.push(data);
        break;
      default:
        break;
    }
  });
}

function handleRequestBody(operation, api) {
  if (!operation || !operation.requestBody || !operation.requestBody.content) return;

  const mediaType = pickMediaType(operation.requestBody.content);
  if (!mediaType) return;

  const media = operation.requestBody.content[mediaType] || {};
  const schema = media.schema || {};
  if (mediaType === 'application/json' || mediaType.indexOf('+json') > -1) {
    api.req_body_type = 'json';
    api.req_body_is_json_schema = true;
    api.req_body_other = JSON.stringify(schema, null, 2);
    return;
  }

  if (mediaType === 'multipart/form-data' || mediaType === 'application/x-www-form-urlencoded') {
    api.req_body_type = 'form';
    const required = Array.isArray(schema.required) ? schema.required : [];
    const properties = schema.properties || {};
    Object.keys(properties).forEach(name => {
      const property = properties[name] || {};
      const isFile = property.format === 'binary' || property.contentEncoding === 'binary';
      api.req_body_form.push({
        name,
        type: isFile ? 'file' : 'text',
        desc: property.description || '',
        required: required.indexOf(name) >= 0 ? '1' : '0'
      });
    });
    return;
  }

  api.req_body_type = 'raw';
  if (media.schema) {
    api.req_body_other = JSON.stringify(media.schema, null, 2);
  } else if (typeof media.example !== 'undefined') {
    api.req_body_other =
      typeof media.example === 'string' ? media.example : JSON.stringify(media.example, null, 2);
  }
}

function selectResponse(responses) {
  if (!responses || typeof responses !== 'object') return null;
  const keys = Object.keys(responses);
  const priority = ['200', '201', '202', '203', '204', 'default'];
  for (let i = 0; i < priority.length; i++) {
    if (responses[priority[i]]) {
      return responses[priority[i]];
    }
  }
  return keys.length ? responses[keys[0]] : null;
}

function handleResponse(operation, api) {
  const response = selectResponse(operation.responses);
  if (!response) return;

  const mediaType = pickMediaType(response.content);
  if (mediaType && response.content[mediaType]) {
    const media = response.content[mediaType];
    if (media.schema) {
      api.res_body = JSON.stringify(media.schema, null, 2);
      api.res_body_type = 'json';
      api.res_body_is_json_schema = true;
      return;
    }
    if (typeof media.example !== 'undefined') {
      api.res_body =
        typeof media.example === 'string' ? media.example : JSON.stringify(media.example, null, 2);
      api.res_body_type = mediaType.indexOf('json') > -1 ? 'json' : 'raw';
      api.res_body_is_json_schema = false;
      return;
    }
  }

  api.res_body = response.description || '';
  api.res_body_type = 'raw';
  api.res_body_is_json_schema = false;
}

async function toOpenApi3(spec) {
  if (spec && spec.openapi && /^3\./.test(spec.openapi)) {
    return spec;
  }

  if (spec && spec.swagger && /^2\./.test(spec.swagger)) {
    const converted = await swagger2openapi.convertObj(spec, {
      patch: true,
      warnOnly: true,
      resolve: true
    });
    return converted.openapi;
  }

  throw new Error('仅支持 Swagger 2.x 或 OpenAPI 3.x 规范');
}

async function run(content) {
  const rawSpec = safeJsonParse(content);
  const openapi3 = await toOpenApi3(rawSpec);
  const spec = await SwaggerParser.bundle(openapi3);
  const interfaceData = {
    apis: [],
    cats: [],
    basePath: parseServerBasePath(spec)
  };

  const rootTags = Array.isArray(spec.tags) ? spec.tags.map(item => item.name) : [];
  if (Array.isArray(spec.tags)) {
    spec.tags.forEach(tag => {
      interfaceData.cats.push({
        name: tag.name,
        desc: tag.description || tag.name
      });
    });
  }

  const paths = spec.paths || {};
  Object.keys(paths).forEach(pathKey => {
    const pathItem = paths[pathKey];
    if (!pathItem || typeof pathItem !== 'object') return;

    HTTP_METHODS.forEach(method => {
      const operation = pathItem[method];
      if (!operation || typeof operation !== 'object') return;

      const mergedOperation = Object.assign({}, operation, {
        parameters: [].concat(pathItem.parameters || [], operation.parameters || [])
      });

      const catname = selectCategory(mergedOperation.tags, rootTags);
      const api = {
        method: method.toUpperCase(),
        title: mergedOperation.summary || mergedOperation.operationId || pathKey,
        desc: mergedOperation.description || mergedOperation.summary || '',
        catname,
        tag: Array.isArray(mergedOperation.tags) ? mergedOperation.tags : [],
        path: handlePath(pathKey),
        req_params: [],
        req_body_form: [],
        req_headers: [],
        req_query: [],
        req_body_type: 'raw',
        req_body_other: '',
        req_body_is_json_schema: false,
        res_body_type: 'raw',
        res_body: '',
        res_body_is_json_schema: false,
        operation_oas3: JSON.stringify(mergedOperation, null, 2),
        import_meta: JSON.stringify({
          source: 'openapi3',
          operationId: mergedOperation.operationId || '',
          mediaTypes: mergedOperation.requestBody && mergedOperation.requestBody.content
            ? Object.keys(mergedOperation.requestBody.content)
            : []
        })
      };

      handleParameters(mergedOperation, api);
      handleRequestBody(mergedOperation, api);
      handleResponse(mergedOperation, api);

      if (api.catname && !interfaceData.cats.find(item => item.name === api.catname)) {
        interfaceData.cats.push({
          name: api.catname,
          desc: api.catname
        });
      }
      interfaceData.apis.push(api);
    });
  });

  interfaceData.cats = interfaceData.cats.filter(cat =>
    interfaceData.apis.find(api => api.catname === cat.name)
  );
  return interfaceData;
}

module.exports = run;
