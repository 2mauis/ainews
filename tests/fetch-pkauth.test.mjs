import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { materialize, fetchCommit } from '../scripts/fetch-pkauth.mjs';

function hash(text) {
  return createHash('sha256').update(text).digest('hex');
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'pkauth-src-'));
  const files = {
    'LICENSE': 'MIT test notice\n',
    'packages/core/package.json': '{"name":"@pkauth/core","version":"0.1.0"}\n',
    'packages/core/src/index.js': 'export const core = 1;\n',
    'packages/workers/package.json': '{"name":"@pkauth/workers","dependencies":{"@pkauth/core":"0.1.0"},"devDependencies":{"jose":"^6.1.0"}}\n',
    'packages/workers/src/index.js': 'export function protect() { return {}; }\n',
    'packages/workers/tests/jose-cross.test.mjs': 'cross\n',
  };
  for (const [rel, body] of Object.entries(files)) {
    const path = join(root, rel);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, body);
  }
  const lock = {
    commit: 'abc',
    license: { from: 'LICENSE', to: 'vendor/PASSKEY-DEMO-LICENSE', sha256: hash(files.LICENSE) },
    copy: [
      { from: 'packages/core', to: 'vendor/pkauth-core' },
      { from: 'packages/workers', to: 'vendor/pkauth-workers' },
    ],
    omit: [{ path: 'packages/workers/tests/jose-cross.test.mjs', sha256: hash(files['packages/workers/tests/jose-cross.test.mjs']) }],
    files: {
      'packages/core/package.json': hash(files['packages/core/package.json']),
      'packages/core/src/index.js': hash(files['packages/core/src/index.js']),
      'packages/workers/package.json': hash(files['packages/workers/package.json']),
      'packages/workers/src/index.js': hash(files['packages/workers/src/index.js']),
    },
  };
  return { root, lock };
}

test('哈希不符时不写出 vendor', () => {
  const { root, lock } = fixture();
  lock.files['packages/core/src/index.js'] = '0'.repeat(64);
  const dest = mkdtempSync(join(tmpdir(), 'pkauth-dest-'));
  rmSync(dest, { recursive: true });
  assert.throws(() => materialize(root, dest, lock), /integrity failed/);
  assert.equal(existsSync(dest), false);
  rmSync(root, { recursive: true, force: true });
});

test('上游多出未锁定文件时失败', () => {
  const { root, lock } = fixture();
  writeFileSync(join(root, 'packages/core/src/extra.js'), 'nope\n');
  const dest = join(tmpdir(), `pkauth-dest-${Date.now()}`);
  assert.throws(() => materialize(root, dest, lock), /integrity failed/);
  assert.equal(existsSync(dest), false);
  rmSync(root, { recursive: true, force: true });
});

test('校验通过后才落盘，并改成 file 依赖、去掉 jose', () => {
  const { root, lock } = fixture();
  const dest = join(tmpdir(), `pkauth-ok-${Date.now()}`);
  materialize(root, dest, lock);
  const pkg = JSON.parse(readFileSync(join(dest, 'pkauth-workers/package.json'), 'utf8'));
  assert.equal(pkg.dependencies['@pkauth/core'], 'file:../pkauth-core');
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(existsSync(join(dest, 'pkauth-workers/tests/jose-cross.test.mjs')), false);
  assert.equal(readFileSync(join(dest, 'pkauth-core/src/index.js'), 'utf8').includes('export const core'), true);
  assert.equal(readFileSync(join(dest, 'PASSKEY-DEMO-LICENSE'), 'utf8').includes('MIT'), true);
  rmSync(root, { recursive: true, force: true });
  rmSync(dest, { recursive: true, force: true });
});

test('git 拉取失败时不创建目标目录', () => {
  const dest = join(tmpdir(), `pkauth-git-${Date.now()}`);
  const missing = join(tmpdir(), `no-such-pkauth-${Date.now()}.git`);
  assert.throws(() => fetchCommit(missing, 'a'.repeat(40), dest), /pkauth fetch failed/);
  assert.equal(existsSync(dest), false);
});
