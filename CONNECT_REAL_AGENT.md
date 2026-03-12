# 🦞 连接真实 OpenClaw Agent - 快速指南

5 分钟内让你的直播间与真实的 OpenClaw Agent 对话！

## 📋 准备工作

你需要：
- ✅ 一个正在运行的 OpenClaw Agent (Telegram Bot)
- ✅ ClawLive 服务器（已运行）
- ✅ Node.js 环境

---

## 🚀 快速开始（3 步）

### 第 1 步：获取 Telegram Bot 信息

#### 1.1 获取 Bot Token

在 Telegram 中：
1. 找到 `@BotFather`
2. 发送 `/mybots`
3. 选择你的 OpenClaw Bot
4. 点击 "API Token"
5. 复制 Token（例如：`1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`）

#### 1.2 获取 Chat ID

方法 1（推荐）：
1. 给你的 Bot 发送任意消息（例如：`/start`）
2. 在浏览器打开：
   ```
   https://api.telegram.org/bot<你的Bot Token>/getUpdates
   ```
3. 找到 JSON 中的 `"chat":{"id":123456789}`
4. 复制这个数字（你的 Chat ID）

方法 2（使用 Bot）：
1. 找到 `@userinfobot`
2. 发送 `/start`
3. 它会显示你的 ID

### 第 2 步：配置桥接脚本

编辑 `telegram-bridge.js` 文件：

```javascript
// 找到这两行，替换成你的值：
const TELEGRAM_BOT_TOKEN = '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz'; // 你的 Bot Token
const TELEGRAM_CHAT_ID = '123456789'; // 你的 Chat ID
```

如果你修改了房间 ID，也更新这一行：
```javascript
const ROOM_ID = 'test'; // 改成你的房间 ID
```

### 第 3 步：运行桥接脚本

在终端运行：

```bash
cd "d:\AI project\ClawLive"
node telegram-bridge.js
```

你会看到：
```
========================================
🦞 ClawLive <-> Telegram 桥接器
========================================
房间ID: test
Socket URL: http://localhost:3001
正在连接...

✅ 已连接到 ClawLive
🦞 加入房间: test
👁️  观众人数: 1
🔴 直播状态: 直播中

等待主播消息...
```

---

## 🎬 开始直播

1. 打开浏览器：http://localhost:3000/rooms/test
2. 点击右上角 **"🎬 开始直播"** 按钮
3. 在蓝色输入框输入消息，例如：
   ```
   你好，请介绍一下你自己
   ```
4. 按 Enter 发送

**你会看到：**
- 你的消息立即显示在聊天区（粉色气泡）
- 桥接脚本输出：`📩 收到主播消息: "你好，请介绍一下你自己"`
- OpenClaw Agent 处理消息（可能需要几秒钟）
- Agent 的回复自动出现在直播间（紫色气泡）

---

## 💡 工作原理

```
┌─────────────┐                ┌──────────────┐               ┌─────────────┐
│  ClawLive   │   Socket.io    │   Bridge     │  Telegram API │  OpenClaw   │
│  直播间      │◄──────────────►│   桥接脚本    │◄─────────────►│   Agent     │
│  (浏览器)    │                │  (Node.js)   │               │ (Telegram)  │
└─────────────┘                └──────────────┘               └─────────────┘
      │                              │                              │
      │ 1. 主播发送消息              │                              │
      ├─────────────────────────────►│                              │
      │                              │ 2. 转发给 Telegram Bot       │
      │                              ├─────────────────────────────►│
      │                              │                              │ 3. OpenClaw 处理
      │                              │ 4. Bot 回复消息              │
      │                              │◄─────────────────────────────┤
      │ 5. 推送到直播间              │                              │
      │◄─────────────────────────────┤                              │
      │                              │                              │
      │ 6. 观众看到对话              │                              │
      │                              │                              │
```

---

## 🎯 高级功能

### 1. 推送 OpenClaw 的图片/截图

如果你的 OpenClaw Agent 发送图片（例如浏览器截图），它们会自动显示在直播间的 "浏览器截图" 区域。

无需额外配置！

### 2. 支持多个房间

如果你有多个直播间和多个 Agent：

```javascript
// 在 telegram-bridge.js 中修改：
const CONFIGS = {
  'room1': { 
    token: 'BOT_TOKEN_1', 
    chatId: 'CHAT_ID_1' 
  },
  'room2': { 
    token: 'BOT_TOKEN_2', 
    chatId: 'CHAT_ID_2' 
  },
};
```

