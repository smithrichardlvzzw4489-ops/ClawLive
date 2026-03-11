# 贡献指南

感谢你对 ClawLive 项目的关注！我们欢迎各种形式的贡献。

## 如何贡献

### 报告 Bug

在 [GitHub Issues](https://github.com/yourusername/clawlive/issues) 创建 issue，包含：

- 问题描述
- 复现步骤
- 预期行为 vs 实际行为
- 环境信息（操作系统、浏览器、Node.js 版本等）
- 错误日志或截图

### 提交功能请求

创建 issue 并使用 `enhancement` 标签，描述：

- 功能的使用场景
- 期望的实现效果
- 可能的实现方案（如果有想法）

### 提交 Pull Request

1. **Fork 项目并克隆**
   ```bash
   git clone https://github.com/your-username/clawlive.git
   cd clawlive
   ```

2. **创建分支**
   ```bash
   git checkout -b feature/your-feature-name
   # 或
   git checkout -b fix/bug-description
   ```

3. **安装依赖**
   ```bash
   pnpm install
   ```

4. **开发**
   - 遵循项目代码风格
   - 为新功能编写测试
   - 更新相关文档

5. **测试**
   ```bash
   pnpm lint
   pnpm test
   pnpm build
   ```

6. **提交**
   ```bash
   git add .
   git commit -m "feat: add amazing feature"
   ```

   提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)：
   - `feat:` 新功能
   - `fix:` Bug 修复
   - `docs:` 文档更新
   - `style:` 代码格式调整
   - `refactor:` 重构
   - `test:` 测试相关
   - `chore:` 构建/工具相关

7. **推送并创建 PR**
   ```bash
   git push origin feature/your-feature-name
   ```

   在 GitHub 上创建 Pull Request，描述：
   - 改动内容
   - 相关 issue
   - 测试情况
   - 截图（如果是 UI 改动）

## 代码规范

### TypeScript

- 使用 TypeScript strict mode
- 为所有公共 API 编写类型定义
- 避免使用 `any`，优先使用 `unknown` 或具体类型

### React

- 优先使用函数组件和 Hooks
- 使用 `'use client'` 标记客户端组件
- 组件文件名使用 PascalCase

### 命名约定

- 文件名：kebab-case (my-component.ts)
- 组件：PascalCase (MyComponent)
- 函数/变量：camelCase (myFunction)
- 常量：UPPER_SNAKE_CASE (MAX_SIZE)
- 类型/接口：PascalCase (User, Room)

### 注释

- 复杂逻辑添加注释说明
- 导出的函数/类添加 JSDoc
- 避免显而易见的注释

## 项目结构

```
clawlive/
├── apps/
│   ├── web/          # Next.js 前端
│   └── server/       # Express 后端
├── packages/         # 共享包
├── docs/             # 文档
└── openclaw-skills/  # OpenClaw Skill
```

## 开发工作流

1. 启动开发环境
   ```bash
   pnpm docker:up  # 启动数据库
   pnpm dev        # 启动应用
   ```

2. 前端: http://localhost:3000
3. 后端: http://localhost:3001
4. Prisma Studio: `pnpm db:studio`

## 测试

### 单元测试
```bash
pnpm test
```

### E2E 测试
```bash
pnpm test:e2e
```

### 手动测试清单

- [ ] 创建房间
- [ ] 开始/停止直播
- [ ] 发送弹幕
- [ ] 多个观众同时观看
- [ ] Webhook 推送消息
- [ ] 截图显示
- [ ] 移动端响应式

## 文档

更新文档时：

- README.md - 项目概述和快速开始
- docs/API.md - API 端点文档
- docs/DEPLOYMENT.md - 部署指南
- docs/OPENCLAW_INTEGRATION.md - OpenClaw 集成

## 发布流程

维护者会负责版本发布：

1. 更新版本号（遵循 semver）
2. 更新 CHANGELOG
3. 创建 Git tag
4. 发布到 npm（如果需要）
5. 部署到生产环境

## 社区准则

- 尊重所有贡献者
- 欢迎新手提问
- 保持讨论专注于技术
- 及时响应 PR review 意见

## 需要帮助？

- 查看 [GitHub Discussions](https://github.com/yourusername/clawlive/discussions)
- 加入 Discord 社区（如果有）
- 查阅现有 issues 和 PRs

## 许可证

提交代码即表示你同意以 MIT 许可证贡献。
