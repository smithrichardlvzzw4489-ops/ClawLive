# OpenClaw Agent 真实集成指南

## 🎯 目标

让直播间的主播能够直接与真实的 OpenClaw Agent 对话，而不是模拟的 mock agent。

## 📋 集成方案

### 方案 1: Telegram Bot 桥接（推荐）

通过 Telegram Bot API 将 ClawLive 与你的 OpenClaw Agent 连接。

**工作流程：**
1. 主播在 ClawLive 输入消息
2. 桥接脚本监听到消息
3. 通过 Telegram API 发送给 OpenClaw Bot
4. OpenClaw 处理并回复
5. 桥接脚本接收回复
6. 通过 Webhook 推送回 ClawLive
7. 观众看到完整对话

**优点：**
- ✅ 使用真实的 OpenClaw Agent
- ✅ 无需修改 OpenClaw 代码
- ✅ 支持所有 OpenClaw 功能
- ✅ 简单可靠

### 方案 2: OpenClaw Skill（高级）

开发一个 OpenClaw Skill，让 Agent 主动连接 ClawLive。

**优点：**
- ✅ 更紧密的集成
- ✅ 可以推送日志、截图
- ✅ 更低延迟

**缺点：**
- ⚠️ 需要修改 OpenClaw
- ⚠️ 实现复杂度高

---

## 🚀 快速开始：Telegram Bot 桥接

### 第一步：获取你的 Telegram Bot Token

1. 在 Telegram 中找到 `@BotFather`
2. 发送 `/mybots`
3. 选择你的 OpenClaw Bot
4. 选择 "API Token"
5. 复制 Token（格式：`1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`）

### 第二步：获取你的 Telegram Chat ID

1. 在 Telegram 中给你的 OpenClaw Bot 发送一条消息
2. 访问：`https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
3. 找到 `"chat":{"id":123456789}` 部分
4. 复制这个 ID

### 第三步：配置桥接脚本

编辑 `telegram-bridge.js` 文件（见下一节）

```javascript
const TELEGRAM_BOT_TOKEN = '你的 Bot Token';
const TELEGRAM_CHAT_ID = 你的 Chat ID;
const ROOM_ID = 'test'; // 直播间 ID
```

### 第四步：运行桥接脚本

```bash
cd "d:\AI project\ClawLive"
node telegram-bridge.js
```

### 第五步：开始直播

1. 访问 http://localhost:3000/rooms/test
2. 点击"开始直播"
3. 在蓝色输入框输入消息
4. OpenClaw Agent 会实时响应！

---

## 📝 详细说明

### Telegram Bot API 基础

OpenClaw 通常使用 Telegram 作为交互界面。要集成，我们需要：

1. **发送消息给 Bot**
   ```javascript
   await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       chat_id: CHAT_ID,
       text: message
     })
   });
   ```

2. **接收 Bot 回复**
   ```javascript
   // 使用 long polling
   const response = await fetch(
     `https://api.telegram.org/bot${TOKEN}/getUpdates?offset=${offset}`
   );
   ```

### 消息流转

```
[主播] 在 ClawLive 输入 "帮我查天气"
   ↓
[桥接脚本] 监听到 Socket.io 消息
   ↓
[Telegram API] 发送给 OpenClaw Bot
   ↓
[OpenClaw Agent] 处理请求（可能调用工具、浏览器等）
   ↓
[Telegram API] Bot 回复消息
   ↓
[桥接脚本] 接收回复
   ↓
[ClawLive Webhook] 推送回直播间
   ↓
[所有观众] 看到完整对话过程
```

---

## 🔧 故障排查

### 问题 1: Bot Token 无效
- 确认 Token 格式正确
- 检查 Bot 是否已启用
- 尝试在浏览器访问：`https://api.telegram.org/bot<TOKEN>/getMe`

### 问题 2: Chat ID 找不到
- 确保已经给 Bot 发送过至少一条消息
- 使用 `/start` 命令初始化对话
- 检查 `getUpdates` 返回的 JSON

### 问题 3: 消息延迟
- 这是正常的（Telegram API polling 有延迟）
- 可以减少 polling 间隔（但会增加 API 调用）

### 问题 4: OpenClaw 不响应
- 确认 OpenClaw Agent 正在运行
- 检查 Agent 是否处于空闲状态
- 查看 OpenClaw 日志

---

## 🎨 进阶功能

### 1. 推送 Agent 日志

修改桥接脚本，解析 OpenClaw 的状态消息并推送为日志：

```javascript
if (message.includes('正在执行')) {
  await pushLog({
    action: '执行任务',
    status: 'pending',
    details: message
  });
}
```

### 2. 推送截图

如果 OpenClaw 发送了图片：

```javascript
if (update.message.photo) {
  const photo = update.message.photo[update.message.photo.length - 1];
  const fileUrl = await getFileUrl(photo.file_id);
  const imageBase64 = await downloadAndEncode(fileUrl);
  await pushScreenshot(imageBase64);
}
```

### 3. 支持多个 Agent

为不同房间配置不同的 Bot：

```javascript
const ROOM_AGENT_MAP = {
  'room1': { token: 'xxx', chatId: 123 },
  'room2': { token: 'yyy', chatId: 456 },
};
```

---

## 📚 参考资料

- [Telegram Bot API 文档](https://core.telegram.org/bots/api)
- [OpenClaw 官方文档](https://github.com/yourusername/openclaw)
- [ClawLive Webhook API](./API.md)

---

## ❓ 常见问题

**Q: 能不能不用 Telegram，直接调用 OpenClaw？**
A: OpenClaw 目前主要通过 Telegram 交互。如果你有 OpenClaw 的 Python/Node.js SDK，可以直接集成。

**Q: 延迟有多大？**
A: 通常 1-3 秒（取决于 OpenClaw 处理速度和网络）。

**Q: 可以同时连接多个观众的 Agent 吗？**
A: 可以！为每个房间配置不同的 Bot 即可。

**Q: OpenClaw 的图片、视频能显示吗？**
A: 可以！桥接脚本会自动下载并推送到直播间。

---

需要帮助？在 GitHub 提 Issue 或加入我们的社区！
