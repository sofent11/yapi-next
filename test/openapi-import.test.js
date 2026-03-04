import test from 'ava';
import fs from 'fs';
import path from 'path';

const run = require('../exts/yapi-plugin-import-swagger/run.js');

test('import swagger v3 should return apis/cats/basePath', async t => {
  const file = path.join(__dirname, 'swagger.v3.json');
  const content = fs.readFileSync(file, 'utf8');
  const result = await run(content);

  t.true(Array.isArray(result.apis));
  t.true(Array.isArray(result.cats));
  t.true(result.apis.length > 0);
  t.truthy(result.basePath !== undefined);
  const one = result.apis[0];
  t.truthy(one.method);
  t.truthy(one.path);
  t.truthy(typeof one.operation_oas3 === 'string');
});

test('import swagger v2 should be converted to openapi3 then imported', async t => {
  const file = path.join(__dirname, 'swagger.v2.json');
  const content = fs.readFileSync(file, 'utf8');
  const result = await run(content);

  t.true(Array.isArray(result.apis));
  t.true(result.apis.length > 0);
  t.truthy(result.apis.find(item => item.method === 'GET'));
});
