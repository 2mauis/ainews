#!/usr/bin/env node
// 从公共 2mauis/passkey-demo 的锁定提交拉取 @pkauth/core 与 @pkauth/workers。
// 校验 sha256 后才写入 vendor/。哈希不符、文件集合不符或 git 失败时不留下半份目录。
// 不发布 npm，不改上游。workers 的 package.json 只做安装布局：core 改为 file:，去掉 jose devDependency。
import { execFileSync } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sameText(left, right) {
  const a = createHash('sha256').update(String(left ?? ''), 'utf8').digest();
  const b = createHash('sha256').update(String(right ?? ''), 'utf8').digest();
  return timingSafeEqual(a, b);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

function inside(root, path) {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep + '..') && !rel.includes(`..${sep}`));
}

export function materialize(sourceRoot, destRoot, lock) {
  const source = resolve(sourceRoot);
  const expected = new Map(Object.entries(lock.files));
  for (const item of lock.omit || []) expected.set(item.path, item.sha256);
  const actual = new Map();
  for (const spec of lock.copy) {
    const fromDir = resolve(source, spec.from);
    if (!inside(source, fromDir) || !existsSync(fromDir)) {
      const error = new Error(`missing package dir ${spec.from}`);
      error.code = 'pkauth-fetch';
      throw error;
    }
    for (const file of walk(fromDir)) {
      const rel = relative(source, file).split(sep).join('/');
      actual.set(rel, sha256File(file));
    }
  }
  const problems = [];
  for (const [path, hash] of expected) if (!sameText(actual.get(path), hash)) problems.push(path);
  for (const path of actual.keys()) if (!expected.has(path)) problems.push(path);
  const licenseFrom = resolve(source, lock.license.from);
  if (!inside(source, licenseFrom) || !existsSync(licenseFrom) || !sameText(sha256File(licenseFrom), lock.license.sha256)) {
    problems.push(lock.license.from);
  }
  if (problems.length) {
    const error = new Error(`pkauth integrity failed: ${[...new Set(problems)].sort().join(', ')}`);
    error.code = 'pkauth-fetch';
    throw error;
  }
  const staging = `${destRoot}.incoming`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  try {
    for (const spec of lock.copy) {
      const fromDir = resolve(source, spec.from);
      for (const file of walk(fromDir)) {
        const rel = relative(source, file).split(sep).join('/');
        if ((lock.omit || []).some((item) => item.path === rel)) continue;
        const target = resolve(staging, spec.to, relative(fromDir, file));
        if (!inside(staging, target)) throw new Error('path escape');
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, readFileSync(file));
      }
    }
    const workersPkg = resolve(staging, 'vendor/pkauth-workers/package.json');
    const pkg = JSON.parse(readFileSync(workersPkg, 'utf8'));
    pkg.dependencies = { ...(pkg.dependencies || {}), '@pkauth/core': 'file:../pkauth-core' };
    delete pkg.devDependencies;
    writeFileSync(workersPkg, `${JSON.stringify(pkg, null, 2)}\n`);
    const licenseTo = resolve(staging, lock.license.to);
    if (!inside(staging, licenseTo)) throw new Error('path escape');
    mkdirSync(dirname(licenseTo), { recursive: true });
    writeFileSync(licenseTo, readFileSync(licenseFrom));
    writeFileSync(join(staging, 'vendor/.source-commit'), `${lock.commit}\n`);
    rmSync(destRoot, { recursive: true, force: true });
    mkdirSync(dirname(destRoot), { recursive: true });
    rmSync(destRoot, { recursive: true, force: true });
    // rename vendor.incoming/vendor into dest if dest is vendor
    const produced = join(staging, 'vendor');
    rmSync(destRoot, { recursive: true, force: true });
    mkdirSync(dirname(resolve(destRoot)), { recursive: true });
    execFileSync('mv', [produced, destRoot]);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export function fetchCommit(repo, commit, checkout) {
  rmSync(checkout, { recursive: true, force: true });
  mkdirSync(checkout, { recursive: true });
  const git = (...args) => execFileSync('git', args, { cwd: checkout, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git('init', '-q');
    git('fetch', '--depth', '1', repo, commit);
    git('checkout', '-q', '--detach', 'FETCH_HEAD');
    const head = git('rev-parse', 'HEAD').toString().trim();
    if (!sameText(head, commit)) {
      const error = new Error('fetched commit does not match lock');
      error.code = 'pkauth-fetch';
      throw error;
    }
  } catch (error) {
    rmSync(checkout, { recursive: true, force: true });
    if (error.code === 'pkauth-fetch') throw error;
    const wrapped = new Error('pkauth fetch failed');
    wrapped.code = 'pkauth-fetch';
    throw wrapped;
  }
}

export function loadLock(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function localCopyPath(dest, lock, rel) {
  const spec = lock.copy.find((item) => rel === item.from || rel.startsWith(`${item.from}/`));
  if (!spec) return null;
  const top = spec.to.replace(/^vendor\//, '');
  const rest = rel.slice(spec.from.length).replace(/^\//, '');
  return join(dest, top, rest);
}

function alreadyMatches(dest, lock) {
  const stamp = join(dest, '.source-commit');
  if (!existsSync(stamp) || !sameText(readFileSync(stamp, 'utf8').trim(), lock.commit)) return false;
  for (const [rel, hash] of Object.entries(lock.files)) {
    if (rel === 'packages/workers/package.json') continue;
    const local = localCopyPath(dest, lock, rel);
    if (!local || !existsSync(local) || !sameText(sha256File(local), hash)) return false;
  }
  return existsSync(join(dest, 'PASSKEY-DEMO-LICENSE'));
}

export function runFetch({ root = ROOT, lockPath = join(ROOT, 'pkauth.lock.json') } = {}) {
  const lock = loadLock(lockPath);
  const dest = join(root, 'vendor');
  if (alreadyMatches(dest, lock)) return { skipped: true, commit: lock.commit };
  const checkout = join(tmpdir(), `pkauth-src-${lock.commit.slice(0, 12)}`);
  try {
    fetchCommit(lock.repo, lock.commit, checkout);
    materialize(checkout, dest, lock);
  } finally {
    rmSync(checkout, { recursive: true, force: true });
  }
  return { skipped: false, commit: lock.commit };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = runFetch();
    console.log(`fetch-pkauth: ${result.skipped ? 'cached' : 'updated'} ${result.commit}`);
  } catch (error) {
    console.error(error.message || 'fetch-pkauth failed');
    process.exit(1);
  }
}
