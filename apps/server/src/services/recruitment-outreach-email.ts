import { getPublishingLlmClient, trackedChatCompletion } from './llm';
import type { TokenFeature } from './token-tracker';

const FEATURE: TokenFeature = 'recruitment_outreach_email';

/**
 * 提示词中的建议上限（模型应尽量遵守；Gmail/Outlook 打开方式由前端分层处理，服务端不再为缩短 URL 而裁正文）。
 * 当前约定：主题约 100 字内；正文约 4000 字内（含换行），足以写完整 cold outreach。
 */
const PROMPT_SUBJECT_MAX_CHARS = 100;
const PROMPT_BODY_MAX_CHARS = 4000;

/** 防止异常超长响应占满存储/传输；与 API 路由 smart-email/send 的 48k 正文上限错开层级 */
const HARD_CAP_SUBJECT_CHARS = 400;
const HARD_CAP_BODY_CHARS = 12_000;

function stripJsonFence(raw: string): string {
  const t = raw.trim();
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  return m ? m[1].trim() : t;
}

function clampWithEllipsis(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * 根据 JD 与候选人信息生成首封沟通邮件（中文）。
 */
export async function generateRecruitmentOutreachEmail(params: {
  jdTitle: string;
  jdCompany: string | null;
  jdLocation: string | null;
  jdBody: string;
  candidateGithub: string;
  candidateDisplayName: string | null;
  candidateEmail: string | null;
  candidateNotes: string | null;
  /** 候选人简介（如智能推荐 oneLiner） */
  candidateIntro: string | null;
  /** 招聘方在资料中填写的沟通邮箱（如 Gmail），用于正文署名与回复指引 */
  recruiterContactEmail: string | null;
}): Promise<{ subject: string; body: string }> {
  const { client, model } = getPublishingLlmClient();
  const jdSnippet =
    params.jdBody.length > 12_000 ? `${params.jdBody.slice(0, 12_000)}…` : params.jdBody;

  const user = `【职位】
标题：${params.jdTitle}
公司：${params.jdCompany ?? '（未填写）'}
地点：${params.jdLocation ?? '（未填写）'}
职位描述：
${jdSnippet}

【候选人】
GitHub：@${params.candidateGithub}
称呼/显示名：${params.candidateDisplayName ?? '（未知）'}
简介/亮点：${params.candidateIntro?.trim() ? params.candidateIntro.trim().slice(0, 2_000) : '（无）'}
已知邮箱：${params.candidateEmail ?? '（未填写，正文中可写「如邮箱有误请回复告知」类措辞）'}
内部备注：${params.candidateNotes ?? '（无）'}

【招聘方联系/回复】
${params.recruiterContactEmail ? `建议使用署名与回复邮箱：${params.recruiterContactEmail}（请在邮件末尾签名中体现，并说明候选人可回复至此邮箱）` : '（用户尚未在「我的」填写招聘沟通邮箱；正文可写公司或团队邮箱，或邀请候选人回复讨论）'}

请写一封专业、真诚的中文 cold outreach 邮件（技术招聘场景）。段落写完整，结尾有明确下一步（如欢迎回复、约聊）；不要用 markdown 标题符号。
建议长度：主题不超过 ${PROMPT_SUBJECT_MAX_CHARS} 个字符；正文不超过 ${PROMPT_BODY_MAX_CHARS} 个字符（含换行与标点）。在建议范围内尽量写充分，不要无故过短。
只输出一个 JSON 对象，不要其它文字。格式严格为：
{"subject":"邮件主题一行","body":"邮件正文，换行用 \\n 表示"}`;

  const res = await trackedChatCompletion(
    {
      model,
      messages: [
        {
          role: 'system',
          content:
            `你是资深技术招聘顾问，帮助 HR 给开发者写首封沟通邮件。主题建议≤${PROMPT_SUBJECT_MAX_CHARS}字、正文建议≤${PROMPT_BODY_MAX_CHARS}字；段落完整、结尾可落款。若已提供招聘方联系邮箱，请在正文末自然附上签名与回复方式。只输出合法 JSON 对象，键为 subject 与 body，字符串内使用 \\n 表示换行。`,
        },
        { role: 'user', content: user },
      ],
      temperature: 0.55,
      max_tokens: 6000,
    },
    FEATURE,
    {
      jdTitle: params.jdTitle.slice(0, 120),
      gh: params.candidateGithub.slice(0, 80),
    },
    client,
  );

  const raw = res.choices[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error('模型未返回内容');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch {
    throw new Error('模型返回格式无法解析为 JSON，请重试');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('模型返回无效 JSON');
  }

  const o = parsed as { subject?: unknown; body?: unknown };
  let subject = typeof o.subject === 'string' ? o.subject.trim() : '';
  let body = typeof o.body === 'string' ? o.body.trim() : '';
  body = body.replace(/\\n/g, '\n');

  if (!subject || !body) {
    throw new Error('模型未生成完整的主题或正文');
  }

  subject = clampWithEllipsis(subject, HARD_CAP_SUBJECT_CHARS);
  body = clampWithEllipsis(body, HARD_CAP_BODY_CHARS);

  return { subject, body };
}
