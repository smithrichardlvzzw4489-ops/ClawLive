/**
 * 注册时：为每位用户生成 Open Agent Key + 仅本人可见的「外部小龙虾求职」Skill（Markdown）。
 * MiniMax 等外部 Agent 用 Key 调 /api/open/job-a2a/* 与 ClawLab 同步求职档案。
 */
import { prisma } from '../lib/prisma';
import { createAgentApiKey } from './agent-api-keys';

export type ExternalLobsterJobPackResult = {
  apiKey: string;
  keyPrefix: string;
  skillId: string;
  skillTitle: string;
  agentKeyId: string;
};

function publicApiBase(): string {
  const b = process.env.PUBLIC_CLAWLAB_API_URL || process.env.NEXT_PUBLIC_APP_URL || '';
  const trimmed = b.replace(/\/$/, '');
  if (trimmed) return trimmed;
  return 'https://www.clawlab.live';
}

function buildSkillMarkdown(params: {
  apiBase: string;
  rawKey: string;
  username: string;
}): string {
  const base = params.apiBase;
  return `# ClawLab · 外部小龙虾求职桥接

你是主人 **${params.username}** 在 ClawLab（clawlab.live）的求职助手桥接技能。  
使用以下 **Open API** 与平台同步求职意向（用户已授权）。

## 认证（必读）
所有请求需 HTTP Header：
\`Authorization: Bearer ${params.rawKey}\`

密钥以 **clw_** 开头，等同主人在 ClawLab 的身份，**切勿泄露或提交到公开仓库**。

**API 根地址**：\`${base}\`

## 1. 校验身份
\`GET ${base}/api/open/me\`
返回 userId、agentName。

## 2. 提交或更新求职档案（建议先与主人对话确认）
\`PUT ${base}/api/open/job-a2a/seeker\`  
Content-Type: application/json

Body 示例：
\`\`\`json
{
  "title": "前端工程师",
  "city": "上海",
  "salaryMin": 20,
  "salaryMax": 35,
  "skills": ["React", "TypeScript"],
  "narrative": "与主人确认后的求职摘要、偏好与约束",
  "active": false
}
\`\`\`

- **narrative**：请你在对话中向主人确认意向后再填写。
- **active**：可先为 \`false\`，仅草稿；确认无误后再调「开启求职」。

## 3. 查询当前档案
\`GET ${base}/api/open/job-a2a/seeker\`

## 4. 开启求职（进入 A2A 匹配池）
\`POST ${base}/api/open/job-a2a/start\`  
Body：\`{}\`

将档案设为 **active**，并提示主人打开 **clawlab.live/job-a2a** 点击「全站自动匹配」，再与双方 Darwin 代聊。

---
本技能由 ClawLab 注册流程自动生成；状态为「待审核」仅本人可在「我的技能」中查看全文，**不会出现在社区市场列表**。
`;
}

/**
 * 创建 Agent Key + 仅本人可见的 pending 技能（含完整 Key 与接入说明）。
 */
export async function provisionExternalLobsterJobPack(
  userId: string,
  username: string,
): Promise<ExternalLobsterJobPackResult> {
  const safeName = username.trim().slice(0, 40) || 'user';
  const { key, rawKey } = await createAgentApiKey(userId, `${safeName}-external-lobster`, 'minimax-lobster');

  const apiBase = publicApiBase();
  const skillMarkdown = buildSkillMarkdown({
    apiBase,
    rawKey,
    username: safeName,
  });

  const skill = await prisma.publishedSkill.create({
    data: {
      authorId: userId,
      title: `ClawLab 外部小龙虾 · 求职桥接（${safeName}）`,
      description:
        '仅本人可见：含 Open API Key 与 MiniMax/外部 Agent 接入说明，用于与 ClawLab A2A 求职同步。',
      skillMarkdown,
      tags: ['clawlab', 'job-a2a', 'external-lobster', 'minimax'],
      creditCostPerCall: 0,
      status: 'pending',
    },
  });

  return {
    apiKey: rawKey,
    keyPrefix: key.keyPrefix,
    skillId: skill.id,
    skillTitle: skill.title,
    agentKeyId: key.id,
  };
}
