# 独立测试环境 ainews.spicas.cc

> 按 passkey-demo `docs/workflow-v2.md`（提交 `89a9453346369e7853c09b93982f8223b863a9e9`，blob `9322623ecab1f63094d3c021e07f70300ed05df5`）的 spec 模板写。本文件不部署。

## 背景/目标

生产 Worker 名是 `ai-content-pipeline-gray`，已有自己的域名、D1、R2 和 AI 绑定。Jack 要求另加一条只用于测试 `ainews.spicas.cc`。只读核对时，`ainews-test`、`ainews-test-db`、`ainews-test-assets` 没有重名，也还没有创建。

目标是一份不会覆盖生产的 Wrangler 环境：`npx wrangler deploy --env test` 才会选中它。顶层 `wrangler deploy` 仍然指向 `ai-content-pipeline-gray`，本 PR 不执行任何部署。

## 非目标

- 不创建 Worker、D1、R2、DNS 或 secret。
- 不读取、不复制、不写入生产 D1/R2，不改生产 Worker 或旧域名。
- 不合并，不推 `main`。
- 不重打 `src/index.js`，不改订阅功能。
- 不把第三方 bundle 的来源说成已经逐字节证完。
- 不在本 PR 做复杂限流或防滥用。

## 不变量

- 顶层 `name`、cron、`[ai]`、全零 D1 占位和 `example.com` 鉴权占位保持原样。
- `workers_dev = false`。
- P1 规则继续要求登录。未登录的 `/subscriptions` 在 `Accept: text/html` 下 302 到 `/_pkauth/login`；`/api/subscriptions` 401，body 为 `unauthorized`。
- 缺少 `PKAUTH_COOKIE_SECRET` 或规则配置不完整时，受保护路径是 503，不是公开。
- Host 不在 `PKAUTH_ALLOWED_HOSTS` 时，受保护路径 421。
- test 环境的 `triggers.crons` 必须是空数组。只注释 cron 不会取消继承。
- test 环境不声明 `[ai]`、D1、R2。`DAILY_AI_CALL_LIMIT = "0"`，因此配额判断在调用 `env.AI.run` 之前就停。没有 AI 绑定也不会在这条路径上调用模型。
- `limits.cpu_ms` 和 `limits.subrequests` 写在 Wrangler 4.157 的 schema 和[官方 limits 说明](https://developers.cloudflare.com/workers/wrangler/configuration/#limits)里，但只对 Standard Usage Model 生效，而且不是费用上限。账户计划未读到，所以配置里不写这两个字段。
- 创建空 Worker 或空 D1 不是新开一种订阅。已有 R2 订阅下新建 bucket 也不另开 R2 订阅。`subscriptions` 接口 403 不能推出收费或扩权。不能把「保证零成本」写成阻断。按量是否发生仍未知，见风险。

## 验收测试清单

- [x] 需求：顶层生产名和 6 条 cron 还在，且顶层没有 `ainews.spicas.cc`。测试：`tests/test-env.test.mjs` →「顶层生产配置保持原 Worker 名和 cron」。验证面：本地读取 `wrangler.toml`。
- [x] 需求：test 环境名为 `ainews-test`，`crons = []`，无 AI/D1/R2/limits 绑定，不出现生产占位。测试：同文件 →「test env 显式关闭 cron，且不继承生产绑定」。验证面：本地。
- [x] 需求：匿名打开 `https://ainews.spicas.cc/subscriptions` 得到 302，`/api/subscriptions` 得到 401。测试：同文件 →「匿名订阅页跳登录，API 返回 401」。验证面：本地，不访问 IdP。
- [x] 需求：没有 cookie secret 时订阅页和 API 都是 503。测试：同文件 →「没有 cookie secret 时受保护路径 503，不降为公开」。验证面：本地。
- [x] 需求：测试配置不接受 `ainews.example.com` 上的受保护请求。测试：同文件 →「测试 Host 以外的受保护请求返回 421」。验证面：本地。
- [ ] 需求：线上 Host、证书和自定义域生效。验证面：线上。本 PR 不部署，待单独批准。
- [ ] 需求：IdP 登录往返、feature 和写操作 CSRF。验证面：IdP 登记完成之后。没有登记时不能用放宽规则代替。

## 无 IdP 时可以验证的失败

这些不需要创建真实账号，也不需要 IdP 里已经有 client：

- `GET /subscriptions` 或 `/subscriptions/`，`Accept: text/html`：302，`Location` 以 `/_pkauth/login?return_to=` 开头。
- `GET /api/subscriptions`，以及未登录的 `POST`：401，`{"error":"unauthorized"}`。CSRF 在登录之后才检查。
- 其它 Host：421。
- `PKAUTH_MODE=off` 或缺少 32 字节 base64url 的 `PKAUTH_COOKIE_SECRET`：受保护路径 503，`/health` 仍公开。
- `/_pkauth/login` 在 secret 和 issuer 占位都在时会 302 到 issuer 的 `/oauth/authorize`。issuer 仍是 `https://id.example.com` 时，这一跳不能完成登录。

## 必须登记 IdP 之后才能验证的登录

- client id `ainews-test`。
- redirect URI `https://ainews.spicas.cc/_pkauth/callback`。
- issuer 必须与发现文档逐字相同。真实 issuer 还没有，不能写进仓库。
- audience `https://ainews.spicas.cc/api`。
- scope `openid`、`profile`、`offline_access`。
- 测试账户的 `ainews:feeds.read` 与 `ainews:feeds.write`。
- 写操作还要同源 `Origin` 和 `X-PKAuth-CSRF: 1`。Bearer 不要求这个头。

## 当前配置还不是完整应用

`[env.test]` 没有 D1、R2、AI。这只够做鉴权失败测试：未登录 302/401、错误 Host 421、缺少 cookie secret 时 503。订阅读写、归档和摘要都还不能在线上跑。完整测试要等空的 `ainews-test-db`、`ainews-test-assets` 创建之后，把绑定写进 `[env.test]` 再发一版。id 不入库为账户 secret；绑定名可以进仓库，secret 值不行。

## 绑定与 cron 的依据

[Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) 写明：多数键会继承；`vars`、`r2_buckets` 等绑定不继承，每个环境要自己写。同一页的 Non-inheritable keys 列出了 `r2_buckets` 和 `vars`，没有点名 `d1_databases` 或 `ai`。本仓 Wrangler 4.157.0 的配置归一化把 `ai`、`d1_databases`、`r2_buckets` 都标成 notInheritable。本地 `wrangler deploy --dry-run --env test` 的绑定列表里只有 `[env.test.vars]`，没有 AI、D1、R2。

`triggers` 会继承。同一页写明：要关掉 Cron，必须 `crons = []`；只注释 `crons` 不会关掉。test 环境因此写了 `[env.test.triggers]` 和 `crons = []`。

## 首次上线的命令顺序

依据是 [Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[Wrangler workers commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/) 和本机 `wrangler 4.157.0 --help`。下面每条都要带 `--env test`。不带 `--env` 会选中顶层 `ai-content-pipeline-gray`。本 PR 不执行这些命令。

1. 先有一版代码，再挂 secret。`npx wrangler versions upload --env test --secrets-file <不入库的本地文件>` 把代码和最多 100 个 secret 打成一个版本。官方对该命令的说明是 uploaded version is not deployed immediately。4.157 help 写的是 Uploads your Worker code and config as a new Version，并写明 secrets are never deleted by deployments；`--secrets-file` 未列出的 secret 会从上一版保留。第一版没有上一版，所以三个名字要一次性写进那个本地文件：`PKAUTH_COOKIE_SECRET`、`ADMIN_TOKEN`、`RUN_TOKEN`。这三个值还没有生成。
2. 不要用一串 `wrangler versions secret put` 来挂第一个 Worker 的多个 secret。官方没有写它在 Worker 不存在或还没有任何版本时能否成功，也没有写连续多次会不会带上前一次的 secret。4.157 程序在没有已上传版本时的错误文案是要先 upload；这不是官方文档句子，所以不把它当成已证实的公开步骤。`wrangler secret put` 则被官方写成 creates a new version and deploys it immediately，不能用。
3. 上线用这一版的 version id：`npx wrangler versions deploy --env test`。官方说明 `wrangler deploy` 会创建新版本并立刻把流量切到 100%。4.157 的 deploy help 同样写 secrets are never deleted by deployments。因此之后的普通 `deploy --env test` 不会删掉已有 secret，但它上传的是新代码版本并立即上线，不是把第 1 步那个未部署版本原样升上去。指定版本上线只用 `versions deploy`。
4. 自定义域什么时候绑上，官方没有写成 `versions upload` 或 `versions deploy` 的效果。单独写明会改 Routes、domains 和 Cron 的命令是实验性的 `wrangler triggers deploy`。在批准上线之前不要跑它。`ainews.spicas.cc` 已写在 `[[env.test.routes]]`，顶层没有这条路由。

## 数据

`migrations/ainews-test-db.sql` 只根据 `src/index.js` 里的 SQL 语句推断，不是生产库导出，也还没有独立审查。审查通过之前不要在任何真实 D1 上执行，包括将来的空库 `ainews-test-db`。没有 D1 绑定时，鉴权失败仍然发生在进入 `env.DB` 之前。登录成功后的订阅读写才会碰到缺库，那时应失败，而不是改成不登录可读。

R2 只在 `ARCHIVE_RAW=true` 且存在 `BUCKET` 时写入。test 环境两者都没有。官方说明单桶存储没有硬上限，也没有已证实的每桶固定费用；账户默认桶数量上限之上才另计。见 [R2 limits](https://developers.cloudflare.com/r2/platform/limits/)。D1 的库数量和容量随计划不同，见 [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)。计划未读到，所以不判断这一个空库是否落在包含额度内。

## 风险

中。配置本身不接触生产，但有人若执行不带 `--env test` 的 `wrangler deploy`，会更新顶层生产 Worker。`secret put` 会创建版本并立即部署；`versions secret put` 只造待部署版本。本 PR 不跑这两条。

回退：不部署就没有线上变化。若将来错误部署了 `ainews-test`，删除或停止该测试 Worker，不回滚生产脚本。测试环境把 `PKAUTH_MODE` 设为 `off` 只让受保护路径变 503，不会变成公开可写。

费用：空 Worker、空 D1 不是新订阅；已有 R2 订阅下的新桶也不是新订阅。403 不推出必须扩权或已经收费。按量消费是否发生未知，因此不承诺零成本，也不把这个未知当成阻断。测试不挂 cron、不绑 AI、不自动抓取、不写生产数据。手动调用 `/run` 或 `/api/articles/refresh-top` 仍会抓取外部源，测试时不要调用。复杂防滥用留到后续 PR。

## 是否重大改动

用户已经尝试过测试部署授权。这里不再把「整项部署批准」说成还没人提过。本 PR 仍然不执行部署。workflow v2 的合并和 Codex 评审是另一件事，仍是 pending。执行端是 Cursor 里的 Grok，不把评审记成已经完成。

应用已有文档把 IdP 写成 pkauth：`docs/auth.md` 的 issuer 占位是 `https://id.example.com`，未绑定 `PKAUTH_IDP` 时走 HTTPS，不新选一套外部登录服务。真实 issuer 主机名仍要用户定一次。在那之前，client `ainews-test` 无法完成登记。
