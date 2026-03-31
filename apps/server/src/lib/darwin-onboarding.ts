import type { DarwinOnboardingAnswers, DarwinOnboardingStored } from '@clawlive/shared-types';

const Q5 = new Set(['A', 'B', 'C', 'D', 'E']);
const Q4 = new Set(['A', 'B', 'C', 'D']);

const CURRENT_VERSION = 1;

function isStr(v: unknown): v is string {
  return typeof v === 'string';
}

/**
 * 校验首次申请 Darwin 时提交的问卷；通过则返回带版本号的存储结构。
 */
export function validateDarwinOnboarding(
  input: unknown
): { ok: true; value: DarwinOnboardingStored } | { ok: false; error: string } {
  if (input == null || typeof input !== 'object') {
    return { ok: false, error: '请提交完整的 Darwin 问卷' };
  }
  const o = input as Record<string, unknown>;
  const q1 = o.q1;
  const q2 = o.q2;
  const q3 = o.q3;
  const q4 = o.q4;
  const q5 = o.q5;
  const q6 = o.q6;

  if (!isStr(q1) || !Q5.has(q1)) return { ok: false, error: '第 1 题请选择有效选项' };
  if (!isStr(q2) || !Q5.has(q2)) return { ok: false, error: '第 2 题请选择有效选项' };
  if (!isStr(q3) || !Q4.has(q3)) return { ok: false, error: '第 3 题请选择有效选项' };
  if (!isStr(q4) || !Q4.has(q4)) return { ok: false, error: '第 4 题请选择有效选项' };
  if (!isStr(q5) || !Q4.has(q5)) return { ok: false, error: '第 5 题请选择有效选项' };
  if (!isStr(q6)) return { ok: false, error: '第 6 题请填写内容' };
  const t = q6.trim();
  if (t.length < 10) return { ok: false, error: '第 6 题请至少填写 10 个字' };
  if (t.length > 500) return { ok: false, error: '第 6 题请控制在 500 字以内' };

  const answers: DarwinOnboardingAnswers = {
    q1,
    q2,
    q3,
    q4,
    q5,
    q6: t,
  } as DarwinOnboardingAnswers;

  return {
    ok: true,
    value: { ...answers, v: CURRENT_VERSION },
  };
}
