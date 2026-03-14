# Agent Viewer API

AI 智能体可以作为「观众」订阅直播和作品内容，用于学习。

## 1. 注册 Agent

```http
POST /api/agent-viewers/register
Content-Type: application/json

{
  "agentId": "my-learning-agent",
  "name": "学习型 Agent",
  "webhookUrl": "https://my-agent.com/webhook"  // 可选，未来 Webhook 推送
}
```

响应：

```json
{
  "agentId": "my-learning-agent",
  "apiKey": "av_xxxxxxxxxxxx...",
  "message": "Agent registered. Use X-Agent-Api-Key or Authorization: Bearer <apiKey> for API calls."
}
```

**请妥善保管 `apiKey`**，后续所有 API 调用都需要携带。

## 2. 认证方式

所有需要认证的接口支持两种方式：

- Header: `X-Agent-Api-Key: av_xxxx`
- Header: `Authorization: Bearer av_xxxx`

## 3. 订阅管理

### 查看当前订阅

```http
GET /api/agent-viewers/subscriptions
X-Agent-Api-Key: av_xxxx
```

### 订阅直播

```http
POST /api/agent-viewers/subscribe/room/:roomId
X-Agent-Api-Key: av_xxxx
```

### 取消订阅直播

```http
DELETE /api/agent-viewers/unsubscribe/room/:roomId
X-Agent-Api-Key: av_xxxx
```

### 订阅作品

```http
POST /api/agent-viewers/subscribe/work/:workId
X-Agent-Api-Key: av_xxxx
```

### 取消订阅作品

```http
DELETE /api/agent-viewers/unsubscribe/work/:workId
X-Agent-Api-Key: av_xxxx
```

## 4. 学习内容 Feed

### 直播实时消息

```http
GET /api/agent-viewers/feed/room/:roomId?since=2024-01-01T00:00:00Z&limit=100
X-Agent-Api-Key: av_xxxx
```

- `since`: ISO 时间戳，仅返回该时间之后的消息（增量同步）
- `limit`: 单次返回条数，默认 100，最大 500

### 直播历史场次

```http
GET /api/agent-viewers/feed/room/:roomId/history
X-Agent-Api-Key: av_xxxx
```

返回该房间所有已结束的直播场次及其完整对话记录。

### 作品消息

```http
GET /api/agent-viewers/feed/work/:workId?since=2024-01-01T00:00:00Z&limit=100
X-Agent-Api-Key: av_xxxx
```

## 5. 实时 Socket 订阅（可选）

Agent 可通过 Socket.io 连接，与人类观众同样接收实时消息：

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  transports: ['websocket', 'polling'],
});

// 以 Agent 身份加入直播
socket.emit('join-room', {
  roomId: 'test',
  role: 'agent',
  agentId: 'my-learning-agent',
});

// 以 Agent 身份加入作品
socket.emit('join-work', {
  workId: 'work-123',
  role: 'agent',
  agentId: 'my-learning-agent',
});

// 接收实时消息
socket.on('new-message', (msg) => console.log('Room message:', msg));
socket.on('work-message', (msg) => console.log('Work message:', msg));
```

## 6. 使用流程示例

```text
1. 注册 Agent → 获取 apiKey
2. 订阅目标房间/作品
3. 方式 A：轮询 Feed API（GET /feed/room/:id?since=xxx）
4. 方式 B：Socket 连接，接收 new-message / work-message
5. Agent 内部：将内容写入知识库 / 向量库 / 上下文，用于学习
```
