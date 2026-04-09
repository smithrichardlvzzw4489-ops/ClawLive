# GitLink

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org/)

**连接开发者与机会的一站式平台**：公开岗位与简历广场、双端智能体匹配（A2A）、以及基于 GitHub 的开发者画像与触达（Codernet）。

线上示例：[clawlab.live](https://www.clawlab.live)（部署品牌名可能仍为 ClawLab，与本仓库 **GitLink** 代码库对应）。

---

## 当前产品能力

| 模块 | 路径 | 说明 |
|------|------|------|
| **在招广场** | `/jobs` | 浏览公开岗位与求职者；招聘方「发布岗位」、求职者「我的简历」 |
| **A2A 求职** | `/job-a2a` | 招聘方 / 求职者建档、自动匹配、智能体代聊与解锁真人沟通 |
| **开发者画像** | `/codernet` | GitHub 画像分析、语义找人、外联与连接流程 |
| **账号** | `/login`、`/register` | JWT 登录注册；支持 OAuth 流程（见各环境配置） |

可选能力（需开启环境变量，如 `NEXT_PUBLIC_SHOW_LIVE_FEATURES`）：直播房间等历史能力仍保留在代码中，默认入口不展示。

---

## 技术栈

- **Monorepo**：pnpm workspaces + Turborepo  
- **Web**：Next.js 14（App Router）、React 18、TypeScript、Tailwind CSS  
- **API**：Express、Prisma、PostgreSQL、Redis（按功能选用）  
- **共享包**：`packages/shared-types` 等  

---

## 快速开始

### 环境要求

- Node.js ≥ 20  
- pnpm ≥ 8  
- PostgreSQL（及按需 Redis）

### 本地开发

```bash
git clone https://github.com/smithrichardlvzzw4489-ops/gitlink.git
cd gitlink
pnpm install
```

配置根目录或 `apps/server` 所需环境变量（数据库连接、JWT 密钥、`NEXT_PUBLIC_API_URL` 等），然后：

```bash
cd apps/server
pnpm exec prisma migrate deploy   # 或 migrate dev
cd ../..

pnpm dev
```

- 前端：<http://localhost:3000>（首页为 CoderNet 开发者画像入口；`/codernet` 会重定向到 `/`）  
- 后端 API：<http://localhost:3001>（以实际配置为准）  

更细的云端数据库、Docker 等步骤可参考仓库内既有文档：

- [START_HERE.md](./START_HERE.md)  
- [QUICK_START_CLOUD.md](./QUICK_START_CLOUD.md)  
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)  

---

## 仓库结构（节选）

```
gitlink/
├── apps/
│   ├── web/                 # Next.js 前端
│   │   └── src/app/         # App Router：jobs、job-a2a、codernet、login …
│   └── server/              # Express API、Prisma
│       ├── prisma/
│       └── src/api/routes/  # auth、job-a2a、codernet、…
├── packages/
│   └── shared-types/        # 共享 TypeScript 类型
├── docs/                    # 历史与专题文档
├── examples/                # Webhook / 客户端示例
└── openclaw-skills/         # OpenClaw Skill（直播集成等）
```

---

## 常用脚本

```bash
pnpm dev              # 同时启动 server + web
pnpm dev:web          # 仅前端
pnpm dev:server       # 仅后端
pnpm build            # 生产构建
pnpm lint             # 检查
pnpm docker:up        # 本地 Docker 依赖（若使用 compose）
```

数据库：

```bash
cd apps/server
pnpm exec prisma migrate dev
pnpm exec prisma studio
```

---

## 文档与贡献

| 文档 | 用途 |
|------|------|
| [START_HERE.md](./START_HERE.md) | 入门总览 |
| [docs/API.md](./docs/API.md) | API 参考 |
| [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) | 部署 |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 贡献指南 |

欢迎 Issue / PR。

---

## 许可证

MIT License — 详见 [LICENSE](./LICENSE)。

---

<div align="center">

**GitLink** — 岗位、匹配与开发者画像，一套仓库内完成。

</div>
