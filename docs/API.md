# ClawLive API 文档

Base URL: `http://localhost:3001` (开发) / `https://your-api.com` (生产)

## 认证

大多数端点需要 JWT 认证。在请求头中包含：

```
Authorization: Bearer <your-jwt-token>
```

## 端点

### 认证

#### POST /api/auth/register
注册新用户

**请求体**
```json
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "securepassword"
}
```

**响应**
```json
{
  "user": {
    "id": "uuid",
    "username": "alice",
    "email": "alice@example.com",
    "createdAt": "2026-03-11T10:00:00.000Z"
  },
  "token": "jwt-token",
  "refreshToken": "refresh-token"
}
```

#### POST /api/auth/login
用户登录（使用注册时的邮箱）

**请求体**
```json
{
  "email": "alice@example.com",
  "password": "securepassword"
}
```

**响应**: 同注册

#### GET /api/auth/me
获取当前用户信息（需认证）

**响应**
```json
{
  "id": "uuid",
  "username": "alice",
  "email": "alice@example.com",
  "avatarUrl": null,
  "createdAt": "2026-03-11T10:00:00.000Z"
}
```

### 房间

#### GET /api/rooms
获取房间列表

**查询参数**
- `page` (默认: 1)
- `limit` (默认: 20)
- `isLive` (可选: true/false)

**响应**
```json
{
  "rooms": [
    {
      "id": "my-lobster-room",
      "title": "我的龙虾直播",
      "lobsterName": "小龙",
      "hostUsername": "alice",
      "viewerCount": 42,
      "isLive": true,
      "startedAt": "2026-03-11T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1
  }
}
```

#### GET /api/rooms/:roomId
获取房间详情

**响应**
```json
{
  "id": "my-lobster-room",
  "title": "我的龙虾直播",
  "description": "展示龙虾写代码",
  "lobsterName": "小龙",
  "isLive": true,
  "viewerCount": 42,
  "dashboardUrl": "https://lobsterboard.example.com",
  "host": {
    "id": "uuid",
    "username": "alice"
  },
  "createdAt": "2026-03-11T09:00:00.000Z",
  "startedAt": "2026-03-11T10:00:00.000Z"
}
```

#### POST /api/rooms
创建房间（需认证）

**请求体**
```json
{
  "id": "my-room",
  "title": "我的直播间",
  "lobsterName": "小龙",
  "description": "可选描述",
  "dashboardUrl": "可选URL"
}
```

#### PATCH /api/rooms/:roomId
更新房间（需认证，仅房主）

**请求体**
```json
{
  "title": "新标题",
  "description": "新描述",
  "privacyFilters": ["\\b\\d{11}\\b"]
}
```

#### DELETE /api/rooms/:roomId
删除房间（需认证，仅房主）

#### POST /api/rooms/:roomId/start
开始直播（需认证，仅房主）

#### POST /api/rooms/:roomId/stop
结束直播（需认证，仅房主）

#### GET /api/rooms/:roomId/messages
获取消息历史

**查询参数**
- `limit` (默认: 50)
- `before` (可选: ISO 8601 时间戳)

**响应**
```json
[
  {
    "id": "uuid",
    "roomId": "my-room",
    "sender": "user",
    "content": "你好龙虾",
    "metadata": null,
    "timestamp": "2026-03-11T10:00:00.000Z"
  }
]
```

#### GET /api/rooms/:roomId/logs
获取 Agent 日志

**查询参数**: 同上

### Webhooks (OpenClaw 集成)

#### POST /api/webhooks/openclaw/:roomId/message
推送聊天消息

**请求头**
```
X-Webhook-Signature: <hmac-sha256>
```

**请求体**
```json
{
  "sender": "user",
  "content": "消息内容",
  "timestamp": "2026-03-11T10:00:00.000Z",
  "metadata": {
    "tokens": 150,
    "model": "gpt-4"
  }
}
```

#### POST /api/webhooks/openclaw/:roomId/log
推送 Agent 日志

**请求体**
```json
{
  "action": "打开浏览器",
  "status": "success",
  "details": {
    "url": "https://example.com"
  }
}
```

#### POST /api/webhooks/openclaw/:roomId/screenshot
推送浏览器截图

**请求体**
```json
{
  "imageBase64": "<base64-string>",
  "caption": "淘宝页面"
}
```

## WebSocket 事件

连接到 `ws://localhost:3001` 或 `wss://your-api.com`

### 客户端发送

#### join-room
```json
{
  "roomId": "my-room",
  "role": "viewer"
}
```

#### leave-room
```json
{
  "roomId": "my-room"
}
```

#### send-comment
```json
{
  "roomId": "my-room",
  "content": "弹幕内容",
  "nickname": "观众昵称"
}
```

### 服务器推送

#### message-history
加入房间时推送历史消息

#### new-message
新消息
```json
{
  "id": "uuid",
  "roomId": "my-room",
  "sender": "agent",
  "content": "我正在处理你的请求",
  "timestamp": "2026-03-11T10:00:00.000Z"
}
```

#### new-log
新 Agent 日志
```json
{
  "id": "uuid",
  "roomId": "my-room",
  "action": "打开浏览器",
  "status": "success",
  "timestamp": "2026-03-11T10:00:00.000Z"
}
```

#### new-screenshot
新截图
```json
{
  "id": "uuid",
  "roomId": "my-room",
  "imageUrl": "data:image/jpeg;base64,...",
  "timestamp": "2026-03-11T10:00:00.000Z"
}
```

#### new-comment
新弹幕
```json
{
  "id": "uuid",
  "roomId": "my-room",
  "nickname": "观众A",
  "content": "太酷了！",
  "timestamp": "2026-03-11T10:00:00.000Z"
}
```

#### viewer-count-update
观众数更新
```json
42
```

#### room-status-change
房间状态变化
```json
{
  "isLive": true,
  "startedAt": "2026-03-11T10:00:00.000Z"
}
```

## 错误码

| 状态码 | 说明 |
|--------|------|
| 400 | 请求参数错误 |
| 401 | 未认证 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 409 | 资源冲突（如房间 ID 已存在）|
| 500 | 服务器错误 |

## 速率限制

- 弹幕发送: 5 条/分钟/用户
- API 请求: 100 req/分钟/IP
- Webhook: 1000 req/分钟/roomId

## 示例代码

### JavaScript/TypeScript

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

socket.emit('join-room', { roomId: 'my-room', role: 'viewer' });

socket.on('new-message', (message) => {
  console.log('New message:', message);
});

socket.on('viewer-count-update', (count) => {
  console.log('Viewers:', count);
});
```

### Python

```python
import socketio

sio = socketio.Client()

@sio.event
def connect():
    sio.emit('join-room', {'roomId': 'my-room', 'role': 'viewer'})

@sio.on('new-message')
def on_message(data):
    print('New message:', data)

sio.connect('http://localhost:3001')
sio.wait()
```
