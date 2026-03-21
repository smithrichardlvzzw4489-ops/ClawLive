# 直播间问题诊断定位指南

## 问题描述

1. **直播间收不到龙虾（Agent）的回复**
2. **客户端看不到任何直播信息**

---

## 问题 1：直播间收不到 Agent 回复

### 数据流（按顺序）

```
Telegram 消息 → MTProto 监听 → 解析 agentChatId → 判断 isFromAgent
    → appendMessage(roomId) [Redis]
    → io.to(roomId).emit('new-message', agentMessage)
         ↓
Socket.io Redis Adapter → 广播到各实例
         ↓
客户端 socket.on('new-message') → setMessages → ChatBubble 渲染
```

### 关键代码位置

| 环节 | 文件 | 行号/说明 |
|------|------|-----------|
| Agent 消息接收 | `apps/server/src/services/telegram-mtproto.ts` | L429-519 `startListeningForMessages` |
| 房间判断 | 同上 | L488: `if (roomId.startsWith('work-'))` → work; else → ClawLive room |
| 推送逻辑 | 同上 | L509-513: `appendMessage` + `io.to(roomId).emit('new-message', ...)` |
| 客户端监听 | `apps/web/src/components/LiveStream.tsx` | L303-311: `socket.on('new-message', ...)` |
| 消息渲染 | 同上 | L496-499: `messages.map` + `ChatBubble` |

### 可能原因

1. **roomId 不一致（已修复）**：客户端发送 URL 编码的 roomId（如 `%E6%88%91...`），MTProto/Redis 使用解码形式（`我的龙虾直播间-837832`），导致 Socket.io room 不匹配。**修复**：服务端在 join-room/leave-room/send-comment/webrtc 等处对 roomId 做 `decodeURIComponent` 归一化。
2. **多实例 + Redis Adapter**：观众在实例 A，MTProto 在实例 B 触发 emit → Redis adapter 应跨实例广播，需确认 Redis 正常
3. **Socket 未正确 join**：观众进入页面后 `join-room` 可能失败或 room 名错误
4. **60 秒过滤**：`L472-474` 只处理 60 秒内的消息，Agent 若延迟回复会被丢弃

### 诊断步骤

1. 在 `telegram-mtproto.ts` L512 后加日志，确认 emit 时房间内 socket 数量：
   ```ts
   const sockets = await this.ioInstance?.in(roomId).fetchSockets() ?? [];
   console.log(`[DIAG] Emit new-message to room ${roomId}, sockets in room: ${sockets.length}`);
   ```
2. 客户端打开 `/rooms/我的龙虾直播间-837832?debug=1`，在控制台确认 `socket.on('new-message')` 是否被调用
3. 检查服务端日志中 `joined room:` 与 `Agent reply pushed to ClawLive room` 的 roomId 是否完全一致

---

## 问题 2：客户端看不到直播信息

### 数据流

**首页 liveRooms**：
```
GET /api/recommendations/home → getRecommendedLiveRooms()
    → getAllRooms() [Redis] → filter(r => r.isLive) → 返回 liveRooms
```

**/rooms 页面**：
```
GET /api/rooms?isLive=true → roomSimpleRoutes
    → getAllRooms() [Redis] → filter(room => room.isLive) → 返回 rooms
```

### 关键代码位置

| 环节 | 文件 | 说明 |
|------|------|------|
| 首页数据 | `apps/web/src/app/page.tsx` | L58: `fetch(.../api/recommendations/home)` |
| 推荐服务 | `apps/server/src/services/recommendation.ts` | L89-119: `getRecommendedLiveRooms` |
| 房间列表 API | `apps/server/src/api/routes/rooms-simple.ts` | L391-424: GET / |
| 房间存储 | `apps/server/src/lib/rooms-store.ts` | `getAllRooms` → Redis `rooms:*` |
| RoomList 组件 | `apps/web/src/components/RoomList.tsx` | `api.rooms.list({ isLive: true })` |

### 可能原因

1. **Redis 中无房间**：房间创建/开播未正确写入 Redis，或 key 格式不对
2. **isLive 未持久化**：`POST /api/rooms/:id/start` 调用了 `setRoom(roomId, { ...room, isLive: true })`，需确认实际写入
3. **首页用 recommendations 而非 rooms**：首页是 `/api/recommendations/home`，不是 `/api/rooms?isLive=true`，两者都依赖 `getAllRooms()`
4. **多实例 Redis**：各实例应共享同一 REDIS_URL，否则数据不同步

### 诊断步骤

1. 开启房间列表诊断：在 Railway/环境变量中设置 `DIAG_LIVE=1`，请求 `GET /api/rooms?isLive=true` 时会在日志输出 `[DIAG] GET /api/rooms ...`
2. 直接请求：
   - `GET /api/rooms?isLive=true` → 看返回的 `rooms` 数量
   - `GET /api/recommendations/home` → 看 `liveRooms` 数量
2. 在 `rooms-simple.ts` GET / 的 `filtered` 后加日志：
   ```ts
   console.log(`[DIAG] GET /api/rooms isLive=${isLive}, total=${rooms.length}, filtered=${filtered.length}`);
   ```
3. 在 `rooms-store.ts` `getAllRoomIds` 返回前加日志，确认 Redis keys 数量

---

## 快速验证清单

- [ ] 服务端日志出现 `✅ Agent reply pushed to ClawLive room 我的龙虾直播间-837832`
- [ ] 服务端日志 `Socket xxx joined room: 我的龙虾直播间-837832` 的 roomId 与上面一致
- [ ] 客户端控制台无 Socket 连接错误
- [ ] `GET /api/rooms?isLive=true` 返回非空 `rooms`
- [ ] 房间在开播后调用了 `POST /api/rooms/:id/start`

---

## 与 roomId 编码相关的注意点

- Next.js `[roomId]` 一般会解码 URL，`/rooms/我的龙虾直播间-837832` 的 `params.roomId` 为 `我的龙虾直播间-837832`
- 若链接为 `%E6%88%91...` 编码形式，Next 会解码，客户端发送的 `join-room` 应为解码后的字符串
- Socket.io room 名为任意字符串，中文字符本身可正常使用，关键是服务端与客户端的 roomId 必须完全一致
