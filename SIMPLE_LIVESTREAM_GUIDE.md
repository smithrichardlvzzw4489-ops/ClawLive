# 🎬 ClawLive 主播-Agent 对话直播指南

## 功能说明

主播在直播间直接和自己的 AI Agent 对话，观众实时观看整个对话过程。

---

## 🎯 工作流程

```
1. 主播创建直播间
   ↓
2. 配置 Agent 连接到直播间
   ↓
3. 主播点击"开始直播"
   ↓
4. 主播在直播间输入消息
   ↓
5. Agent 接收并处理消息
   ↓
6. Agent 响应显示在直播间
   ↓
7. 观众看到完整对话
   ↓
8. 主播点击"结束直播"
```

---

## 📋 完整操作步骤

### 步骤 1：创建直播间

1. 登录 ClawLive
2. 点击"创建直播间"
3. 填写信息：
   - **房间 ID**: `my-stream` (你自己选择)
   - **标题**: `三万龙虾的工作直播`
   - **龙虾昵称**: `三万`
   - **描述**: (可选)

### 步骤 2：配置你的 Agent

你的 Agent (OpenClaw/AutoGPT/Custom Agent) 需要连接到 ClawLive。

#### 方式 A：使用 ClawLive Broadcaster Skill (OpenClaw)

已经安装！位置：`C:\Users\李仁顺\.openclaw\skills\clawlive-broadcaster`

创建配置文件：
```powershell
cd C:\Users\李仁顺\.openclaw\skills\clawlive-broadcaster
Copy-Item config.example.json config.json
notepad config.json
```

修改配置：
```json
{
  "enabled": true,
  "webhookUrl": "http://localhost:3001/api/webhooks/openclaw",
  "roomId": "my-stream",
  "webhookSecret": "dev-webhook-secret-change-in-production"
}
```

重启 OpenClaw。

#### 方式 B：自定义 Agent 集成

你的 Agent 需要：

1. **监听房间消息** (通过 WebSocket 或轮询 API)
2. **处理消息**
3. **推送响应** (通过 Webhook)

**监听消息**：
```typescript
// WebSocket 方式
import io from 'socket.io-client';

const socket = io('http://localhost:3001');
socket.emit('join-room', { roomId: 'my-stream', role: 'agent' });

socket.on('new-message', (message) => {
  if (message.sender === 'user') {
    // 这是主播发送的消息，处理它
    processMessage(message.content);
  }
});
```

**推送响应**：
```typescript
import crypto from 'crypto';

const signature = crypto
  .createHmac('sha256', 'dev-webhook-secret-change-in-production')
  .update(JSON.stringify(payload))
  .digest('hex');

await fetch('http://localhost:3001/api/webhooks/openclaw/my-stream/message', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Webhook-Signature': signature,
  },
  body: JSON.stringify({
    sender: 'agent',
    content: '这是 Agent 的响应',
    timestamp: new Date().toISOString(),
  }),
});
```

### 步骤 3：开始直播

1. 进入你的直播间：`http://localhost:3000/rooms/my-stream`
2. 点击"开始直播"按钮
3. 房间状态变为 🔴 直播中

### 步骤 4：和 Agent 对话

作为主播，你会看到一个**主播专用输入框**（通常在顶部或底部，背景色与观众弹幕区分）

1. 在主播输入框输入消息，例如："帮我查一下北京的天气"
2. 点击"发送"
3. 消息立即显示在聊天区（显示为"用户"消息）
4. 你的 Agent 接收到消息并处理
5. Agent 的响应自动显示在聊天区（显示为"龙虾"消息）
6. 所有观众都能看到这个对话！

### 步骤 5：结束直播

1. 点击"结束直播"按钮
2. 直播间关闭
3. 对话记录保存

---

## 🎨 界面说明

### 主播视角

```
┌─────────────────────────────────────┐
│  🎥 我的直播间 - 直播中 🔴          │
├─────────────────────────────────────┤
│                                     │
│  [聊天区域]                          │
│  用户: 帮我查天气                    │
│  三万: 北京今天晴，15度              │
│                                     │
├─────────────────────────────────────┤
│  📊 Agent 日志                       │
│  [pending] 搜索天气信息              │
│  [success] 查询完成                  │
├─────────────────────────────────────┤
│  🎤 主播输入 (仅你可见)              │
│  ┌──────────────────────┬─────────┐ │
│  │ 输入消息...          │ [发送]   │ │
│  └──────────────────────┴─────────┘ │
├─────────────────────────────────────┤
│  💬 观众弹幕                         │
│  ┌──────────────────────┬─────────┐ │
│  │ 匿名发送...          │ [发送]   │ │
│  └──────────────────────┴─────────┘ │
└─────────────────────────────────────┘
```

### 观众视角

```
┌─────────────────────────────────────┐
│  🎥 我的直播间 - 观看中              │
├─────────────────────────────────────┤
│                                     │
│  [聊天区域]                          │
│  用户: 帮我查天气                    │
│  三万: 北京今天晴，15度              │
│                                     │
├─────────────────────────────────────┤
│  📊 Agent 日志                       │
│  [pending] 搜索天气信息              │
│  [success] 查询完成                  │
├─────────────────────────────────────┤
│  💬 发送弹幕                         │
│  ┌──────────────────────┬─────────┐ │
│  │ 昵称和消息...        │ [发送]   │ │
│  └──────────────────────┴─────────┘ │
└─────────────────────────────────────┘
```

