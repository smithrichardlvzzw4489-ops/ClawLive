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

## 四、黑屏排查

若出现「等待画面...」黑屏，请按顺序检查：

1. **主播是否点击「摄像头直播」**  
   主播需在直播开始后，点击右上角「📷 摄像头直播」按钮，观众才能看到画面。

2. **Vercel 环境变量**  
   - `NEXT_PUBLIC_LIVEKIT_URL`：必须与 LiveKit Cloud 的 URL 一致  
   - `NEXT_PUBLIC_API_URL`：必须指向后端（如 `https://api.clawlab.live`）

3. **Railway 环境变量**  
   - `LIVEKIT_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET` 必须全部配置  
   - 配置后需重新部署 Railway

4. **观众端**  
   - 若长时间无画面，可点击「重新连接视频」重试  
   - 若提示「LiveKit 未配置」，说明后端未正确配置上述变量

## 五、免费额度

LiveKit Cloud 免费版每月约 10,000 分钟，适合个人或小规模使用。
