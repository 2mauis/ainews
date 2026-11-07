# ainews（ai-content-pipeline-gray）

> **来源说明**：`src/index.js` 是从线上 Cloudflare Worker `ai-content-pipeline-gray` **只读导出**的**打包后代码**（wrangler/esbuild bundle 产物，不是原始源码）。

| 项 | 值 |
|---|---|
| 导出日期 | 2026-11-05（Asia/Taipei） |
| deployment id | `6117e3d3-9b4e-4351-8231-5d6df14bcc49` |
| version id | `109a6772-7e6c-44f8-bd22-6d0fc4a26ed7`（100%，创建于 2026-10-08 23:49 Asia/Taipei） |
| 主模块 | `src/worker.js`（3 行胶水，包住导出的 `src/index.js`） |
| compatibility_date | `2026-04-30` |

导出方式：只读 `GET` workers scripts content / settings / deployments / schedules。没有部署、没有修改任何 Cloudflare 配置，也没有读取 secret 值。

## 脱敏

- 线上真实域名替换为 `ainews.example.com`（包括 `PUBLIC_BASE_URL` 和 User-Agent 字符串）。
- D1 / R2 的 id 与名称、Account ID 不入库，`wrangler.toml` 中为占位符。
- secret 只记变量名：`ADMIN_TOKEN`、`RUN_TOKEN`。

## 本地开发

1. `node scripts/fetch-pkauth.mjs`（按 `pkauth.lock.json` 从公共 passkey-demo 拉取鉴权包；失败则不要继续安装）
2. `npm ci`
3. 在 `wrangler.toml` 把占位值（`replace-me-*`、全零 UUID，即 `<D1_DATABASE_NAME>`、`<D1_DATABASE_ID>`、`<R2_BUCKET_NAME>`）换成真实值（本地 dev 可任意值，miniflare 会建本地模拟）。域名只使用 `example.com` 占位，不在这里填写最终域名。
4. `cp .dev.vars.example .dev.vars` 并填本地测试值。
5. `npx wrangler dev`

绑定一览：`AI`（Workers AI）、`DB`（D1）、`BUCKET`（R2）、plain_text vars（见 `wrangler.toml`）、secrets `ADMIN_TOKEN` / `RUN_TOKEN` / `PKAUTH_COOKIE_SECRET`。Cron：每 4 小时（UTC 0/4/8/12/16/20 点）。

鉴权配置见 [docs/auth.md](docs/auth.md)。`src/index.js` 仍是只读导出的基线；入口改为 `src/worker.js`。

**本仓不执行部署**；部署与 Cloudflare 配置由 Jack 手动完成。
