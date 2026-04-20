import { getPublishingLlmClient, trackedChatCompletion } from './llm';
import type { TokenFeature } from './token-tracker';

const FEATURE: TokenFeature = 'recruitment_outreach_email';

/** 与前端「Gmail 单标签打开」href 上限一致；超出则用户依赖剪贴板分层，生成阶段尽量一次塞满 */
const GMAIL_COMPOSE_HREF_MAX_LEN = 1950;

/** 提示词软上限（模型可能略超，解析后按 Gmail 链接长度做二进制截断） */
const PROMPT_SUBJECT_MAX_CHARS = 80;
const PROMPT_BODY_MAX_CHARS = 1800;

const GMAIL_COMPOSE_PREFIX = 'https://mail.google.com/mail/u/0/?';

function gmailComposeHrefLength(to: string, subject: string, body: string): number {
  const p = new URLSearchParams();
  p.set('view', 'cm');
  p.set('fs', '1');
  p.set('to', to);
  p.set('su', subject);
  p.set('body', body);
  return GMAIL_COMPOSE_PREFIX.length + p.toString().length;
}

/**
 * 按真实收件人邮箱估算 Gmail 撰写链接长度，截断主题/正文，使「在 Gmail 中打开」能一次带上主题+正文。
 * 若模型忽略字数提示产生超长主题，先压缩主题再压缩正文。
 */
function fitSmartEmailToGmailHref(
  candidateEmail: string | null | undefined,
  subject: string,
  body: string,
): { subject: string; body: string } {
  const to = (candidateEmail && candidateEmail.trim()) || 'user@email.invalid';
  const origS = subject.trim();
  const origB = body.trim();
  let s = origS;
  let b = origB;

  if (gmailComposeHrefLength(to, s, b) <= GMAIL_COMPOSE_HREF_MAX_LEN) {
    return { subject: s, body: b };
  }

  let guard = 0;
  while (s.length > 4 && gmailComposeHrefLength(to, s, '') > GMAIL_COMPOSE_HREF_MAX_LEN && guard++ < 48) {
    s = `${s.slice(0, Math.max(4, Math.floor(s.length * 0.88))).trimEnd()}…`;
  }

  let lo = 0;
  let hi = origB.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const tryB = origB.slice(0, mid);
    if (gmailComposeHrefLength(to, s, tryB) <= GMAIL_COMPOSE_HREF_MAX_LEN) lo = mid;
    else hi = mid - 1;
  }
  b = lo < origB.length ? `${origB.slice(0, lo).trimEnd()}${lo < origB.length ? '…' : ''}` : origB;

  if (gmailComposeHrefLength(to, s, b) <= GMAIL_COMPOSE_HREF_MAX_LEN) {
    return { subject: s, body: b };
  }

  guard = 0;
  while (s.length > 4 && gmailComposeHrefLength(to, s, b) > GMAIL_COMPOSE_HREF_MAX_LEN && guard++ < 48) {
    s = `${s.slice(0, Math.max(4, Math.floor(s.length * 0.88))).trimEnd()}…`;
  }

  guard = 0;
  while (b.length > 20 && gmailComposeHrefLength(to, s, b) > GMAIL_COMPOSE_HREF_MAX_LEN && guard++ < 120) {
    b = `${b.slice(0, Math.max(20, Math.floor(b.length * 0.92))).trimEnd()}…`;
  }

  return { subject: s.trim(), body: b.trim() };
}

function stripJsonFence(raw: string): string {
  const t = raw.trim();
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  return m ? m[1].trim() : t;
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

请写一封简短、专业、真诚的中文 cold outreach 邮件（技术招聘场景）。
硬性字数（超出会导致无法保存）：主题不超过 ${PROMPT_SUBJECT_MAX_CHARS} 个字符；正文不超过 ${PROMPT_BODY_MAX_CHARS} 个字符（含换行与标点）。宁可略短，不要超长。
只输出一个 JSON 对象，不要其它文字。格式严格为：
{"subject":"邮件主题一行","body":"邮件正文，换行用 \\n 表示"}
body 内不要使用 markdown 标题符号。`;

  const res = await trackedChatCompletion(
    {
      model,
      messages: [
        {
          role: 'system',
          content:
            `你是资深技术招聘顾问，帮助 HR 给开发者写首封沟通邮件。主题≤${PROMPT_SUBJECT_MAX_CHARS}字、正文≤${PROMPT_BODY_MAX_CHARS}字（硬性上限）。若已提供招聘方联系邮箱，请在正文末自然附上签名与回复方式。只输出合法 JSON 对象，键为 subject 与 body，字符串内使用 \\n 表示换行。`,
        },
        { role: 'user', content: user },
      ],
      temperature: 0.55,
      /** 中文长正文需足够 completion；过高会增加费用，与 PROMPT_BODY_MAX 匹配 */
      max_tokens: 3200,
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
  const subject = typeof o.subject === 'string' ? o.subject.trim() : '';
  let body = typeof o.body === 'string' ? o.body.trim() : '';
  body = body.replace(/\\n/g, '\n');

  if (!subject || !body) {
    throw new Error('模型未生成完整的主题或正文');
  }

  const fitted = fitSmartEmailToGmailHref(params.candidateEmail, subject, body);
  return { subject: fitted.subject, body: fitted.body };
}
