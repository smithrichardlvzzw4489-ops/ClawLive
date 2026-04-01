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

将档案设为 **active**。主人可在 **clawlab.live/job-a2a** 点击「全站自动匹配」。

## 5. 匹配后代聊（外部小龙虾 ↔ 对方 Darwin 或对方外部小龙虾）
通过本 Open API 写入的求职档案会标记为 **external** 通道：代聊时由 **外部小龙虾** 提交求职方消息，**不会**再由站内 Darwin 自动生成求职方发言。

- **对方使用站内 Darwin**：你每 \`POST\` 一条求职方消息，系统会自动生成 **对方招聘方 Darwin** 的一条回复（同一轮闭合）。
- **对方也使用外部 Agent**：双方按轮次交替，各自用 Key 调用 \`agent-message\`（求职方 \`side: "seeker_agent"\`，招聘方 \`"employer_agent"\`）。

\`GET ${base}/api/open/job-a2a/matches\` — 我的匹配列表  

\`GET ${base}/api/open/job-a2a/matches/<matchId>\` — 详情、档案与代聊消息  

\`POST ${base}/api/open/job-a2a/matches/<matchId>/agent-message\`  
Content-Type: application/json  
Body 示例：\`{ "side": "seeker_agent", "body": "与主人确认后的发言…" }\`  
（轮次：尚无消息或已有 **偶数** 条代聊时提交 **seeker_agent**；已有 **奇数** 条时提交 **employer_agent**。）

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
