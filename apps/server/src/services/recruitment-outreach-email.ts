import { getPublishingLlmClient, trackedChatCompletion } from './llm';
import type { TokenFeature } from './token-tracker';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const FEATURE: TokenFeature = 'recruitment_outreach_email';

/** 模型目标：正文充实；低于此则触发一次补写重试 */
const PROMPT_BODY_MIN_CHARS = 650;
const PROMPT_BODY_MAX_CHARS = 4500;
const PROMPT_SUBJECT_MAX_CHARS = 100;

/** 首次生成若正文仍短于此（约半屏），自动多轮补写一次 */
const BODY_LENGTH_RETRY_THRESHOLD = 520;

/** 防止异常超长响应；与 send 接口 48k 上限分层 */
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

function parseSubjectBodyFromModelJson(raw: string): { subject: string; body: string } {
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
  const subject = typeof o.subject === 'string' ? o.subject.trim() : '';
  let body = typeof o.body === 'string' ? o.body.trim() : '';
  body = body.replace(/\\n/g, '\n');
  if (!subject || !body) {
    throw new Error('模型未生成完整的主题或正文');
  }
  return { subject, body };
}

/**
 * 根据 JD 与候选人信息生成首封沟通邮件（中文）。
 * 不以 Gmail 链接长度为理由截断：完整内容用于弹窗展示与「通过服务器发送」。
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
  candidateIntro: string | null;
  recruiterContactEmail: string | null;
}): Promise<{ subject: string; body: string }> {
  const { client, model } = getPublishingLlmClient();
  const jdSnippet =
    params.jdBody.length > 12_000 ? `${params.jdBody.slice(0, 12_000)}…` : params.jdBody;

  const userContent = `【职位】
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

请写一封**信息充分**的中文 cold outreach 邮件（技术招聘场景）。
**硬性要求（必须同时满足）：**
1. 主题：完整一行，建议 ${Math.floor(PROMPT_SUBJECT_MAX_CHARS * 0.2)}～${PROMPT_SUBJECT_MAX_CHARS} 字，突出公司与岗位价值，不要用「……」敷衍截断。
2. 正文：**不少于 ${PROMPT_BODY_MIN_CHARS} 字、不超过 ${PROMPT_BODY_MAX_CHARS} 字**（含换行与标点）。须包含：得体称呼、为何联系对方、岗位与团队说明、与对方经历的匹配点、工作方式/技术栈亮点、明确的下一步（欢迎回复/约聊）、结尾署名或回复指引。**禁止**只写两三段空话或明显过短的应付内容。
3. 不要用 markdown 标题符号（#）；换行在 JSON 里用 \\n 表示。

只输出一个 JSON 对象，不要其它文字。格式严格为：
{"subject":"邮件主题一行","body":"邮件正文，换行用 \\n 表示"}`;

  const systemContent = `你是资深技术招聘顾问。你必须写出**足够长且具体**的首封邮件：正文至少 ${PROMPT_BODY_MIN_CHARS} 字、至多 ${PROMPT_BODY_MAX_CHARS} 字；分段清晰，禁止敷衍短文。若已提供招聘方联系邮箱，正文末须自然附上签名与回复方式。只输出合法 JSON，键为 subject 与 body，字符串内用 \\n 表示换行。`;

  const completionOpts = {
    model,
    temperature: 0.58,
    max_tokens: 7200,
  };

  const baseMessages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];

  const res1 = await trackedChatCompletion(
    {
      ...completionOpts,
      messages: baseMessages,
    },
    FEATURE,
    {
      jdTitle: params.jdTitle.slice(0, 120),
      gh: params.candidateGithub.slice(0, 80),
    },
    client,
  );

  const raw1 = res1.choices[0]?.message?.content?.trim();
  if (!raw1) {
    throw new Error('模型未返回内容');
  }

  let { subject, body } = parseSubjectBodyFromModelJson(raw1);

  if (body.length < BODY_LENGTH_RETRY_THRESHOLD) {
    const fixMessages: ChatCompletionMessageParam[] = [
      ...baseMessages,
      { role: 'assistant', content: raw1 },
      {
        role: 'user',
        content: `上一版正文字数仅约 ${body.length} 字，**未达到**不少于 ${PROMPT_BODY_MIN_CHARS} 字的要求。请重新输出**一整份**合法 JSON（替换 subject 与 body），正文必须写满至少 ${PROMPT_BODY_MIN_CHARS} 字、不超过 ${PROMPT_BODY_MAX_CHARS} 字，分段充实，禁止再敷衍。`,
      },
    ];

    const res2 = await trackedChatCompletion(
      {
        ...completionOpts,
        messages: fixMessages,
      },
      FEATURE,
      {
        jdTitle: params.jdTitle.slice(0, 120),
        gh: `${params.candidateGithub.slice(0, 80)}:retry`,
      },
      client,
    );

    const raw2 = res2.choices[0]?.message?.content?.trim();
    if (!raw2) {
      throw new Error('补写邮件时模型未返回内容');
    }
    ({ subject, body } = parseSubjectBodyFromModelJson(raw2));
  }

  subject = clampWithEllipsis(subject, HARD_CAP_SUBJECT_CHARS);
  body = clampWithEllipsis(body, HARD_CAP_BODY_CHARS);

  return { subject, body };
}
