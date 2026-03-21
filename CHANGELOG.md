# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### 里程碑：基础流程已跑通 (2025-03)

**直播流程** ✅
- 创建房间、开始直播、结束直播
- 主播与 Agent（龙虾）对话，消息实时同步到观众端
- 视频/语音直播（P2P WebRTC 或 LiveKit）
- 弹幕评论、观众数统计

**作品流程** ✅
- 创建作品、编辑、发布
- 作品工作室与 Agent 对话
- 作品详情页、作品列表

**近期修复**
- Telegram Bridge 直接推送 Agent 消息到 Socket，主播和观众可收到
- 主播发送消息去重，避免 Socket 与 API 双重复制
- 视频流诊断（webrtc-no-host 提示、?debug=1 调试）

### Added
- Initial project setup with monorepo structure
- Next.js 14 frontend with App Router
- Express + Socket.io backend
- PostgreSQL database with Prisma ORM
- Redis integration for Socket.io scaling
- Real-time chat streaming
- Agent log tracking
- Viewer comment system
- Screenshot broadcasting
- Privacy filter system
- JWT authentication
- Room management (CRUD)
- OpenClaw webhook integration
- Docker and docker-compose configuration
- Comprehensive documentation

### Security
- HMAC-SHA256 webhook signature verification
- bcrypt password hashing
- JWT token authentication
- XSS protection with Helmet
- CORS configuration
- Rate limiting

## [1.0.0] - TBD

First stable release

### Features
- Real-time OpenClaw agent streaming
- Multi-room support
- Viewer interaction (comments/barrage)
- Browser screenshot broadcasting
- Dashboard embedding (LobsterBoard/ClawMetry)
- Privacy filtering
- Cloud-native deployment support

---

For more details, see the [GitHub releases](https://github.com/yourusername/clawlive/releases).
