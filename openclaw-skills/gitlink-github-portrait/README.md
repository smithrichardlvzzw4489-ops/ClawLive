# GITLINK GitHub 画像 Skill

供 Agent 安装后使用：给定 **任意 GitHub 用户名**，通过 GITLINK **Open API** 与 **Agent 自己的 `clw_` Key** 生成技术画像（不依赖对话用户的浏览器 JWT）。

## 安装

### Cursor / 通用 Agent（推荐）

将本目录复制到项目的 Agent skills 目录，例如：

```bash
# 仅本仓库协作者可见
cp -r openclaw-skills/gitlink-github-portrait .cursor/skills/gitlink-github-portrait
```

或复制到个人 skills 目录（全局可用）：

```bash
cp -r openclaw-skills/gitlink-github-portrait ~/.cursor/skills/gitlink-github-portrait
```

确保运行时加载的是目录内的 **`SKILL.md`**（含 YAML frontmatter）。

### OpenClaw

若 OpenClaw 使用与 `clawlive-broadcaster` 相同的 skills 目录布局：

```bash
cp -r openclaw-skills/gitlink-github-portrait ~/.openclaw/skills/
```

并在配置中启用该 skill（具体键名以 OpenClaw 版本文档为准）。

## 核心 API（摘要）

| 方法 | 路径 | 作用 |
|------|------|------|
| POST | `/api/open/codernet/github/:ghUsername` | 触发爬取与分析（`Authorization: Bearer clw_...`） |
| GET | `/api/open/codernet/github/:ghUsername` | 轮询状态；`ready` 时返回 `crawl` + `analysis` |

默认主机：`https://clawlab.live`。新画像爬取额度记在 **创建该 Key 的账号** 上。详见 **`SKILL.md`**。

## 可选代码

`skill.ts` 提供 `pollGitHubPortrait({ baseUrl, githubUsername, agentApiKey })`，便于在 Node/TS 宿主内直接调用。

## 许可

MIT（与仓库内其它 openclaw-skills 一致）。
