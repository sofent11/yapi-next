import test from 'ava';

const rewire = require('rewire');
const internalController = rewire('../../server/controllers/internalInterface.js');
const parseJSONSafe = internalController.__get__('parseJSONSafe');
const buildErrorItem = internalController.__get__('buildErrorItem');

test('parseJSONSafe should parse object json', t => {
  const result = parseJSONSafe('{"a":1}', null);
  t.deepEqual(result, { a: 1 });
});

test('parseJSONSafe should return default on invalid json', t => {
  const fallback = { ok: false };
  const result = parseJSONSafe('{', fallback);
  t.deepEqual(result, fallback);
});

test('buildErrorItem should keep operationId from import_meta', t => {
  const item = {
    path: '/a',
    method: 'GET',
    import_meta: JSON.stringify({ operationId: 'getA' })
  };
  const result = buildErrorItem(item, 'bad');
  t.is(result.operationId, 'getA');
  t.is(result.path, '/a');
  t.is(result.method, 'GET');
});
