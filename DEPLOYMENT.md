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

### 2. 在 Vercel 配置环境变量（必须）

Vercel 项目 → Settings → Environment Variables，添加：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `NEXT_PUBLIC_API_URL` | `https://你的Railway域名` | **必填** - 后端 API 地址，作品视频代理依赖此变量 |
| `NEXT_PUBLIC_SOCKET_URL` | `https://你的Railway域名` | Socket.io 地址 |

> 若未配置 `NEXT_PUBLIC_API_URL`，作品视频将无法播放（代理无法连接后端）。保存后需**重新部署** Vercel 项目。

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

#### 步骤一：添加 Volume

1. 登录 [Railway 控制台](https://railway.app/dashboard)
2. 进入项目，在画布上**右键点击 clawlive-server 服务**（不要点 Redis/Postgres）
3. 在弹出菜单中找 **Add Volume** 或 **Volumes** 相关选项，点击
4. 若没有右键菜单，尝试：
   - 点击画布左侧的 **`+` 按钮** → 选择 **Volume** → 关联到 clawlive-server
   - 或按 **`Ctrl+K`**（Mac: `⌘K`）打开命令面板，搜索 **"volume"** 或 **"add volume"**
5. 配置挂载路径：**Mount Path** 填写 `/data`，保存

> **找不到 Volumes？** Railway 的 Volumes 可能不在服务详情页的标签里，需通过**右键服务**或**画布上的 + 按钮**添加。Redis/Postgres 的 Volume 是插件自带的，clawlive-server 需手动添加。

#### 步骤二：环境变量（可选）

Railway 挂载 Volume 后会自动注入 `RAILWAY_VOLUME_MOUNT_PATH`，代码已支持，**通常无需再配置**。

若挂载路径不是 `/data` 或需显式指定，可在 **Variables** 中手动添加：
```
PERSISTENT_DATA_PATH=/data
```

#### 步骤三：验证

部署完成后，以下数据将持久保存在 Volume 中，重启/重新部署不会丢失：

| 数据 | 存储路径 |
|------|----------|
| Agent 连接池 | `/data/user-agent-connections.json` |
| 直播间 Agent 配置 | `/data/room-agent-configs.json` |
| 作品 Agent 配置 | `/data/work-agent-configs.json` |
| 作品视频文件 | `/data/uploads/works/` |
| 用户关注关系 | `/data/user-follows.json` |

#### 注意事项

- **每个服务只能挂载一个 Volume**，`/data` 下会包含所有持久化文件
- 免费/试用计划 Volume 约 0.5GB，付费计划更大
- 首次添加 Volume 后，需**重新上传视频**或**重新配置 Agent**（之前的数据已丢失）
