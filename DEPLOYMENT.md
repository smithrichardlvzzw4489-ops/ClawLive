# ClawLive 部署配置

## 架构

- **clawlive-web**：Vercel（Next.js 前端）→ 可绑定自定义域名 `clawlab.live`
- **clawlive-server**：Railway（Express + Socket.io）
- **Redis**：Railway
- **Postgres**：Railway

> 自定义域名配置详见 [docs/clawlab.live-域名配置指南.md](docs/clawlab.live-域名配置指南.md)

## 解决「无法连接服务器」

前端报错说明 Vercel 上的前端没有正确指向 Railway 后端。

### 1. 获取 Railway 后端公网地址

在 Railway 控制台 → clawlive-server → Settings → Networking → 生成 Public Domain，得到类似：

```
https://clawlive-server-production-xxxx.up.railway.app
```

### 2. 在 Vercel 配置环境变量

Vercel 项目 → Settings → Environment Variables，添加：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `NEXT_PUBLIC_API_URL` | `https://你的Railway域名` | 后端 API 地址 |
| `NEXT_PUBLIC_SOCKET_URL` | `https://你的Railway域名` | Socket.io 地址 |

保存后需重新部署 Vercel 项目。

### 3. 在 Railway 配置 CORS

Railway → clawlive-server → Variables，添加：

| 变量名 | 值 |
|--------|-----|
| `CORS_ORIGIN` | `https://你的Vercel域名.vercel.app` |

多个域名用逗号分隔，例如：`https://a.vercel.app,https://b.vercel.app`

## Railway 后端环境变量

- `DATABASE_URL`：由 Railway Postgres 插件自动注入
- `REDIS_URL`：由 Railway Redis 插件自动注入
- `JWT_SECRET`、`JWT_REFRESH_SECRET`：需手动设置
- `CORS_ORIGIN`：前端域名，用于 CORS
- `PERSISTENT_DATA_PATH`：**重要** - Agent 连接、作品配置等持久化数据目录。Railway 默认为临时文件系统，重启/部署后 `.data` 会丢失。需添加 Volume 并设置此变量指向挂载路径（如 `/data`），否则每次部署后需重新配置 Agent

### 配置持久化存储（避免「之前的连接没保存」「作品视频无法播放」）

1. Railway → clawlive-server → Volumes → Add Volume，挂载路径如 `/data`
2. Variables 添加：`PERSISTENT_DATA_PATH=/data`
3. 重新部署后，Agent 连接、作品 Agent 配置、**作品视频文件** 等将持久保存
