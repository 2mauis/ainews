// 基线冒烟：导出的打包代码可在 Node 中加载，公开路由行为可观测。
import test from 'node:test';
import assert from 'node:assert/strict';
import baseline from '../src/index.js';

const env = { ENVIRONMENT: 'gray', ADMIN_TOKEN: 'test-admin', RUN_TOKEN: 'test-run' };
test('baseline: /health 返回 200 JSON', async () => {
  const r = await baseline.fetch(new Request('https://ainews.example.com/health'), env);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});
test('baseline: /robots.txt 禁止抓取', async () => {
  const r = await baseline.fetch(new Request('https://ainews.example.com/robots.txt'), env);
  assert.match(await r.text(), /Disallow: \//);
});
test('baseline: 无 token 写订阅 → 401', async () => {
  const r = await baseline.fetch(new Request('https://ainews.example.com/api/subscriptions', { method: 'POST', body: '{}' }), env);
  assert.equal(r.status, 401);
});
