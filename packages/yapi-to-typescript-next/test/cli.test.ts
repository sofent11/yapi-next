import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { run } from '../src/cli';

test('cli loads yttn config files passed with -c style options', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'yttn-cli-'));
  const configFile = path.join(cwd, 'yttn.config.ts');
  await fs.writeFile(configFile, `
    import { defineConfig } from '${path.resolve(__dirname, '../src').replace(/\\/g, '/')}'

    export default defineConfig([
      {
        serverUrl: 'http://127.0.0.1:1',
        typesOnly: true,
        target: 'typescript',
        outputFilePath: 'generated.ts',
        projects: [],
      },
    ])
  `);

  await run(undefined, { cwd, configFile });
  assert.ok(true);
});

test('cli reports missing config files clearly', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'yttn-cli-missing-'));
  await assert.rejects(
    () => run(undefined, { cwd, configFile: path.join(cwd, 'missing.config.ts') }),
    /Config file not found/
  );
});

test('cli init writes original-shaped config with next package name', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'yttn-cli-init-'));
  const configFile = path.join(cwd, 'yttn.config.ts');
  await run('init', { cwd, configFile });
  const source = await fs.readFile(configFile, 'utf8');
  assert.match(source, /import \{ defineConfig \} from 'yapi-to-typescript-next'/);
  assert.match(source, /serverUrl: 'http:\/\/foo\.bar'/);
  assert.match(source, /reactHooks: \{\s*enabled: false,/);
  assert.match(source, /prodEnvName: 'production'/);
  assert.match(source, /outputFilePath: 'src\/api\/index\.ts'/);
  assert.match(source, /requestFunctionFilePath: 'src\/api\/request\.ts'/);
  assert.match(source, /return changeCase\.camelCase\(interfaceInfo\.path\)/);
});
