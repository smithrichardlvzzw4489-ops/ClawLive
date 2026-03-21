# 直播视频问题排查指南

## 一、使用调试模式定位问题

在直播间 URL 后加 `?debug=1`，例如：
```
https://你的域名/rooms/xxx?debug=1
```

页面顶部会显示调试信息：
- **LiveKit**：是否使用 LiveKit（true=走 LiveKit，false=走 P2P WebRTC）
- **isHost**：当前是否为主播
- **isLive**：房间是否在直播中
- **hasStream**：是否已收到视频流
- **socket**：Socket 是否已连接
- **noHost**：服务端是否明确返回「主播未注册」
- **error**：视频相关错误信息

## 二、服务端日志（Railway）

在 Railway 部署日志中搜索 `[WebRTC]`：

| 日志内容 | 含义 |
|----------|------|
| `Host xxx registered for room yyy` | 主播已点击「摄像头直播」，服务端已记录 |
| `viewer xxx requested stream for room yyy, forwarding to host zzz` | 观众请求已转发给主播，正常流程 |
| `viewer xxx requested stream for room yyy, but NO HOST REGISTERED` | **主播未点击「摄像头直播」**，或 Redis 未配置导致多实例下 host 信息丢失 |

## 三、常见原因与解决

### 1. 观众看到「主播尚未开启摄像头」或「等待画面...」

**原因**：主播未点击「摄像头直播」。

**解决**：主播在直播间点击顶部的「📷 摄像头直播」或页面中的「打开摄像头开始视频直播」按钮。

### 2. 主播已点击摄像头，观众仍无画面

**可能原因**：

- **NEXT_PUBLIC_LIVEKIT_URL 误配置**：Vercel 若配置了该变量但未部署 LiveKit，会走 LiveKit 流程导致失败。
  - **解决**：未使用 LiveKit 时，删除 Vercel 中的 `NEXT_PUBLIC_LIVEKIT_URL` 环境变量并重新部署。

- **多实例未配置 Redis**：Railway 多实例时，每个实例有独立内存，观众可能连到不同实例，无法拿到主播的 host 信息。
  - **解决**：在 Railway 配置 `REDIS_URL`，并重新部署。

- **WebRTC 连接失败**：NAT/防火墙导致 P2P 连接失败。
  - **解决**：检查浏览器控制台是否有 WebRTC 相关错误；尝试更换网络（如手机热点）测试。

### 3. 画面区域为白屏

- 若房间配置了 `dashboardUrl`，无视频流时会显示 iframe，若目标页面为白页则会出现白屏。
- 调试模式下查看 `hasStream`、`noHost`、`error` 以进一步判断。

## 四、检查清单

- [ ] 主播已点击「摄像头直播」
- [ ] 未用 LiveKit 时，Vercel 未设置 `NEXT_PUBLIC_LIVEKIT_URL`
- [ ] 多实例时 Railway 已配置 `REDIS_URL`
- [ ] `NEXT_PUBLIC_API_URL` 和 `NEXT_PUBLIC_SOCKET_URL` 指向正确后端
- [ ] 使用 `?debug=1` 查看前端状态
- [ ] 查看 Railway 日志中的 `[WebRTC]` 输出
