import assert from 'node:assert/strict';
import test from 'node:test';
import { Generator } from '../src/generator';

test('generator keeps original yapi-to-typescript code shape', async () => {
  const generator = new Generator([], { cwd: process.cwd() });
  const code = await generator.generateInterfaceCode({
    serverUrl: 'http://127.0.0.1',
    token: 'token',
    id: 1,
    mockUrl: 'mock',
    devUrl: 'dev',
    prodUrl: 'prod',
    outputFilePath: 'api.ts',
    dataKey: 'data',
    jsonSchema: { enabled: true },
    projects: [],
    categories: []
  }, {
    _id: 1,
    title: 'Get User',
    path: '/users/{id}',
    method: 'GET',
    catid: 1,
    tag: ['a'],
    up_time: 1,
    req_headers: [{ name: 'X-A', value: '1' }],
    req_params: [{ name: 'id', type: 'string', desc: 'id' }],
    req_query: [{ name: 'q', required: '0', type: 'string', desc: 'q' }],
    req_body_type: 'raw',
    res_body_type: 'json',
    res_body_is_json_schema: true,
    res_body: JSON.stringify({
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            name: { type: 'string' }
          }
        }
      }
    }),
    _category: { _id: 1, name: 'Cat', _url: 'cat' },
    _url: 'url'
  }, '_0_0_0_0');

  assert.match(code, /接口 \[Get User↗]\(url\) 的 \*\*请求类型\*\*/);
  assert.match(code, /type IdRequestConfig = Readonly<RequestConfig<[\s\S]*'id',[\s\S]*'q',/);
  assert.match(code, /const idRequestConfig: IdRequestConfig = \/\*#__PURE__\*\/ \{/);
  assert.match(code, /export const id = \/\*#__PURE__\*\/ \(/);
  assert.match(code, /return request<IdResponse>\(\s*prepare\(idRequestConfig, requestData\),\s*\.\.\.args,\s*\)/);
});
