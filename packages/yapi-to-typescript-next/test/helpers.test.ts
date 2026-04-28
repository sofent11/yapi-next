import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FileData,
  Method,
  prepare,
  QueryStringArrayFormat,
  RequestBodyType,
  ResponseBodyType
} from '../src';

test('prepare replaces path params and appends query params', () => {
  const payload = prepare({
    mockUrl: '',
    devUrl: '',
    prodUrl: '',
    path: '/users/{id}',
    method: Method.GET,
    requestHeaders: {},
    requestBodyType: RequestBodyType.query,
    responseBodyType: ResponseBodyType.json,
    dataKey: undefined,
    paramNames: ['id'],
    queryNames: ['tags', 'q'],
    requestDataOptional: false,
    requestDataJsonSchema: {},
    responseDataJsonSchema: {},
    requestFunctionName: 'getUser',
    queryStringArrayFormat: QueryStringArrayFormat.repeat,
    extraInfo: {}
  }, {
    id: 'u 1',
    tags: ['a', 'b'],
    q: 'hello',
    untouched: 1
  });

  assert.equal(payload.path, '/users/u 1?tags=a&tags=b&q=hello');
  assert.deepEqual(payload.data, { untouched: 1 });
  assert.deepEqual(payload.allData, { untouched: 1 });
});

test('prepare separates FileData from normal data', () => {
  const file = new FileData(Buffer.from('hello'), { filename: 'hello.txt' });
  const payload = prepare({
    mockUrl: '',
    devUrl: '',
    prodUrl: '',
    path: '/upload',
    method: Method.POST,
    requestHeaders: {},
    requestBodyType: RequestBodyType.form,
    responseBodyType: ResponseBodyType.json,
    dataKey: undefined,
    paramNames: [],
    queryNames: [],
    requestDataOptional: false,
    requestDataJsonSchema: {},
    responseDataJsonSchema: {},
    requestFunctionName: 'upload',
    queryStringArrayFormat: QueryStringArrayFormat.brackets,
    extraInfo: {}
  }, {
    file,
    name: 'demo'
  });

  assert.equal(payload.hasFileData, true);
  assert.deepEqual(payload.data, { name: 'demo' });
  assert.deepEqual(payload.fileData, { file: Buffer.from('hello') });
  assert.deepEqual(payload.allData, { name: 'demo', file: Buffer.from('hello') });
});
