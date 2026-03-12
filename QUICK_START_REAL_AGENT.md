# 🚀 3 分钟连接真实 OpenClaw Agent

## ⚡ 超快速开始

### 1️⃣ 准备信息（1 分钟）

打开两个链接：

**A. 获取 Bot Token:**
1. Telegram 搜索 `@BotFather`
2. 发送 `/mybots` → 选择你的 Bot → "API Token"
3. 复制 Token（类似：`123456:ABCdef...`）

**B. 获取 Chat ID:**
1. 给你的 OpenClaw Bot 发送 `/start`
2. 浏览器打开（替换 `<Token>` 为上面的 Token）：
   ```
   https://api.telegram.org/bot<Token>/getUpdates
   ```
3. 找到 `"chat":{"id":数字}`，复制这个数字

### 2️⃣ 配置脚本（30 秒）

用任意文本编辑器打开 `telegram-bridge.js`，修改第 15-17 行：

```javascript
const TELEGRAM_BOT_TOKEN = '粘贴你的Token';
const TELEGRAM_CHAT_ID = '粘贴你的ChatID';  // 纯数字，不要引号
const ROOM_ID = 'test';  // 你的房间ID
```

保存文件。

### 3️⃣ 启动（30 秒）

打开 3 个终端窗口：

**终端 1 - 后端:**
```bash
cd "d:\AI project\ClawLive\apps\server"
npx tsx src/index.ts
```

**终端 2 - 前端:**
```bash
cd "d:\AI project\ClawLive\apps\web"
npx next dev
```

**终端 3 - 桥接器:**
```bash
cd "d:\AI project\ClawLive"
node telegram-bridge.js
```

### 4️⃣ 开始直播（30 秒）

1. 浏览器打开：http://localhost:3000/rooms/test
2. 点击 **"🎬 开始直播"**
3. 在蓝色输入框输入：`你好`
4. 等待 OpenClaw Agent 回复！

---

## ✅ 成功标志

**终端 3 显示：**
```
📩 收到主播消息: "你好"
📤 转发给 Telegram Bot...
✅ 已发送给 Telegram Bot
📨 收到 Telegram 回复: "你好！..."
✅ 已推送到 ClawLive 直播间
```

**浏览器显示：**
- 你的消息（粉色）
- Agent 的回复（紫色）
- 显示 `Model: openclaw-real-agent`

---

## ❌ 遇到问题？

| 错误 | 解决方案 |
|------|----------|
| "请先配置 TELEGRAM_BOT_TOKEN" | 你没有编辑 `telegram-bridge.js` |
| "Unauthorized" | Bot Token 错误，重新复制 |
| "Chat not found" | Chat ID 错误或没给 Bot 发过消息 |
| "ECONNREFUSED" | ClawLive 服务器没启动 |
| Agent 不回复 | 等待 5-10 秒，或检查 OpenClaw 是否运行 |

详细故障排查：[CONNECT_REAL_AGENT.md](./CONNECT_REAL_AGENT.md)

---

## 🎯 完整示例

```javascript
// telegram-bridge.js 配置示例
const TELEGRAM_BOT_TOKEN = '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz';
const TELEGRAM_CHAT_ID = 987654321;  // ← 注意：这里是数字，不要引号
const ROOM_ID = 'test';
```

---

## 🎉 成功！

现在你可以在直播间与真实的 OpenClaw Agent 对话了！

**接下来可以尝试：**
- 问 Agent 查询信息
- 让 Agent 浏览网页
- 让 Agent 执行复杂任务
- 邀请观众围观！

享受 AI Agent 直播的乐趣！🦞✨
