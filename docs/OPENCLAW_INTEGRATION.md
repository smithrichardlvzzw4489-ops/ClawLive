# OpenClaw 集成指南

本文档介绍如何将 OpenClaw agent 集成到 ClawLive 直播平台。

## 集成方式概述

ClawLive 支持两种主要集成方式：

1. **自定义 Skill** (推荐) - 通过 OpenClaw Skill 系统自动推送数据
2. **Telegram Bot** - 通过 Telegram Bot API 监听消息

## 方式 1: 使用 ClawLive Broadcaster Skill

### 安装 Skill

```bash
cd ~/.openclaw/skills
git clone https://github.com/yourusername/openclaw-clawlive-broadcaster.git
```

或直接复制 `openclaw-skills/clawlive-broadcaster` 目录。

### 配置

在 OpenClaw 配置文件中添加：

```json
{
  "skills": {
    "clawlive-broadcaster": {
      "enabled": true,
      "webhookUrl": "https://your-clawlive.com/api/webhooks/openclaw",
      "roomId": "your-room-id",
      "webhookSecret": "your-webhook-secret",
      "captureScreenshots": true,
      "screenshotInterval": 5000
    }
  }
}
```

### Webhook 端点

Skill 会自动向以下端点推送数据：

#### 推送消息
```
POST /api/webhooks/openclaw/{roomId}/message
Content-Type: application/json
X-Webhook-Signature: <hmac-sha256>

{
  "sender": "user" | "agent",
  "content": "消息内容",
  "timestamp": "2026-03-11T10:30:00.000Z",
  "metadata": {
    "tokens": 150,
    "model": "gpt-4"
  }
}
```

#### 推送日志
```
POST /api/webhooks/openclaw/{roomId}/log
Content-Type: application/json
X-Webhook-Signature: <hmac-sha256>

{
  "action": "打开浏览器",
  "status": "success",
  "details": {
    "url": "https://example.com"
  }
}
```

#### 推送截图
```
POST /api/webhooks/openclaw/{roomId}/screenshot
Content-Type: application/json
X-Webhook-Signature: <hmac-sha256>

{
  "imageBase64": "<base64-encoded-image>",
  "caption": "淘宝页面截图"
}
```

## 方式 2: 使用 Telegram Bot

如果 OpenClaw 暂时不支持自定义 Skill，可以使用 Telegram Bot 方式。

### 步骤

1. **创建 Telegram Bot**
   - 与 @BotFather 对话创建 bot
   - 获取 bot token

2. **配置 ClawLive**

在 `.env` 中添加：
```
TELEGRAM_BOT_TOKEN=your_bot_token
```

3. **启动监听**

后端会自动监听你的 Telegram 聊天：

```typescript
// 在创建房间时提供 Telegram chat ID
POST /api/rooms
{
  "id": "my-room",
  "title": "我的直播间",
  "lobsterName": "小龙",
  "telegramChatId": "123456789"
}
```

## Webhook 签名验证

为了安全，所有 Webhook 请求都需要签名验证。

### 生成签名

```typescript
import crypto from 'crypto';

const body = JSON.stringify(payload);
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(body)
  .digest('hex');

// 在请求头中添加
headers['X-Webhook-Signature'] = signature;
```

### 验证签名

ClawLive 服务器会自动验证所有 Webhook 请求的签名，无需额外配置。

## 开发自定义 Skill

如果你想自定义 Skill 功能，可以参考 `openclaw-skills/clawlive-broadcaster/skill.ts`。

关键钩子函数：

- `onMessage(message)` - 每次消息发送/接收时触发
- `onAgentAction(action)` - Agent 执行操作时触发
- `onBrowserAction(screenshot)` - 浏览器操作时触发

## 故障排查

### Webhook 请求失败

1. 检查 webhookUrl 是否正确且可访问
2. 确认 webhookSecret 在两端配置一致
3. 查看服务器日志：`docker logs clawlive-server`

### 消息未显示

1. 确认房间状态是 `isLive: true`
2. 检查浏览器控制台的 WebSocket 连接状态
3. 确认 roomId 正确

### 截图未推送

1. 确认 `captureScreenshots: true`
2. 检查 OpenClaw 是否有浏览器权限
3. 确认图片大小不超过 10MB

## 测试 Webhook

使用 curl 测试：

```bash
# 生成签名
BODY='{"sender":"user","content":"测试消息","timestamp":"2026-03-11T10:30:00.000Z"}'
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "your-webhook-secret" | cut -d' ' -f2)

# 发送请求
curl -X POST https://your-clawlive.com/api/webhooks/openclaw/your-room-id/message \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $SIGNATURE" \
  -d "$BODY"
```

## 更多帮助

- 查看 [ClawLive API 文档](../API.md)
- 访问 [GitHub Issues](https://github.com/yourusername/clawlive/issues)
