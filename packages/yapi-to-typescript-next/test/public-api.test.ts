import assert from 'node:assert/strict';
import test from 'node:test';
import * as api from '../src';

test('public runtime exports match original yapi-to-typescript surface', () => {
  assert.deepEqual(Object.keys(api).sort(), [
    'FileData',
    'Method',
    'QueryStringArrayFormat',
    'RequestBodyType',
    'RequestFormItemType',
    'RequestParamType',
    'RequestQueryType',
    'Required',
    'ResponseBodyType',
    'defineConfig',
    'parseRequestData',
    'prepare'
  ]);
});
