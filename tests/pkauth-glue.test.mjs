import test from 'node:test';
import assert from 'node:assert/strict';
import baseline from '../src/index.js';
import worker from '../src/worker.js';

const env = {
  ENVIRONMENT: 'gray',
  ADMIN_TOKEN: 'test-admin',
  RUN_TOKEN: 'test-run',
  PKAUTH_ISSUER: 'https://id.example.com',
  PKAUTH_CLIENT_ID: 'ainews',
  PKAUTH_RESOURCE: 'https://ainews.example.com/api',
  PKAUTH_ALLOWED_HOSTS: 'ainews.example.com',
  PKAUTH_DEFAULT: 'public',
  PKAUTH_MODE: 'enforce',
  // 组件只接受 32 字节的 base64url。这是测试值，不是部署密钥。
  PKAUTH_COOKIE_SECRET: b64u(new Uint8Array(32).fill(0x11)),
  PKAUTH_RULES: JSON.stringify([
    { prefix: '/subscriptions', methods: ['GET', 'HEAD'], require: { login: true, feature: 'ainews:feeds.read' } },
    { prefix: '/api/subscriptions', methods: ['GET', 'HEAD'], require: { login: true, feature: 'ainews:feeds.read' } },
    { prefix: '/api/subscriptions', methods: ['POST', 'PUT', 'DELETE'], require: { login: true, feature: 'ainews:feeds.write', csrf: true } },
  ]),
  PKAUTH_UPSTREAM_INJECT: '{"x-admin-token":"ADMIN_TOKEN"}',
};

test('公开 /health 与基线一致', async () => {
  const first = await baseline.fetch(new Request('https://ainews.example.com/health'), env);
  const second = await worker.fetch(new Request('https://ainews.example.com/health'), env);
  assert.equal(second.status, first.status);
  assert.equal(await second.text(), await first.text());
  assert.equal(second.headers.get('access-control-allow-origin'), '*');
});

test('未登录不能读或写订阅', async () => {
  const page = await worker.fetch(new Request('https://ainews.example.com/subscriptions', { headers: { accept: 'text/html' } }), env);
  assert.equal(page.status, 302);
  assert.match(page.headers.get('location'), /^\/_pkauth\/login\?return_to=/);
  const read = await worker.fetch(new Request('https://ainews.example.com/api/subscriptions'), env);
  assert.equal(read.status, 401);
  assert.equal((await read.json()).error, 'unauthorized');
  const write = await worker.fetch(new Request('https://ainews.example.com/api/subscriptions', { method: 'POST', body: '{}' }), env);
  assert.equal(write.status, 401);
  assert.equal((await write.json()).error, 'unauthorized');
});

test('模式关闭时订阅 503，公开路径仍可用', async () => {
  const off = { ...env, PKAUTH_MODE: 'off' };
  assert.equal((await worker.fetch(new Request('https://ainews.example.com/subscriptions'), off)).status, 503);
  assert.equal((await worker.fetch(new Request('https://ainews.example.com/health'), off)).status, 200);
});

test('受保护路径的预检不会落到基线', async () => {
  const response = await worker.fetch(new Request('https://ainews.example.com/api/subscriptions', { method: 'OPTIONS' }), env);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('scheduled 仍然挂在入口上', () => {
  assert.equal(typeof worker.scheduled, 'function');
});

function b64u(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}
