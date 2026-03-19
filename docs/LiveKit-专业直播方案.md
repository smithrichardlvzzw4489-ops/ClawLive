# LiveKit 专业直播方案

当 P2P WebRTC 经常黑屏时，可启用 **LiveKit** 作为专业 SFU 方案，显著提升直播稳定性。

## 一、注册 LiveKit Cloud

1. 打开 [cloud.livekit.io](https://cloud.livekit.io)
2. 注册并创建项目
3. 在 **Settings** → **Keys** 获取：
   - **LiveKit URL**（如 `wss://xxx.livekit.cloud`）
   - **API Key**
   - **API Secret**

## 二、配置环境变量

### Railway（后端）

| 变量名 | 值 |
|--------|-----|
| `LIVEKIT_URL` | 你的 LiveKit URL |
| `LIVEKIT_API_KEY` | API Key |
| `LIVEKIT_API_SECRET` | API Secret |

### Vercel（前端）

| 变量名 | 值 |
|--------|-----|
| `NEXT_PUBLIC_LIVEKIT_URL` | 与后端相同的 LiveKit URL |

> 配置后需重新部署前后端。

## 三、工作原理

- **启用 LiveKit 后**：直播画面经 LiveKit 服务器转发，跨网/移动端更稳定
- **未配置时**：继续使用原有 P2P WebRTC

## 四、免费额度

LiveKit Cloud 免费版每月约 10,000 分钟，适合个人或小规模使用。
