import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.js';

const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

function envSection(source) {
  const start = source.indexOf('[env.test]');
  assert.ok(start > 0, '缺少 [env.test]');
  const lines = source.slice(start).split('\n');
  const out = [lines[0]];
  for (let i = 1; i < lines.length; i += 1) {
    const header = /^\[\[?[A-Za-z0-9_.-]+\]\]?\s*$/.test(lines[i]);
    if (header && !/^\[\[?env\.test(?:\.|\])/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

const testEnv = envSection(toml);
const top = toml.slice(0, toml.indexOf('[env.test]'));

test('顶层生产配置保持原 Worker 名和 cron', () => {
  assert.match(top, /^name = "ai-content-pipeline-gray"$/m);
  assert.match(top, /^workers_dev = false$/m);
  assert.match(top, /^crons = \["0 0 \* \* \*", "0 4 \* \* \*", "0 8 \* \* \*", "0 12 \* \* \*", "0 16 \* \* \*", "0 20 \* \* \*"\]$/m);
  assert.match(top, /^\[ai\]$/m);
  assert.doesNotMatch(top, /ainews\.spicas\.cc/);
});

test('test env 显式关闭 cron，且不继承生产绑定', () => {
  assert.match(testEnv, /^name = "ainews-test"$/m);
  assert.match(testEnv, /^workers_dev = false$/m);
  assert.match(testEnv, /^\[env\.test\.triggers\]$/m);
  assert.match(testEnv, /^crons = \[\]$/m);
  assert.doesNotMatch(testEnv, /ai-content-pipeline-gray/);
  assert.doesNotMatch(testEnv, /00000000-0000-0000-0000-000000000000/);
  assert.doesNotMatch(testEnv, /replace-me-/);
  assert.doesNotMatch(testEnv, /^\[env\.test\.ai\]$/m);
  assert.doesNotMatch(testEnv, /^\[\[env\.test\.d1_databases\]\]$/m);
  assert.doesNotMatch(testEnv, /^\[\[env\.test\.r2_buckets\]\]$/m);
  assert.doesNotMatch(testEnv, /^\[env\.test\.limits\]$/m);
  assert.match(testEnv, /pattern = "ainews\.spicas\.cc"/);
  assert.match(testEnv, /^DAILY_AI_CALL_LIMIT = "0"$/m);
  assert.match(testEnv, /^ARCHIVE_RAW = "false"$/m);
  assert.match(testEnv, /^PKAUTH_MODE = "enforce"$/m);
  assert.match(testEnv, /"login": true/);
  assert.match(testEnv, /PKAUTH_CLIENT_ID = "ainews-test"/);
});

function b64u(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

const testRuntime = {
  ENVIRONMENT: 'test',
  ADMIN_TOKEN: 'test-admin',
  PKAUTH_ISSUER: 'https://id.example.com',
  PKAUTH_CLIENT_ID: 'ainews-test',
  PKAUTH_RESOURCE: 'https://ainews.spicas.cc/api',
  PKAUTH_ALLOWED_HOSTS: 'ainews.spicas.cc',
  PKAUTH_DEFAULT: 'public',
  PKAUTH_MODE: 'enforce',
  PKAUTH_COOKIE_SECRET: b64u(new Uint8Array(32).fill(0x22)),
  PKAUTH_RULES: JSON.stringify([
    { prefix: '/subscriptions', methods: ['GET', 'HEAD'], require: { login: true, feature: 'ainews:feeds.read' } },
    { prefix: '/api/subscriptions', methods: ['GET', 'HEAD'], require: { login: true, feature: 'ainews:feeds.read' } },
    { prefix: '/api/subscriptions', methods: ['POST', 'PUT', 'DELETE'], require: { login: true, feature: 'ainews:feeds.write', csrf: true } },
  ]),
  PKAUTH_UPSTREAM_INJECT: '{"x-admin-token":"ADMIN_TOKEN"}',
};

test('匿名订阅页跳登录，API 返回 401', async () => {
  const page = await worker.fetch(new Request('https://ainews.spicas.cc/subscriptions', {
    headers: { accept: 'text/html' },
  }), testRuntime);
  assert.equal(page.status, 302);
  assert.match(page.headers.get('location'), /^\/_pkauth\/login\?return_to=%2Fsubscriptions$/);
  const api = await worker.fetch(new Request('https://ainews.spicas.cc/api/subscriptions'), testRuntime);
  assert.equal(api.status, 401);
  assert.equal((await api.json()).error, 'unauthorized');
});

test('没有 cookie secret 时受保护路径 503，不降为公开', async () => {
  const { PKAUTH_COOKIE_SECRET, ...missing } = testRuntime;
  const page = await worker.fetch(new Request('https://ainews.spicas.cc/subscriptions', {
    headers: { accept: 'text/html' },
  }), missing);
  assert.equal(page.status, 503);
  const api = await worker.fetch(new Request('https://ainews.spicas.cc/api/subscriptions'), missing);
  assert.equal(api.status, 503);
});

test('测试 Host 以外的受保护请求返回 421', async () => {
  const page = await worker.fetch(new Request('https://ainews.example.com/subscriptions', {
    headers: { accept: 'text/html' },
  }), testRuntime);
  assert.equal(page.status, 421);
});
