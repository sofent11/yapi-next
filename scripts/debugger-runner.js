#!/usr/bin/env node

const { spawn } = require('node:child_process');
const path = require('node:path');

const scriptDir = __dirname;
const cliEntry = path.join(scriptDir, 'debugger-runner.ts');

const child = spawn(process.execPath, ['--import', 'tsx', cliEntry, ...process.argv.slice(2)], {
  stdio: 'inherit'
});

child.on('exit', code => {
  process.exit(code ?? 0);
});

child.on('error', error => {
  console.error(error.message || error);
  process.exit(1);
});
