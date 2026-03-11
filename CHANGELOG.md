# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
