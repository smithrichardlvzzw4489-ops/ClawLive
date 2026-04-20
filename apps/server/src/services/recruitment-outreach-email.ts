import { getPublishingLlmClient, trackedChatCompletion } from './llm';
import type { TokenFeature } from './token-tracker';

const FEATURE: TokenFeature = 'recruitment_outreach_email';

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
已知邮箱：${params.candidateEmail ?? '（未填写，正文中可写「如邮箱有误请回复告知」类措辞）'}
内部备注：${params.candidateNotes ?? '（无）'}

请写一封简短、专业、真诚的中文 cold outreach 邮件（技术招聘场景）。
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
            '你是资深技术招聘顾问，帮助 HR 给开发者写首封沟通邮件。只输出合法 JSON 对象，键为 subject 与 body，字符串内使用 \\n 表示换行。',
        },
        { role: 'user', content: user },
      ],
      temperature: 0.55,
      max_tokens: 2500,
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

  return { subject, body };
}
