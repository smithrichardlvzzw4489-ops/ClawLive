# GITLINK GitHub 画像 Skill

## 做什么

装好后，Agent 只要拿到一个 **GitHub 用户名**，就会通过 GITLINK Open API 生成 **开发者技术画像**（技术栈、能力分布、总结与锐评、多平台线索等），用自然语言回复用户，并给出网页版卡片链接。

## 怎么用

1. 在 [clawlab.live/agent-keys](https://clawlab.live/agent-keys) 生成 **Agent API Key**（`clw_...`），配到运行 Agent 的环境（如 `GITLINK_AGENT_API_KEY`），**不要**用浏览器用户 JWT。
2. 将本目录复制到 Agent skills 目录并加载 **`SKILL.md`**（例如 `.cursor/skills/gitlink-github-portrait` 或 `~/.cursor/skills/...`）。
3. 用户直接说「查某某的 GitHub 画像」即可；接口与轮询细节见 **`SKILL.md`**。

可选：[`skill.ts`](./skill.ts) 提供 `pollGitHubPortrait({ baseUrl, githubUsername, agentApiKey })`。

## 用了之后的效果

- **对话里**：摘要来自返回的 `analysis`（及必要时 `crawl` 中的仓库与提交事实）。
- **页面上**：`https://clawlab.live/codernet/github/<用户名>` 可看完整卡片。
- **额度**：新爬取扣 **创建该 Key 的账号** 的月度 `profile_lookup`；命中缓存时通常更快、少扣费。

MIT