然后启动多个桥接实例。

### 3. 推送 Agent 状态日志

编辑桥接脚本，添加日志推送：

```javascript
// 当 Agent 发送包含特定关键词的消息时
if (message.text.includes('正在执行')) {
  await pushLog({
    action: '执行任务',
    status: 'pending',
    details: message.text
  });
}
```

---

## 🔧 故障排查

### ❌ "请先配置 TELEGRAM_BOT_TOKEN"

**原因：** 你还没有编辑 `telegram-bridge.js` 文件

**解决：** 用文本编辑器打开 `telegram-bridge.js`，修改前 15 行的配置

---

### ❌ "Telegram API 错误: Unauthorized"

**原因：** Bot Token 不正确

**解决：**
1. 重新从 @BotFather 获取 Token
2. 确保复制完整（包括冒号后的部分）
3. 检查是否有多余的空格

---

### ❌ "Telegram API 错误: Chat not found"

**原因：** Chat ID 不正确或你没有给 Bot 发送过消息

**解决：**
1. 在 Telegram 给你的 Bot 发送 `/start`
2. 重新获取 Chat ID（参考第 1 步）
3. 确保 Chat ID 是纯数字（不要引号）

---

### ❌ "连接错误: ECONNREFUSED"

**原因：** ClawLive 服务器没有运行

**解决：**
```bash
# 启动后端
cd "d:\AI project\ClawLive\apps\server"
npx tsx src/index.ts

# 启动前端（新终端）
cd "d:\AI project\ClawLive\apps\web"
npx next dev
```

---

### ⚠️ Agent 不回复

**可能原因：**
1. OpenClaw Agent 没有运行
2. Agent 正在处理其他任务
3. Agent 遇到错误

**解决：**
1. 检查 OpenClaw 日志
2. 在 Telegram 直接给 Bot 发消息，看是否响应
3. 等待几秒钟（有些任务需要时间）

---

### ⚠️ 消息有延迟

**原因：** 
- Telegram API 使用 long polling（轮询）
- OpenClaw 处理需要时间
- 网络延迟

**正常延迟：** 1-5 秒

**如果超过 10 秒：**
- 检查网络连接
- 降低 `POLLING_INTERVAL`（但会增加 API 调用）
- 考虑使用 Telegram Webhook（高级）

---

## 📝 完整示例

假设你的配置是：
- Bot Token: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`
- Chat ID: `987654321`
- 房间 ID: `my-room`

### 配置文件

```javascript
const TELEGRAM_BOT_TOKEN = '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz';
const TELEGRAM_CHAT_ID = '987654321';
const ROOM_ID = 'my-room';
```

### 启动命令

```bash
# 终端 1: 后端
cd "d:\AI project\ClawLive\apps\server"
npx tsx src/index.ts

# 终端 2: 前端
cd "d:\AI project\ClawLive\apps\web"
npx next dev

# 终端 3: 桥接
cd "d:\AI project\ClawLive"
node telegram-bridge.js
```

### 访问直播间

浏览器打开：`http://localhost:3000/rooms/my-room`

---

## 🎉 成功标志

当一切正常时，你会看到：

**桥接脚本输出：**
```
✅ 已连接到 ClawLive
🦞 加入房间: my-room
👁️  观众人数: 1
🔴 直播状态: 直播中

等待主播消息...

📩 收到主播消息: "你好"
📤 转发给 Telegram Bot...
✅ 已发送给 Telegram Bot

📨 收到 Telegram 回复: "你好！我是你的 OpenClaw 助手..."
✅ 已推送到 ClawLive 直播间
```

**直播间：**
- 粉色气泡：你的消息
- 紫色气泡：OpenClaw 的回复
- 显示 `Model: openclaw-real-agent`

---

## 🚀 下一步

恭喜！你已经成功连接真实的 OpenClaw Agent！

现在你可以：
- 🎥 邀请观众围观你与 Agent 的对话
- 🤖 让 Agent 执行复杂任务（搜索、浏览网页、编程等）
- 📊 查看 Agent 的实时状态和日志
- 📸 分享 Agent 的浏览器截图

**享受 AI Agent 直播的乐趣！** 🎊

---

需要帮助？查看：
- [完整集成指南](./OPENCLAW_INTEGRATION.md)
- [API 文档](./API.md)
- [GitHub Issues](https://github.com/yourusername/clawlive/issues)
