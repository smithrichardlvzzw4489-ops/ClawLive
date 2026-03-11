# ClawLive Broadcaster Skill

这是一个 OpenClaw 自定义 Skill，用于将龙虾的对话、日志和截图实时推送到 ClawLive 直播平台。

## 功能

- 自动推送所有聊天消息到直播间
- 记录 Agent 执行日志（action、状态、详情）
- 捕获浏览器截图并推送
- 支持 Webhook 签名验证

## 安装

### 方式 1: 手动安装

1. 复制此目录到 OpenClaw 的 skills 文件夹：
```bash
cp -r openclaw-skills/clawlive-broadcaster ~/.openclaw/skills/
```

2. 在 OpenClaw 配置中启用此 Skill

### 方式 2: 通过 OpenClaw CLI（如果支持）

```bash
openclaw skill install clawlive-broadcaster
```

## 配置

在 OpenClaw 配置文件或环境变量中设置：

```json
{
  "skills": {
    "clawlive-broadcaster": {
      "enabled": true,
      "webhookUrl": "https://your-clawlive-instance.com/api/webhooks/openclaw",
      "roomId": "your-room-id",
      "webhookSecret": "your-webhook-secret",
      "captureScreenshots": true,
      "screenshotInterval": 5000
    }
  }
}
```

或使用环境变量：

```bash
export CLAWLIVE_WEBHOOK_URL="https://your-clawlive-instance.com/api/webhooks/openclaw"
export CLAWLIVE_ROOM_ID="your-room-id"
export CLAWLIVE_WEBHOOK_SECRET="your-webhook-secret"
```

## 使用

启用 Skill 后，OpenClaw 会自动：

1. 将所有 Telegram 对话推送到直播间
2. 记录并推送 Agent 操作日志
3. 定期捕获浏览器截图（如果启用）

在直播间中，观众可以实时看到：
- 你与龙虾的完整对话
- 龙虾正在执行的任务
- 浏览器操作画面

## Webhook 签名

为了安全，所有请求都会携带 HMAC-SHA256 签名：

```
X-Webhook-Signature: <hmac-sha256(body, secret)>
```

确保在 ClawLive 和 OpenClaw 中配置相同的 `webhookSecret`。

## API 端点

### 推送消息
```
POST /api/webhooks/openclaw/{roomId}/message
```

### 推送日志
```
POST /api/webhooks/openclaw/{roomId}/log
```

### 推送截图
```
POST /api/webhooks/openclaw/{roomId}/screenshot
```

## 示例代码

参考 `skill.ts` 查看完整实现。

## 故障排查

- 确保 ClawLive 服务器可访问
- 检查 webhookSecret 是否匹配
- 查看 OpenClaw 日志确认 Skill 是否正常加载
- 使用 `curl` 测试 Webhook 端点

## 贡献

欢迎提交 PR 改进此 Skill！
