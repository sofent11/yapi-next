#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = '/Users/sofent/work/yapi';
const webSrcRoot = path.join(repoRoot, 'apps/web/src');
const tailwindCssPath = path.join(webSrcRoot, 'tailwind.css');
const sourceFilePattern = /\.(?:[cm]?[jt]sx?)$/;
const stringLiteralPattern = /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/gs;
const legacyTokenPattern = /legacy-[A-Za-z0-9_-]+/g;
const dynamicPrefixAllowlist = new Set([
  'legacy-project-color-',
  'legacy-console-member-row-'
]);

function walkFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'dist' || entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    if (sourceFilePattern.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function collectDefinedClassesFromFile(entryPath, visited = new Set()) {
  const resolved = path.resolve(entryPath);
  if (visited.has(resolved)) {
    return new Set();
  }
  visited.add(resolved);

  const cssText = fs.readFileSync(resolved, 'utf8');
  const classes = new Set(
    [...cssText.matchAll(/\.((?:legacy|m)-[A-Za-z0-9_-]+)\b/g)].map(match => match[1])
  );

  for (const match of cssText.matchAll(/@import\s+"([^"]+\.css)";/g)) {
    const importPath = match[1];
    if (importPath.startsWith('http')) continue;
    if (!importPath.startsWith('.')) continue;
    const childPath = path.resolve(path.dirname(resolved), importPath);
    const childClasses = collectDefinedClassesFromFile(childPath, visited);
    for (const className of childClasses) {
      classes.add(className);
    }
  }

  return classes;
}

function addUsage(usageMap, className, filePath) {
  if (!usageMap.has(className)) {
    usageMap.set(className, new Set());
  }
  usageMap.get(className).add(filePath);
}

function collectUsedLegacyClasses(filePath, usageMap) {
  const text = fs.readFileSync(filePath, 'utf8');
  for (const literalMatch of text.matchAll(stringLiteralPattern)) {
    const literal = literalMatch[0];
    const body = literal.slice(1, -1);
    for (const tokenMatch of body.matchAll(legacyTokenPattern)) {
      const token = tokenMatch[0];
      const tokenIndex = tokenMatch.index ?? 0;
      const prevChar = tokenIndex > 0 ? body[tokenIndex - 1] : '';
      const nextChar = body[tokenIndex + token.length] ?? '';
      if (prevChar === '/' || nextChar === '/') {
        continue;
      }
      addUsage(usageMap, token, filePath);
    }
  }
}

function main() {
  const definedClasses = collectDefinedClassesFromFile(tailwindCssPath);
  const usageMap = new Map();
  const files = walkFiles(webSrcRoot);

  for (const filePath of files) {
    collectUsedLegacyClasses(filePath, usageMap);
  }

  const missingEntries = [...usageMap.entries()]
    .filter(([className]) => !definedClasses.has(className) && !dynamicPrefixAllowlist.has(className))
    .sort((left, right) => left[0].localeCompare(right[0]));

  if (missingEntries.length === 0) {
    console.log('web legacy style audit passed: no missing legacy classes found.');
    process.exit(0);
  }

  console.error(`web legacy style audit failed: ${missingEntries.length} missing classes`);
  for (const [className, fileSet] of missingEntries) {
    console.error(`- ${className}`);
    for (const filePath of [...fileSet].sort()) {
      console.error(`  ${path.relative(repoRoot, filePath)}`);
    }
  }
  process.exit(1);
}

main();