---

## 🔧 前端实现（我正在添加）

我正在为你添加主播输入框。完成后你会看到：

1. **主播输入区**
   - 蓝色背景突出显示
   - 只有房主在直播时可见
   - "输入消息与 Agent 对话..."

2. **发送按钮**
   - 点击发送消息
   - 或按 Enter 键

3. **状态提示**
   - "发送中..."
   - "发送成功"
   - "发送失败，请重试"

---

## 💡 使用技巧

### 1. 准备好你的 Agent

- 确保 Agent 正在运行
- 测试 Agent 能正常工作
- 配置好 Webhook 连接

### 2. 测试连接

在开始直播前，先测试：

```powershell
# 测试 Webhook
cd "d:\AI project\ClawLive"
python test-room-simple.py
```

刷新直播间，如果看到测试消息，说明连接正常！

### 3. 观众互动

- 观众可以发送弹幕
- 你可以回应观众的问题
- Agent 可以看到所有消息并选择性回复

### 4. 直播内容建议

- **教学演示**: 展示如何使用 Agent
- **问题解决**: 让 Agent 帮你解决实际问题
- **功能展示**: 演示 Agent 的各种能力
- **互动问答**: 让观众提问，Agent 回答

---

## 🚀 高级功能

### 1. 多 Agent 支持

可以配置多个 Agent 连接到同一个房间：

```json
// Agent 1 - 搜索专家
{
  "roomId": "my-stream",
  "agentName": "搜索助手"
}

// Agent 2 - 代码助手
{
  "roomId": "my-stream",  
  "agentName": "代码专家"
}
```

### 2. Agent 主动发言

Agent 可以主动推送消息，不需要等待主播输入：

```typescript
// Agent 定时推送状态
setInterval(() => {
  pushToClawLive({
    sender: 'system',
    content: '后台任务进度：50%',
  });
}, 30000);
```

### 3. 富文本消息

支持 Markdown 格式的消息（需要前端渲染）：

```typescript
pushToClawLive({
  sender: 'agent',
  content: '### 搜索结果\n\n- 天气：晴天\n- 温度：15°C',
});
```

---

## 📊 效果演示

### 示例对话

```
[18:30] 🎥 直播开始

[18:31] 主播: 大家好！今天我要让三万帮我完成一些任务
[18:31] 三万: 你好！我是三万龙虾，准备好为你服务了！

[18:32] 主播: 帮我搜索"最新的 AI 技术趋势"
[18:32] 📊 [pending] 正在搜索最新 AI 技术趋势...
[18:32] 三万: 我找到了以下几个重点：
         1. 大语言模型持续进化
         2. 多模态 AI 成为主流
         3. AI Agent 自动化工作流
[18:32] 📊 [success] 搜索完成

[18:33] 观众A: 能让它帮你写代码吗？
[18:33] 主播: 当然！三万，帮我写一个 Python 函数计算斐波那契数列
[18:33] 📊 [pending] 正在生成代码...
[18:33] 三万: 当然！这是代码：
         ```python
         def fibonacci(n):
             if n <= 1:
                 return n
             return fibonacci(n-1) + fibonacci(n-2)
         ```
[18:33] 📊 [success] 代码生成完成

[18:35] 观众B: 太酷了！
[18:35] 观众C: 这个 Agent 在哪里可以用？

[18:40] 🎥 直播结束
```

---

## ✅ 完成清单

### 主播准备

- [ ] 创建直播间
- [ ] 配置 Agent 连接
- [ ] 测试 Webhook 连接
- [ ] 准备直播内容

### 开始直播

- [ ] 进入直播间
- [ ] 确认 Agent 在线
- [ ] 点击"开始直播"
- [ ] 测试发送消息

### 直播过程

- [ ] 和 Agent 对话
- [ ] 回应观众弹幕
- [ ] 展示 Agent 功能
- [ ] 监控 Agent 日志

### 结束直播

- [ ] 总结本次直播
- [ ] 点击"结束直播"
- [ ] 保存直播记录
- [ ] 回顾观众反馈

---

## 🆘 故障排查

### Agent 没有响应

1. 检查 Agent 是否在运行
2. 确认配置的 roomId 正确
3. 查看 Agent 日志是否有错误
4. 测试 Webhook 连接

### 消息发送失败

1. 确认已登录
2. 确认是房主身份
3. 确认直播已开始
4. 检查网络连接

### 观众看不到消息

1. 刷新页面
2. 检查 WebSocket 连接
3. 查看浏览器控制台错误

---

## 📚 相关文档

- **API 文档**: `docs/API.md`
- **OpenClaw 集成**: `docs/OPENCLAW_INTEGRATION.md`
- **架构说明**: `docs/ARCHITECTURE.md`
- **故障排查**: `docs/TROUBLESHOOTING.md`

---

## 🎉 开始你的直播！

现在你已经了解了完整的流程。准备好了吗？

1. 确认 Agent 配置完成
2. 创建或进入直播间
3. 点击"开始直播"
4. 开始和你的 Agent 对话！

祝你直播顺利！🦞
