#!/usr/bin/env node
// 隐私规则扫描（确定性正则，不调用任何外部服务）。
// 用法：
//   node scripts/privacy-scan.mjs                扫描 git ls-files 列出的全部已跟踪文本文件
//   node scripts/privacy-scan.mjs --diff BASE    只扫 BASE...HEAD 新增行
//   node scripts/privacy-scan.mjs --files a b    扫指定文件
//   node scripts/privacy-scan.mjs --stdin        扫标准输入（如 PR 正文）
// 可选 PRIVACY_WORDLIST=<不入库的词表文件>，每行一个禁止出现的词（大小写不敏感）。
// 命中时只输出 文件:行号 与规则名，不输出命中值本身。正则不能发现任意姓名或自然语言地址，仍需人工审查。
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

// 只放行整文件字节已核对的上游许可证。版权行依法必须保留，不能改许可证原文。
// 路径或字节任一不符就按普通文件扫描。这不放行其他邮箱、凭据或 Jack 的提交邮箱。
export const REVIEWED_COPYRIGHT_FILES = {
  'third-party/npm/boolbase-2.0.0-LICENSE': 'cdf4d87ae0a6c160227263bf4e39a0a10e30e89ae7256e0f7ac7bde0836552c6',
  'third-party/npm/htmlparser2-10.1.0-LICENSE': '204cfa747341660e4da64cd23e8c876c6b20279d247f48564993d3fc4a2eab47',
};

export function isReviewedCopyrightFile(file, bytes) {
  const expected = REVIEWED_COPYRIGHT_FILES[String(file).replaceAll('\\', '/')];
  if (!expected) return false;
  return createHash('sha256').update(bytes).digest('hex') === expected;
}

const ALLOW_EMAIL = /(@users\.noreply\.github\.com|@example\.(com|org|net)|@localhost|^git@github\.com)$/i;
const DOC_IP = /^(192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|127\.|0\.0\.0\.0$|255\.255\.255\.)/;
export const RULES = [
  { id: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, ok: (m) => ALLOW_EMAIL.test(m) },
  { id: 'ipv4', re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, ok: (m) => DOC_IP.test(m) },
  { id: 'workers-dev-subdomain', re: /\b[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev\b/gi, ok: (m) => /\.example\.workers\.dev$|^<[^>]*>/i.test(m) || /\.(your-subdomain|example)\.workers\.dev$/i.test(m) },
  { id: 'kv-or-account-id', re: /\b[0-9a-f]{32}\b/g, ok: (m) => /^0+$/.test(m) },
  { id: 'turnstile-sitekey', re: /\b0x4[A-Za-z0-9_-]{18,}\b/g, ok: () => false },
  { id: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, ok: () => false },
  { id: 'github-token', re: /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g, ok: () => false },
  { id: 'cloudflare-token-like', re: /\b[A-Za-z0-9_-]{40}\b/g, ok: (m) => !/[0-9]/.test(m) || !/[A-Z]/.test(m) || !/[a-z]/.test(m) },
  { id: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, ok: () => false },
  { id: 'aws-key', re: /\bAKIA[0-9A-Z]{16}\b/g, ok: () => false },
  { id: 'tailnet-or-lan-host', re: /(?<![\w.])[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:ts\.net|internal|home\.arpa)\b|(?<=\/\/|@)[a-z0-9-]+\.(?:local|lan)\b/gi, ok: () => false },
];
const words = process.env.PRIVACY_WORDLIST && existsSync(process.env.PRIVACY_WORDLIST)
  ? readFileSync(process.env.PRIVACY_WORDLIST, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean) : [];
const SKIP_DIRS = new Set(['node_modules', '.wrangler']);
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|woff2?)$/i;
// 按路径段判断，避免未锚定的正则分支误跳相似文件名（如 my-node_modules-notes.md）
export function shouldSkip(file) {
  const parts = String(file).split('/');
  return parts.slice(0, -1).some((p) => SKIP_DIRS.has(p)) || parts[parts.length - 1] === 'package-lock.json' || BINARY_EXT.test(file);
}

export function scanText(text, where) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    if (/privacy-scan:\s*allow/.test(line)) return; // 显式豁免（需在 PR 中说明理由） // nosemgrep: ajinabraham.njsscan.dos.regex_dos.regex_dos -- 固定字面量正则，无嵌套量词
    for (const r of RULES) for (const m of line.matchAll(r.re)) if (!r.ok(m[0])) hits.push(`${where}:${i + 1} ${r.id}`);
    for (const w of words) if (line.toLowerCase().includes(w.toLowerCase())) hits.push(`${where}:${i + 1} wordlist`);
  });
  return hits;
}
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20 });
function main() {
  const [mode, ...rest] = process.argv.slice(2);
  let hits = [];
  if (mode === '--stdin') hits = scanText(readFileSync(0, 'utf8'), 'stdin');
  else if (mode === '--files') for (const f of rest) {
    const buf = readFileSync(f);
    if (!buf.includes(0) && !isReviewedCopyrightFile(f, buf)) hits.push(...scanText(buf.toString('utf8'), f));
  }
  else if (mode === '--diff') {
    let file = '', ln = 0;
    for (const line of git('diff', '--no-ext-diff', '-U0', `${rest[0]}...HEAD`).split('\n')) {
      if (line.startsWith('+++ ')) { file = line.slice(6); continue; }
      const h = /^@@ -\S+ \+(\d+)/.exec(line); if (h) { ln = Number(h[1]); continue; }
      if (line.startsWith('+') && !shouldSkip(file)) { hits.push(...scanText(line.slice(1), `${file}`).map((x) => x.replace(/:1 /, `:${ln} `))); ln++; }
    }
  } else {
    for (const f of git('ls-files', '-z').split('\0').filter(Boolean)) {
      if (shouldSkip(f) || !existsSync(f)) continue;
      const buf = readFileSync(f); if (buf.includes(0) || isReviewedCopyrightFile(f, buf)) continue;
      hits.push(...scanText(buf.toString('utf8'), f));
    }
  }
  for (const h of hits) console.error(h);
  console.log(`privacy-scan: ${hits.length} 处命中`);
  process.exitCode = hits.length ? 1 : 0;
}
if (import.meta.url === `file://${process.argv[1]}`) main();
