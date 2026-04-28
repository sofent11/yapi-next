#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { register } from 'ts-node';
import { Generator } from './generator';
import type { ConfigWithHooks } from './types';

register({
  skipProject: true,
  transpileOnly: true,
  compilerOptions: {
    strict: false,
    target: 'es2022',
    module: 'commonjs',
    moduleResolution: 'node',
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    allowJs: true
  }
});

function parseArgv(argv: string[]): { cmd?: string; configFile?: string } {
  const args = argv.slice(2);
  const result: { cmd?: string; configFile?: string } = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '-c' || arg === '--config') {
      result.configFile = args[index + 1];
      index += 1;
    } else if (!result.cmd) {
      result.cmd = arg;
    }
  }
  return result;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (_err) {
    return false;
  }
}

async function resolveConfigFile(cwd: string, input?: string): Promise<string> {
  if (input) {
    return path.resolve(cwd, input);
  }
  const tsFile = path.join(cwd, 'yttn.config.ts');
  const jsFile = path.join(cwd, 'yttn.config.js');
  const legacyTsFile = path.join(cwd, 'ytt.config.ts');
  const legacyJsFile = path.join(cwd, 'ytt.config.js');
  if (await exists(tsFile)) return tsFile;
  if (await exists(jsFile)) return jsFile;
  if (await exists(legacyTsFile)) return legacyTsFile;
  if (await exists(legacyJsFile)) return legacyJsFile;
  return tsFile;
}

async function loadConfig(configFile: string): Promise<ConfigWithHooks> {
  const loaded = require(configFile);
  return (loaded.default || loaded) as ConfigWithHooks;
}

async function writeInitConfig(configFile: string): Promise<void> {
  const extension = configFile.endsWith('.js') ? 'js' : 'ts';
  const source = `import { defineConfig } from 'yapi-to-typescript-next'

export default defineConfig([
  {
    serverUrl: 'http://foo.bar',
    typesOnly: false,
    target: '${extension === 'js' ? 'javascript' : 'typescript'}',
    reactHooks: {
      enabled: false,
    },
    prodEnvName: 'production',
    outputFilePath: 'src/api/index.${extension}',
    requestFunctionFilePath: 'src/api/request.${extension}',
    dataKey: 'data',
    projects: [
      {
        token: 'hello',
        categories: [
          {
            id: 0,
            getRequestFunctionName(interfaceInfo, changeCase) {
              // 以接口全路径生成请求函数名
              return changeCase.camelCase(interfaceInfo.path)

              // 若生成的请求函数名存在语法关键词报错、或想通过某个关键词触发 IDE 自动引入提示，可考虑加前缀，如:
              // return changeCase.camelCase(\`api_\${interfaceInfo.path}\`)

              // 若生成的请求函数名有重复报错，可考虑将接口请求方式纳入生成条件，如:
              // return changeCase.camelCase(\`\${interfaceInfo.method}_\${interfaceInfo.path}\`)
            },
          },
        ],
      },
    ],
  },
])
`;
  await fs.mkdir(path.dirname(configFile), { recursive: true });
  await fs.writeFile(configFile, source, 'utf8');
}

function printHelp(): void {
  console.log(`
# 用法
  初始化配置文件: yttn init
  生成代码: yttn
  查看帮助: yttn help

# GitHub
  https://github.com/fjc0k/yapi-to-typescript
`);
}

export async function run(cmd?: string, options: { configFile?: string; cwd?: string } = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const configFile = await resolveConfigFile(cwd, options.configFile);

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printHelp();
    return;
  }

  if (cmd === 'init') {
    if (await exists(configFile)) {
      throw new Error(`Config file already exists: ${configFile}`);
    }
    await writeInitConfig(configFile);
    console.log(`Created config file: ${configFile}`);
    return;
  }

  if (!(await exists(configFile))) {
    throw new Error(`Config file not found: ${configFile}`);
  }

  const config = await loadConfig(configFile);
  const generator = new Generator(config, { cwd: path.dirname(configFile) });
  try {
    await generator.prepare();
    const output = await generator.generate();
    await generator.write(output);
    await generator.destroy();
    await config.hooks?.success?.();
  } catch (error) {
    await generator.destroy();
    await config.hooks?.fail?.();
    throw error;
  } finally {
    await config.hooks?.complete?.();
  }
}

if (require.main === module) {
  const argv = parseArgv(process.argv);
  run(argv.cmd, { configFile: argv.configFile }).catch(error => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
