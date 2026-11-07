# ainews 鉴权

ainews 不写鉴权判断。入口只有 `src/worker.js` 三行：把基线交给 `@pkauth/workers` 的 `protect()`。开关、路径、登录和上游密钥桥都在组件里，由 `wrangler.toml` 的 `PKAUTH_*` 声明。

组件说明与 S-1–S-16 在 pkauth 组件仓（`@pkauth/core`、`@pkauth/workers`）。本页只记录 ainews 用了哪些配置。

## 配置

| 键 | 本仓的值 | 作用 |
|---|---|---|
| `PKAUTH_ISSUER` | `https://id.example.com` | IdP issuer，必须与 discovery 逐字相同 |
| `PKAUTH_CLIENT_ID` | `ainews` | 在 IdP 登记的 client |
| `PKAUTH_RESOURCE` | `https://ainews.example.com/api` | access token 的 audience |
| `PKAUTH_ALLOWED_HOSTS` | `ainews.example.com` | 其它 Host 访问受保护路径返回 421 |
| `PKAUTH_DEFAULT` | `public` | 未命中规则的路径按基线原样处理 |
| `PKAUTH_MODE` | `enforce` | 改成 `off` 时受保护路径返回 503，公开路径不变 |
| `PKAUTH_RULES` | 见 `wrangler.toml` | 只保护 `/subscriptions*` 与 `/api/subscriptions*` |
| `PKAUTH_UPSTREAM_INJECT` | `x-admin-token` → secret 名 `ADMIN_TOKEN` | 授权通过后把遗留 secret 注入上游，调用方拿不到该值 |
| `PKAUTH_COOKIE_SECRET` | secret，不入库 | 32 字节随机数的 base64url。组件不接受任意字符串 |
| `PKAUTH_IDP` | 注释掉的 service binding | 同账户时再打开；未绑定则走 HTTPS |

`workers_dev = false`。入口 `main = "src/worker.js"`。D1、R2、AI、cron 占位保持不变。

P1 规则只做本地判断：登录、feature（`ainews:feeds.read` / `ainews:feeds.write`）、写操作的 `csrf`。故意不写 `online`。IdP 的 `/ent/v1/check` 属于 P2；规则里若写 `online: true`，接口不存在时写操作会 503（失败关闭）。

## 依赖

`@pkauth/core` 与 `@pkauth/workers` 不在 npm 上发布，上游 `package.json` 也标了 `private`。ainews 不保存一份鉴权源码。`pkauth.lock.json` 锁定公共仓库 `2mauis/passkey-demo` 的一个提交，以及每个源文件的 sha256。

当前锁定：

- 仓库：`https://github.com/2mauis/passkey-demo.git`
- 提交：`89a9453346369e7853c09b93982f8223b863a9e9`（公共 `main`，不是 staging，也不是 npm release）
- 取 `packages/core`、`packages/workers` 和根目录 `LICENSE`

`node scripts/fetch-pkauth.mjs` 在构建前拉取该提交。哈希或文件集合不符、git 失败时，脚本退出且不留下半份 `vendor/`。`npm ci` 之前必须先跑这个脚本。workers 包里的 `@pkauth/core` 在落盘时改成 `file:../pkauth-core`，因为 `0.1.0` 不在 npm。jose 的 devDependency 和 `jose-cross` 测试不进入 ainews，本仓不安装 jose。

更新上游：把 `pkauth.lock.json` 的 `commit` 改成公共仓上的新提交，再运行拉取脚本核对哈希后，把新的 sha256 写回锁文件并提交。不要跟踪分支名，不要改 DNS 或线上域名。配置里的域名继续只用 `example.com` 占位，最终域名由 Jack 指定。

## 行为摘要

- 未登录打开 `/subscriptions`：302 到 IdP 登录，再回到该页。
- 未带凭据调用 `/api/subscriptions`：401 JSON，不跳转。
- 写操作使用 cookie 会话时，还要同源 `Origin` 和 `X-PKAuth-CSRF: 1`。Bearer 调用不要求这个头。
- 只有 `ainews:feeds.read` 时，写操作 403。
- 公开路径（`/`、`/health`、`/api/articles` 等）与基线一致。
- `/run`、`/api/linkwarden/save` 等 P1 不加规则，仍由基线自己的 secret 判断。
- 回滚只把 `PKAUTH_MODE` 设为 `off`。受保护路径变为 503，不会回到公开可写。

## Jack 稍后手工做的事

本 PR 不部署，不改 Cloudflare，不写线上 secret。

1. 在 IdP 登记 client `ainews`。`redirect_uri` 为 `https://ainews.example.com/_pkauth/callback`（换成真实域名时只改部署配置，不要把真实域名提交进仓库）。允许 scope `openid` 和 `offline_access`。audience 为 `https://ainews.example.com/api`。
2. 给账户授予 `ainews:feeds.read` 和 `ainews:feeds.write`。
3. 设置 secret `PKAUTH_COOKIE_SECRET`（32 字节随机数的 base64url）。保留已有的 `ADMIN_TOKEN` / `RUN_TOKEN`。
4. 确认自定义域的 Host 在 `PKAUTH_ALLOWED_HOSTS` 里，并且 `workers_dev` 保持关闭。同账户需要 service binding 时，再取消 `PKAUTH_IDP` 注释并填上真实服务名。
5. 部署由 Jack 另行执行。回滚：把 `PKAUTH_MODE` 改为 `off`。

## 独立测试环境

`[env.test]` 只服务尚未创建的 Worker `ainews-test` 和主机 `ainews.spicas.cc`。顶层生产配置不动。issuer 仍是 `https://id.example.com` 占位；真实值是已部署 IdP 的 `ORIGIN`，本任务不读取 discovery。client id 用已登记的 `ainews`。`ainews.spicas.cc` 的回调还没登记。`EXTERNAL_FETCH=off` 时不抓外网。三个 secret 都还没有生成。部署顺序见 [docs/specs/independent-test-env.md](specs/independent-test-env.md)。

## 本地检查

```sh
npm test
npm run check:auth
```

`npm test` 含基线冒烟、INV-P1.3，以及 vendor 里的契约测试。`check:auth` 只检查 `wrangler.toml` 的键和 P1 规则形状。
