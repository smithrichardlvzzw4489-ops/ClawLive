/**
 * JD ×（简历 + GitHub 画像）结构化匹配：LLM 输出各 JD 维度得分与综合分。
 */

import { getPublishingLlmClient, trackedChatCompletion } from './llm';

export type JdItemMatch = {
  id: string;
  title: string;
  matchScore: number;
  rationale: string;
  gap?: string;
};

export type JdResumeMatchResult = {
  jdItemMatches: JdItemMatch[];
  overallMatch: number;
  executiveSummary: string;
  notes?: string;
};

function stripFence(text: string): string {
  let s = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```/im.exec(s);
  if (fence) s = fence[1].trim();
  return s;
}

function clampScore(n: unknown): number {
  const x = typeof n === 'number' ? n : parseFloat(String(n));
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function normalizeResult(raw: unknown): JdResumeMatchResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const itemsRaw = o.jdItemMatches ?? o.items;
  if (!Array.isArray(itemsRaw)) return null;
  const jdItemMatches: JdItemMatch[] = [];
  for (let i = 0; i < itemsRaw.length; i++) {
    const row = itemsRaw[i];
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const title = String(r.title ?? r.requirement ?? r.name ?? `要求 ${i + 1}`).slice(0, 200);
    if (!title.trim()) continue;
    const id = String(r.id ?? String(i + 1)).slice(0, 32);
    const item: JdItemMatch = {
      id,
      title,
      matchScore: clampScore(r.matchScore ?? r.score),
      rationale: String(r.rationale ?? r.evidence ?? '').slice(0, 800),
    };
    if (r.gap != null && String(r.gap).trim()) {
      item.gap = String(r.gap).slice(0, 400);
    }
    jdItemMatches.push(item);
  }

  if (jdItemMatches.length === 0) return null;

  return {
    jdItemMatches,
    overallMatch: clampScore(o.overallMatch ?? o.overallScore),
    executiveSummary: String(o.executiveSummary ?? o.summary ?? '').slice(0, 2500),
    notes: o.notes != null ? String(o.notes).slice(0, 1200) : undefined,
  };
}

const MAX_JD = 28_000;
const MAX_RESUME = 18_000;
const MAX_GH = 14_000;

export async function runJdResumeMatchAnalysis(opts: {
  jdText: string;
  resumeText: string;
  githubPortraitSummary: string;
}): Promise<JdResumeMatchResult> {
  const jd = opts.jdText.replace(/\s+/g, ' ').trim().slice(0, MAX_JD);
  const resume = opts.resumeText.replace(/\s+/g, ' ').trim().slice(0, MAX_RESUME);
  const gh = opts.githubPortraitSummary.trim().slice(0, MAX_GH);

  if (!jd) {
    throw new Error('JD 正文为空');
  }
  if (!resume && !gh) {
    throw new Error('请至少提供简历正文或 GitHub 画像其一');
  }

  const system = `你是资深技术招聘与人才评估顾问。根据「职位 JD」与「候选人材料（简历正文 + 可选的 GitHub/GITLINK 技术画像摘要）」做结构化匹配评估。
规则：
1. 将 JD 拆成若干可评估的条目（如：学历、年限、技术栈、框架、云与基础设施、软技能、语言、地点/到岗等），条目数建议在 8～22 之间，覆盖 JD 中明确要求与强暗示要求。
2. 每个条目给出 matchScore：0-100 的整数，100 为完全满足；并给出简短中文 rationale（依据是什么）；若有明显缺口写 gap（一句中文），否则可省略 gap。
3. overallMatch：0-100 整数，表示人岗综合匹配度（权重上核心技术要求高于次要加分项）。
4. executiveSummary：3～6 句中文，总结匹配亮点与主要风险。
5. 必须只输出一个 JSON 对象，键名严格为：jdItemMatches, overallMatch, executiveSummary, notes（notes 可简短说明评估局限，可为空字符串）。
jdItemMatches 为数组，元素字段：id, title, matchScore, rationale, gap（gap 可选）。`;

  const user = `【职位 JD】\n${jd}\n\n【候选人简历（用户填写/上传）】\n${resume || '（未提供）'}\n\n【GitHub / GITLINK 技术画像摘要】\n${gh || '（未提供）'}`;

  const { client, model } = getPublishingLlmClient();

  let rawText = '';
  try {
    const resp = await trackedChatCompletion(
      {
        model,
        max_tokens: 5000,
        temperature: 0.25,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
      },
      'jd_resume_match',
      {},
      client,
    );
    rawText = resp.choices[0]?.message?.content?.trim() || '';
  } catch (e) {
    console.warn('[jd-resume-match] json_object failed, retry without', e);
    const resp = await trackedChatCompletion(
      {
        model,
        max_tokens: 5000,
        temperature: 0.25,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      'jd_resume_match',
      {},
      client,
    );
    rawText = resp.choices[0]?.message?.content?.trim() || '';
  }

  const cleaned = stripFence(rawText);
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) {
    throw new Error('模型未返回可解析的 JSON');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[0]) as unknown;
  } catch {
    throw new Error('JSON 解析失败');
  }
  const normalized = normalizeResult(parsed);
  if (!normalized) {
    throw new Error('匹配结果结构无效');
  }
  return normalized;
}
