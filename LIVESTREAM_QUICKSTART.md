# 🎬 开始你的第一次直播 - 快速指南

## ✅ 前提条件

- [x] ClawLive 应用已启动
- [x] 你已注册并登录
- [x] 你已创建直播间 "test"

---

## 🚀 5 分钟开始直播

### 第 1 步：进入你的直播间（30 秒）

访问：**http://localhost:3000/rooms/test**

你会看到：
- 聊天区域（中间/左侧）
- Agent 日志区（右侧）
- **蓝色主播输入框**（只有你能看到）
- 观众弹幕区（底部，灰色）

---

### 第 2 步：确认直播状态（10 秒）

查看页面顶部：
- ✅ 如果看到 **"🔴 直播中"** → 已开始，跳到第 3 步
- ⏸️ 如果没有 → 需要开始直播

**开始直播**：
- 查找"开始直播"按钮
- 或临时使用 API 启动（见下方）

**临时启动方法**（如果找不到按钮）：
```powershell
$token = "你的JWT令牌"  # 从浏览器控制台 localStorage.getItem('token') 获取
curl -X POST http://localhost:3001/api/rooms/test/start `
  -H "Authorization: Bearer $token"
```

---

### 第 3 步：发送第一条消息（30 秒）

在**蓝色主播输入框**中：

1. 输入："你好，三万！"
2. 点击"发送"按钮（或按 Enter）
3. ✅ 消息立即显示在聊天区

---

### 第 4 步：让 Agent 响应（2 分钟）

现在有两种方式让 Agent 响应：

#### 方式 A：手动模拟响应（测试用）

在新的 PowerShell 窗口运行：

```powershell
cd "d:\AI project\ClawLive"
python test-room-simple.py
```

刷新浏览器，你会看到 Agent 的响应！

#### 方式 B：连接真实 Agent

如果你有 OpenClaw 或其他 Agent：

**在 Agent 代码中添加**：

```javascript
// 1. 连接到 ClawLive
const io = require('socket.io-client');
const socket = io('http://localhost:3001');

// 2. 加入房间
socket.emit('join-room', { roomId: 'test', role: 'agent' });

// 3. 监听主播消息
socket.on('new-message', async (message) => {
  if (message.sender === 'user') {
    console.log('收到主播消息:', message.content);
    
    // 4. 处理消息（这里是你的 Agent 逻辑）
    const response = await yourAgentProcess(message.content);
    
    // 5. 推送响应
    await pushToClawLive('agent', response);
  }
});

// 推送函数
async function pushToClawLive(sender, content) {
  const crypto = require('crypto');
  const payload = {
    sender,
    content,
    timestamp: new Date().toISOString(),
    metadata: { model: 'my-agent' }
  };
  
  const payloadStr = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', 'dev-webhook-secret-change-in-production')
    .update(payloadStr)
    .digest('hex');
  
  await fetch('http://localhost:3001/api/webhooks/openclaw/test/message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': signature,
    },
    body: payloadStr,
  });
}
```

---

### 第 5 步：邀请观众（1 分钟）

把链接分享给朋友：

```
http://localhost:3000/rooms/test
```

他们可以：
- ✅ 实时看到你和 Agent 的对话
- ✅ 发送弹幕互动
- ✅ 无需登录

---

### 第 6 步：结束直播（10 秒）

- 点击"结束直播"按钮
- 或通过 API：
  ```powershell
  curl -X POST http://localhost:3001/api/rooms/test/stop `
    -H "Authorization: Bearer $token"
  ```

---

## 🎯 完整使用流程示例

### 真实直播场景：

```
[14:00] 创建直播间 "my-coding-stream"
        标题: "三万龙虾教你写代码"

[14:02] 开始直播 🔴

[14:03] 主播: 大家好！今天我要让三万帮我写一个 Web 应用
[14:03] 三万: 你好！很高兴帮你，具体要实现什么功能？

[14:04] 观众A: 能写个 Todo List 吗？
[14:04] 主播: 好主意！三万，帮我写一个 React Todo List
[14:05] 三万: 好的！我来为你实现...
        [开始编写代码]
        [显示代码片段]

[14:10] 观众B: 能加上 localStorage 持久化吗？
[14:10] 主播: 三万，加上本地存储功能
[14:11] 三万: 已更新代码，添加了 localStorage...

[14:20] 主播: 今天的直播就到这里，谢谢大家！
[14:20] 结束直播 ⏹️
```

---

## 💡 为什么需要 ClawLive 而不只是 Dashboard？

### Dashboard（个人仪表盘）

```
只有你能看 ❌
无法互动 ❌
无法分享 ❌
```

### ClawLive（直播平台）

```
多人观看 ✅
实时弹幕互动 ✅
可以分享链接 ✅
可以嵌入 Dashboard ✅
房间管理 ✅
历史回放 ✅
```

---

## 🎨 ClawLive 可以嵌入 Dashboard

你可以在直播间**同时显示** Dashboard：

### 创建直播间时填写：

```
Dashboard URL: https://lobsterboard.example.com/your-dashboard
```

### 效果：

```
┌─────────────────────┬──────────────┐
│                     │              │
│                     │  Agent 日志   │
│   聊天对话区域       │              │
│                     ├──────────────┤
│                     │              │
│   (你和 Agent       │  Dashboard   │
│    的实时对话)       │  (统计数据)   │
│                     │              │
├─────────────────────┴──────────────┤
│  🎤 主播输入                        │
│  💬 观众弹幕                        │
└─────────────────────────────────────┘
```

观众可以**同时看到**：
1. 你和 Agent 的对话
2. Agent 的操作日志
3. 你的 Dashboard 统计

---

## 🔧 技术上的区别

### Dashboard 技术
- **静态或半实时** - 需要刷新或定期更新
- **单用户** - 只有你能访问
- **有限交互** - 只能查看，不能互动

### ClawLive 技术
- **WebSocket 实时** - 毫秒级更新
- **多用户** - 支持 100+ 并发观众
- **完整交互** - 弹幕、评论、实时更新

---

## 🎯 总结

**Dashboard 做不到"直播"效果**，因为：

❌ 别人无法访问你的 Dashboard  
❌ 无法实时同步给多个观众  
❌ 无法互动（弹幕、评论）  
❌ 无法管理房间和观众  

**ClawLive 是专门为直播设计的**：

✅ 公开分享链接  
✅ 多人实时观看  
✅ WebSocket 实时推送  
✅ 弹幕互动系统  
✅ 房间管理功能  
✅ 可以嵌入 Dashboard（两者结合）  

---

## 🚀 现在你可以

### 1. 测试主播输入功能

刷新浏览器：**http://localhost:3000/rooms/test**

在蓝色输入框发送消息，测试是否正常。

### 2. 配置你的 Agent

按照 `SIMPLE_LIVESTREAM_GUIDE.md` 配置 Agent 监听和响应。

### 3. 邀请观众测试

把链接 `http://localhost:3000/rooms/test` 发给朋友，让他们体验观看和弹幕！

---

**ClawLive = Dashboard的"公开直播版" + 多人观看 + 实时互动** 🎉

现在去测试你的新输入框吧！