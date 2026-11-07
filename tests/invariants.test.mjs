import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('INV-P1.3 仓库里没有新的鉴权实现', () => {
  execFileSync(process.execPath, ['scripts/check-inv-p1-3.mjs'], { stdio: 'inherit' });
});

test('check:auth 配置键齐全', () => {
  execFileSync(process.execPath, ['scripts/check-auth.mjs'], { stdio: 'inherit' });
});
