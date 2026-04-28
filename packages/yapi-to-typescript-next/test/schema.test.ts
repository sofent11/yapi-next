import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import {
  getRequestDataJsonSchema,
  getResponseDataJsonSchema,
  jsonSchemaToType
} from '../src/schema';
import {
  RequestBodyType,
  ResponseBodyType
} from '../src/types';
import { swaggerJsonToYApiData } from '../src/openapi';

function assertTypeScriptCompiles(source: string): void {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      strict: true
    },
    reportDiagnostics: true
  });
  const diagnostics = result.diagnostics || [];
  assert.equal(diagnostics.length, 0, diagnostics.map(item => item.messageText).join('\n'));
}

test('generates any maps from explicit additionalProperties', async () => {
  const root = await jsonSchemaToType({ type: 'object', additionalProperties: true }, 'AnyMap');
  assert.match(root, /\[k: string\]: any|Record<string, any>/);

  const nested = await jsonSchemaToType({
    type: 'object',
    properties: {
      meta: {
        type: 'object',
        additionalProperties: true
      },
      named: {
        type: 'object',
        additionalProperties: { type: 'string' }
      }
    }
  }, 'Payload');
  assert.match(nested, /meta\?: \{\s*\[k: string\]: any;\s*\}|meta\?: Record<string, any>/s);
  assert.match(nested, /named\?: \{\s*\[k: string\]: string;\s*\}/s);
});

test('does not add unknown index signatures to closed plain objects', async () => {
  const code = await jsonSchemaToType({
    type: 'object',
    properties: {
      id: { type: 'string' }
    }
  }, 'Payload');
  assert.match(code, /id\?: string/);
  assert.doesNotMatch(code, /\[k: string\]: unknown/);
});

test('generates compilable self-referencing types', async () => {
  const code = await jsonSchemaToType({
    $schema: 'http://json-schema.org/draft-04/schema#',
    $ref: '#/definitions/Node',
    definitions: {
      Node: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          parent: { $ref: '#/definitions/Node' },
          children: {
            type: 'array',
            items: { $ref: '#/definitions/Node' }
          }
        }
      }
    }
  }, 'TreeResponse');
  assert.match(code, /parent\?: Node/);
  assert.match(code, /children\?: Node\[\]/);
  assertTypeScriptCompiles(code);
});

test('merges body, query, and path parameters into request type schema', async () => {
  const schema = getRequestDataJsonSchema({
    _id: 1,
    title: 'Create user',
    method: 'POST',
    path: '/users/{id}',
    catid: 1,
    req_body_type: RequestBodyType.json,
    req_body_is_json_schema: true,
    req_body_other: JSON.stringify({
      type: 'object',
      properties: {
        bodyName: { type: 'string' }
      },
      required: ['bodyName']
    }),
    req_query: [{ name: 'page', required: '0', type: 'number' }],
    req_params: [{ name: 'id', type: 'string' }]
  });
  const code = await jsonSchemaToType(schema, 'CreateUserRequest');
  assert.match(code, /bodyName: string/);
  assert.match(code, /page\?: number/);
  assert.match(code, /id: string/);
});

test('reaches response dataKey while preserving definitions', async () => {
  const schema = getResponseDataJsonSchema({
    _id: 1,
    title: 'Tree',
    method: 'GET',
    path: '/tree',
    catid: 1,
    res_body_type: ResponseBodyType.json,
    res_body_is_json_schema: true,
    res_body: JSON.stringify({
      type: 'object',
      properties: {
        data: { $ref: '#/definitions/Node' }
      },
      definitions: {
        Node: {
          type: 'object',
          properties: {
            parent: { $ref: '#/definitions/Node' }
          }
        }
      }
    })
  }, {}, 'data');
  const code = await jsonSchemaToType(schema, 'TreeResponse');
  assert.match(code, /parent\?: Node/);
});

test('openapi conversion rewrites components refs to definitions for codegen', async () => {
  const data = await swaggerJsonToYApiData({
    openapi: '3.0.3',
    info: { title: 'Tree API', version: '1.0.0' },
    tags: [{ name: 'tree' }],
    paths: {
      '/tree': {
        get: {
          tags: ['tree'],
          responses: {
            '200': {
              description: 'ok',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Node' }
                }
              }
            }
          }
        }
      }
    },
    components: {
      schemas: {
        Node: {
          type: 'object',
          properties: {
            parent: { $ref: '#/components/schemas/Node' },
            children: {
              type: 'array',
              items: { $ref: '#/components/schemas/Node' }
            }
          }
        }
      }
    }
  });

  const api = data.interfaces[0];
  assert.match(api.res_body || '', /"#\/definitions\/Node"/);
  const code = await jsonSchemaToType(JSON.parse(api.res_body || '{}'), 'TreeResponse');
  assert.match(code, /parent\?: Node/);
  assert.match(code, /children\?: Node\[\]/);
});
