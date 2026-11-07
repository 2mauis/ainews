#!/usr/bin/env node
// check:auth — 校验 wrangler.toml 里的 PKAUTH_* 占位配置。不是运行时鉴权。
import { readFileSync } from 'node:fs';

const REQUIRED = [
  'PKAUTH_ISSUER',
  'PKAUTH_CLIENT_ID',
  'PKAUTH_RESOURCE',
  'PKAUTH_ALLOWED_HOSTS',
  'PKAUTH_DEFAULT',
  'PKAUTH_MODE',
  'PKAUTH_RULES',
  'PKAUTH_UPSTREAM_INJECT',
];

export function checkAuth(toml) {
  const errors = [];
  const main = /^main\s*=\s*"([^"]+)"/m.exec(toml)?.[1];
  if (main !== 'src/worker.js') errors.push('main 必须是 src/worker.js');
  const workersDev = /^workers_dev\s*=\s*(true|false)/m.exec(toml)?.[1];
  if (workersDev !== 'false') errors.push('workers_dev 必须为 false');
  for (const key of REQUIRED) if (!new RegExp(`^${key}\\s*=`, 'm').test(toml)) errors.push(`缺少 ${key}`);
  const rulesRaw = /^PKAUTH_RULES\s*=\s*'''([\s\S]*?)'''/m.exec(toml)?.[1];
  let rules = [];
  if (!rulesRaw) errors.push('PKAUTH_RULES 需要用三引号包住 JSON');
  else {
    try { rules = JSON.parse(rulesRaw); }
    catch { errors.push('PKAUTH_RULES 不是 JSON'); }
  }
  if (!Array.isArray(rules)) errors.push('PKAUTH_RULES 必须是数组');
  else {
    const online = rules.some((rule) => rule?.require?.online === true);
    if (online) errors.push('P1 规则不要写 online（IdP 权益接口尚未存在，写上会失败关闭）');
    const read = rules.filter((rule) => rule?.require?.feature === 'ainews:feeds.read');
    const write = rules.find((rule) => rule?.prefix === '/api/subscriptions' && rule?.require?.feature === 'ainews:feeds.write');
    if (!read.some((rule) => rule.prefix === '/subscriptions') || !read.some((rule) => rule.prefix === '/api/subscriptions')) {
      errors.push('读规则必须覆盖 /subscriptions 与 /api/subscriptions');
    }
    if (!write || write.require?.csrf !== true || write.require?.login !== true) errors.push('写规则必须要求 login、feature 与 csrf');
    for (const rule of rules) if (rule?.require?.login !== true) errors.push('每条规则都要 login');
  }
  const injectRaw = /^PKAUTH_UPSTREAM_INJECT\s*=\s*'([^']*)'/m.exec(toml)?.[1]
    || /^PKAUTH_UPSTREAM_INJECT\s*=\s*"([^"]*)"/m.exec(toml)?.[1];
  if (!injectRaw) errors.push('PKAUTH_UPSTREAM_INJECT 缺失');
  else {
    try {
      const inject = JSON.parse(injectRaw);
      if (inject['x-admin-token'] !== 'ADMIN_TOKEN') errors.push('PKAUTH_UPSTREAM_INJECT 应把 x-admin-token 映射到 secret 名 ADMIN_TOKEN');
    } catch { errors.push('PKAUTH_UPSTREAM_INJECT 不是 JSON'); }
  }
  if (!/^PKAUTH_ISSUER\s*=\s*"https:\/\/id\.example\.com"/m.test(toml)) errors.push('PKAUTH_ISSUER 必须是 https://id.example.com');
  if (!/^PKAUTH_RESOURCE\s*=\s*"https:\/\/ainews\.example\.com\/api"/m.test(toml)) errors.push('PKAUTH_RESOURCE 必须是 https://ainews.example.com/api');
  if (!/^PKAUTH_ALLOWED_HOSTS\s*=\s*"ainews\.example\.com"/m.test(toml)) errors.push('PKAUTH_ALLOWED_HOSTS 必须是 ainews.example.com');
  if (!/^PKAUTH_CLIENT_ID\s*=\s*"ainews"/m.test(toml)) errors.push('PKAUTH_CLIENT_ID 必须是 ainews');
  if (!/^PKAUTH_DEFAULT\s*=\s*"public"/m.test(toml)) errors.push('PKAUTH_DEFAULT 必须是 public');
  if (!/^PKAUTH_MODE\s*=\s*"enforce"/m.test(toml)) errors.push('PKAUTH_MODE 必须是 enforce');
  for (const banned of ['ACCESS_TEAM_DOMAIN', 'AUD_AINEWS_ADMIN', 'ACCESS_OWNER_SUBS', 'ALLOWED_HOSTS', 'FEEDS_ADMIN_ENABLED']) {
    if (new RegExp(`^${banned}\\s*=`, 'm').test(toml)) errors.push(`不应出现 ${banned}`);
  }
  if (!toml.includes('PKAUTH_COOKIE_SECRET')) errors.push('需要在注释里列出 secret 名 PKAUTH_COOKIE_SECRET');
  if (/^\[\[services\]\]/m.test(toml) && /binding\s*=\s*"PKAUTH_IDP"/.test(toml) && !/^#.*PKAUTH_IDP/m.test(toml)) {
    errors.push('P1 不要启用未存在的 PKAUTH_IDP service；保持注释');
  }
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = checkAuth(readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8'));
  for (const error of errors) console.error(error);
  if (errors.length) {
    console.error(`check:auth: ${errors.length} 处不符合`);
    process.exit(1);
  }
  console.log('check:auth: passed');
}
