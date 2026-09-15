# Medical-Web-Frontend

医院管理端（React 19 + TanStack Start）。构建产物是纯静态 SPA，接口全部来自统一 Go 后端，
契约见 [spec/04-api-contract.md](../spec/04-api-contract.md)。

本文只讲两件事：**怎么部署**、**出问题怎么查**。

## 部署

### 1. 前置条件

- Node.js `^20.19.0` 或 `>=22.12.0`（Vite 8 的要求）
- 已部署的 Go 后端（容器默认监听 `127.0.0.1:9080`）
- 线上静态托管：宿主机 nginx，站点配置见
  [Medical-Web-Backend/deploy/nginx.conf](../Medical-Web-Backend/deploy/nginx.conf)

### 2. 环境变量

| 变量 | 取值要求 |
| --- | --- |
| `VITE_BASE_URL` | **必须留空**：浏览器走同源相对路径 `/api/v1/*`，由开发代理或线上 nginx 转发 |
| `VITE_DEV_PROXY_TARGET` | 开发代理目标，默认 `https://medical.jxutcm.top`；**必须写 https**，写 http 会被服务端 301 跳转，而代理不跟随重定向 |
| `VITE_MINIO_URL` / `VITE_MINIO_BUCKET` | 医生照片等资源地址，需与后端 `MINIO_*` 指向同一个桶 |

`.env.production` 随仓库提交（内容不含密钥，保证本地构建与 CI 产出一致）；`.env` 是本地私有配置，已被 git 忽略。
开发代理的 `/api` 前缀规则配在 `vite.config.ts`，请求封装与 `X-Request-Id` 生成在 `src/lib/api.tsx`。

### 3. 本地开发

```bash
npm install
npm run dev            # http://localhost:3000
```

前端与后端不同源，登录 Cookie 是 `SameSite=Lax`，只有经过代理（同源）才会被浏览器带回，
所以本地调试不要把接口地址写成绝对地址。

### 4. 构建与发布

```bash
npm run check          # Biome 检查
npm run build          # 产物在 dist/client/：_shell.html + assets/，没有 index.html
rsync -a --delete dist/client/ /var/www/medical-web/    # 同步到 nginx 站点根目录
```

nginx 侧三个必须项（完整配置见 `../Medical-Web-Backend/deploy/nginx.conf`）：

1. 站点根目录指向静态产物目录，`index` 写 `_shell.html`；
2. `location /api/` 用 `proxy_pass http://127.0.0.1:9080;`，结尾**不带 `/`**；
3. `location /` 回退到 `/_shell.html`，`/assets/` 单独 `try_files $uri =404` 并开长缓存。

## 调试

### 排查顺序

1. 打开浏览器 Network，确认接口请求是**同源**的 `/api/v1/...`；出现绝对地址说明 `VITE_BASE_URL` 配错了。
2. 登录相关问题先怀疑 Cookie：接口返回 200 但页面立刻判未登录，基本是没走代理（跨站）或协议不匹配。
3. 接口报错看 `ApiError.code`（后端统一错误体里的字符串 `code`），不要只看 HTTP 状态码。
4. 每个请求都带 `X-Request-Id`，拿这个值去后端日志里定位同一次请求。
5. 页面级问题看 TanStack Query 的 error 状态，以及页面四态（loading / empty / error / success）。

### 常见现象

| 现象 | 排查方向 |
| --- | --- |
| 登录接口 200，紧接着跳回登录页 | 请求没走代理或不同源，Cookie 没带上：确认 `VITE_BASE_URL` 留空、代理目标是 https |
| 开发环境接口 404 | `VITE_DEV_PROXY_TARGET` 指向的服务没起或域名写错；代理只转发 `/api` 前缀 |
| 页面能打开，刷新深链 404 | nginx 缺 SPA 回退，回退目标必须是 `_shell.html`，不是 `index.html` |
| 静态资源 404 却返回了 HTML | `/assets/` 少配 `try_files $uri =404`，被 SPA 回退接管了 |
| 医生照片不显示 | `VITE_MINIO_URL` / `VITE_MINIO_BUCKET` 与后端 `MINIO_*` 不一致，或桶未开公开读 |
| 本地直连后端跨域失败 | 后端 CORS 只放行带端口的 `Origin`，且允许的请求头不含 `X-Request-Id`；优先用 dev 代理，不要改成绝对地址 |
| 构建报 Node 版本错误 | 升级到 Node 20.19+ / 22.12+ |
