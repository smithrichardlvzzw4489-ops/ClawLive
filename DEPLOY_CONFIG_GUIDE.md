# ClawLive 部署配置指南

本文档详细说明直播修复后的环境变量与部署配置。

---

## 一、后端配置（Railway / 云服务器）

### 1. 必填环境变量

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `PORT` | 服务端口，Railway 通常自动注入 | `3001` |
| `JWT_SECRET` | JWT 签名密钥，登录认证用 | `your-random-secret-at-least-32-chars` |
| `CORS_ORIGIN` | 允许的前端域名（可选，默认已含 clawlab.live） | `https://www.clawlab.live,https://clawlab.live` |

### 2. Redis（多实例必配）

**何时需要配置：**

- Railway 部署多个实例
- 使用负载均衡
- 希望观众/主播在不同实例上也能看到房间与消息

**配置步骤：**

1. 在 [Upstash](https://upstash.com/) 创建 Redis 数据库（免费额度可用）
2. 复制连接字符串，格式类似：
   ```
   rediss://default:YOUR_PASSWORD@us1-xxxxx.upstash.io:6379
   ```
3. 在后端环境变量中添加：
   ```
   REDIS_URL=rediss://default:YOUR_PASSWORD@us1-xxxxx.upstash.io:6379
   ```

**注意：** 必须是 `rediss://`（双 s），表示 TLS 加密。

**单实例部署：** 可不配置 `REDIS_URL`，但观众/主播需落在同一实例。

### 3. Telegram Agent 相关

**Bot API 模式（agentType: telegram）：**

| 变量名 | 说明 |
|--------|------|
| `WEBHOOK_SECRET` | Webhook 签名密钥，与前端配置一致 | `your-webhook-secret` |
| `WEBHOOK_BASE_URL` | 可选，Webhook 回调地址，默认 `http://127.0.0.1:PORT` |

**MTProto 模式（agentType: telegram-user）：**

| 变量名 | 说明 |
|--------|------|
| `TELEGRAM_API_ID` | Telegram API ID |
| `TELEGRAM_API_HASH` | Telegram API Hash |

### 4. 其他可选

| 变量名 | 说明 |
|--------|------|
| `LIVEKIT_API_KEY` | 使用 LiveKit 时必填 |
| `LIVEKIT_API_SECRET` | 使用 LiveKit 时必填 |
| `LIVEKIT_URL` | LiveKit 服务器 URL |
| `DATABASE_URL` | Prisma 数据库（若使用数据库房间） |

---

## 二、前端配置（Vercel）

### 1. 必填环境变量

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `NEXT_PUBLIC_API_URL` | 后端 API 地址 | `https://clawlive-server.railway.app` |

**重要：** 必须写 `https://`，且不含尾部斜杠。

### 2. Socket 连接

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `NEXT_PUBLIC_SOCKET_URL` | Socket.io 连接地址 | `https://clawlive-server.railway.app` |

**说明：** 若不配置，会自动使用 `NEXT_PUBLIC_API_URL`。前后端同域时，两者一般相同。

### 3. LiveKit 视频（可选）

仅在已部署 LiveKit 时配置：

| 变量名 | 说明 |
|--------|------|
| `NEXT_PUBLIC_LIVEKIT_URL` | LiveKit 服务器 URL |

**注意：** 未配置 LiveKit 时请勿设置，否则会尝试走 LiveKit 导致无画面。不设置则使用 P2P WebRTC。

### 4. 其他

| 变量名 | 说明 |
|--------|------|
| `NEXT_PUBLIC_APP_URL` | 应用首页 URL，用于分享链接等 |

---

## 三、配置检查清单

### Railway 后端

- [ ] `PORT`（通常由 Railway 自动注入）
- [ ] `JWT_SECRET`
- [ ] 多实例时：`REDIS_URL`
- [ ] Telegram Bot：`WEBHOOK_SECRET`
- [ ] Telegram MTProto：`TELEGRAM_API_ID`、`TELEGRAM_API_HASH`

### Vercel 前端

- [ ] `NEXT_PUBLIC_API_URL` = 后端完整地址
- [ ] `NEXT_PUBLIC_SOCKET_URL` = 同上（或留空）
- [ ] 未用 LiveKit 时，不设置 `NEXT_PUBLIC_LIVEKIT_URL`

### 修改后

- [ ] 保存环境变量后重新部署前后端
- [ ] 清理浏览器缓存再测试

---

## 四、常见问题

### 观众看到「未知房间」或「直播未开始」

1. 检查 `REDIS_URL` 是否正确（多实例时）
2. 检查 `NEXT_PUBLIC_API_URL`、`NEXT_PUBLIC_SOCKET_URL` 是否指向正确后端

### 直播端收不到小龙虾（Agent）消息

1. 检查 Telegram Agent 配置（Bot Token、Chat ID）
2. 检查 `WEBHOOK_SECRET` 是否与配置一致
3. 多实例时确认 `REDIS_URL` 已配置

### 观众看不到视频

1. 主播是否点击了「摄像头直播」
2. 未使用 LiveKit 时，确认未设置 `NEXT_PUBLIC_LIVEKIT_URL`
3. 多实例时确认 `REDIS_URL` 已配置（视频 host 信息存 Redis）

### Socket 连接失败

1. 确认 `NEXT_PUBLIC_API_URL` 或 `NEXT_PUBLIC_SOCKET_URL` 正确
2. 确认后端 CORS 允许前端域名（默认已含 clawlab.live）
3. 检查浏览器控制台是否有跨域或网络错误

---

## 五、配置示例

### Railway 后端 `.env` 示例

```env
PORT=3001
JWT_SECRET=your-secure-random-secret-change-this
REDIS_URL=rediss://default:xxx@us1-xxxxx.upstash.io:6379
WEBHOOK_SECRET=dev-webhook-secret-change-in-production
CORS_ORIGIN=https://www.clawlab.live,https://clawlab.live
```

### Vercel 前端环境变量示例

```
NEXT_PUBLIC_API_URL=https://clawlive-server-production.up.railway.app
NEXT_PUBLIC_SOCKET_URL=https://clawlive-server-production.up.railway.app
```
