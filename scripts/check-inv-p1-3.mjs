#!/usr/bin/env node
// INV-P1.3：ainews 里除三行胶水、vendor SDK、以及本检查脚本外，不得出现鉴权实现。
// src/index.js 是导出的历史 bundle（设计 D17），只禁止把 Access / jose 关键字写回去。
// .semgrep.yml 是已有的规则文本，不是可执行鉴权代码。
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const KEYWORDS = [
  'jwtVerify',
  'crypto.subtle',
  'Cf-Access',
  'authorization',
  'createRemoteJWKSet',
  "from 'jose'",
  'from "jose"',
  'ACCESS_TEAM_DOMAIN',
  'AUD_AINEWS_ADMIN',
  'ACCESS_OWNER_SUBS',
  'X-Ainews-Access',
  'X-Ainews-Admin',
];
const BASELINE_KEYWORDS = [
  'jwtVerify',
  'crypto.subtle',
  'Cf-Access',
  'createRemoteJWKSet',
  "from 'jose'",
  'from "jose"',
  'ACCESS_TEAM_DOMAIN',
  'AUD_AINEWS_ADMIN',
  'ACCESS_OWNER_SUBS',
];
const SKIP = new Set([
  'src/index.js',
  'scripts/check-inv-p1-3.mjs',
  'scripts/check-auth.mjs',
  '.semgrep.yml',
  'package-lock.json',
]);
const GLUE = "import upstream from './index.js';\nimport { protect } from '@pkauth/workers';\nexport default protect(upstream);\n";

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

function files() {
  const tracked = git('ls-files', '-z').split('\0').filter(Boolean);
  const extra = git('ls-files', '-z', '--others', '--exclude-standard').split('\0').filter(Boolean);
  return [...new Set([...tracked, ...extra])];
}

function hits(text, words) {
  const found = [];
  text.split('\n').forEach((line, index) => {
    for (const word of words) if (line.includes(word)) found.push(`${index + 1} ${word}`);
  });
  return found;
}

function skipped(file) {
  if (SKIP.has(file) || file.startsWith('vendor/')) return true;
  return false;
}

export function checkInvP13(fileList, read = (file) => readFileSync(file, 'utf8')) {
  const errors = [];
  if (read('src/worker.js') !== GLUE) errors.push('src/worker.js 不是三行胶水');
  for (const file of fileList) {
    if (!existsSync(file) || skipped(file)) continue;
    const buf = readFileSync(file);
    if (buf.includes(0)) continue;
    for (const hit of hits(buf.toString('utf8'), KEYWORDS)) errors.push(`${file}:${hit}`);
  }
  if (existsSync('src/index.js')) {
    for (const hit of hits(readFileSync('src/index.js', 'utf8'), BASELINE_KEYWORDS)) errors.push(`src/index.js:${hit}`);
  }
  const pkg = JSON.parse(read('package.json'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies };
  if (deps.jose) errors.push('package.json 仍依赖 jose');
  if (deps['@pkauth/workers'] !== 'file:vendor/pkauth-workers') errors.push('package.json 未用 file:vendor/pkauth-workers');
  if (deps['@pkauth/core'] !== 'file:vendor/pkauth-core') errors.push('package.json 未用 file:vendor/pkauth-core');
  for (const file of ['vendor/pkauth-core/package.json', 'vendor/pkauth-workers/package.json']) {
    const body = JSON.parse(read(file));
    const all = { ...body.dependencies, ...body.devDependencies, ...body.optionalDependencies };
    if (all.jose) errors.push(`${file} 依赖 jose`);
  }
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = checkInvP13(files());
  for (const error of errors) console.error(error);
  if (errors.length) {
    console.error(`INV-P1.3: ${errors.length} 处不符合`);
    process.exit(1);
  }
  console.log('INV-P1.3: passed');
}
