/**
 * 进化点技能验收：生成测试用例（结构化检查）、在 Python 沙盒中执行、通过后允许闭环并安装技能。
 */
import { randomUUID } from 'crypto';
import { executeCode } from './code-executor';
import { generateEvolutionAcceptanceCases } from './llm';
import { installSkillForUser } from './lobster-user-skills';
import type { EvolutionAcceptanceState, EvolutionLinkedSkill, EvolutionPointRecord } from './evolution-network-service';
import { getPoint, upsertEvolutionPointRecord } from './evolution-network-service';

export type AcceptanceCheck =
  | { type: 'contains'; substring: string }
  | { type: 'min_length'; n: number };

function normalizeChecks(raw: unknown): AcceptanceCheck[] {
  if (!Array.isArray(raw)) return [];
  const out: AcceptanceCheck[] = [];
  for (const ch of raw) {
    if (!ch || typeof ch !== 'object') continue;
    const o = ch as Record<string, unknown>;
    if (o.type === 'contains' && typeof o.substring === 'string' && o.substring.length > 0) {
      out.push({ type: 'contains', substring: o.substring.slice(0, 500) });
    }
    if (o.type === 'min_length' && typeof o.n === 'number' && o.n > 0) {
      out.push({ type: 'min_length', n: Math.min(50000, Math.floor(o.n)) });
    }
  }
  return out;
}

export type AcceptanceCaseDef = {
  id: string;
  skillId: string;
  name: string;
  checks: AcceptanceCheck[];
};

function buildPythonForSkill(skillMarkdown: string, checks: AcceptanceCheck[]): string {
  const md = JSON.stringify(skillMarkdown.slice(0, 20000));
  const lines: string[] = ['MD = ' + md, 'assert len(MD) >= 8'];
  for (const ch of checks) {
    if (ch.type === 'contains') {
      lines.push(`assert ${JSON.stringify(ch.substring)} in MD`);
    } else if (ch.type === 'min_length') {
      lines.push(`assert len(MD) >= ${ch.n}`);
    }
  }
  lines.push("print('acceptance_ok')");
  return lines.join('\n');
}

function defaultCases(skills: EvolutionLinkedSkill[]): AcceptanceCaseDef[] {
  const out: AcceptanceCaseDef[] = [];
  for (const s of skills) {
    out.push({
      id: `case-${s.id}-structure`,
      skillId: s.id,
      name: `「${s.title}」文档结构检查`,
      checks: [
        { type: 'min_length', n: 30 },
        { type: 'contains', substring: '---' },
      ],
    });
  }
  return out;
}

/** 生成测试用例并写入进化点（仅发起者） */
export async function generateAcceptanceCasesForPoint(
  pointId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = getPoint(pointId);
  if (!p) return { ok: false, error: '进化点不存在' };
  if (p.authorUserId !== userId) return { ok: false, error: '仅发起者可生成验收用例' };
  if (p.status === 'ended') return { ok: false, error: '已结束' };
  const skills = p.linkedSkills ?? [];
  if (skills.length === 0) return { ok: false, error: '请先关联至少一个技能包（linkedSkills）' };

  let cases: AcceptanceCaseDef[] = [];
  try {
    const gen = await generateEvolutionAcceptanceCases({
      title: p.title,
      goal: p.goal,
      skills: skills.map((s) => ({
        id: s.id,
        title: s.title,
        skillMarkdown: s.skillMarkdown,
      })),
    });
    if (gen?.cases?.length) {
      cases = gen.cases
        .map((c, i) => {
          const checks = normalizeChecks(c.checks as unknown);
          if (!checks.length) return null;
          return {
            id: c.id || `gen-${i}`,
            skillId: c.skillId,
            name: c.name || `用例 ${i + 1}`,
            checks,
          };
        })
        .filter((x): x is AcceptanceCaseDef => x != null);
    }
  } catch (e) {
    console.warn('[EvolutionAcceptance] LLM generate failed', e);
  }
  if (!cases.length) {
    cases = defaultCases(skills);
  }

  const next: EvolutionAcceptanceState = {
    status: 'pending',
    generatedAt: new Date().toISOString(),
    cases,
    lastResults: undefined,
  };
  const updated: EvolutionPointRecord = {
    ...p,
    acceptanceJson: next,
    updatedAt: new Date().toISOString(),
  };
  await upsertEvolutionPointRecord(updated);
  return { ok: true };
}

/** 执行验收测试（仅发起者） */
export async function runAcceptanceTestsForPoint(
  pointId: string,
  userId: string,
): Promise<
  | { ok: true; passed: boolean; results: NonNullable<EvolutionAcceptanceState['lastResults']> }
  | { ok: false; error: string }
> {
  const p = getPoint(pointId);
  if (!p) return { ok: false, error: '进化点不存在' };
  if (p.authorUserId !== userId) return { ok: false, error: '仅发起者可运行验收' };
  if (p.status === 'ended') return { ok: false, error: '已结束' };
  const skills = p.linkedSkills ?? [];
  if (skills.length === 0) return { ok: false, error: '未关联技能' };

  let cases = p.acceptanceJson?.cases;
  if (!cases?.length) {
    const gen = await generateAcceptanceCasesForPoint(pointId, userId);
    if (!gen.ok) return { ok: false, error: gen.error };
    const p2 = getPoint(pointId);
    cases = p2?.acceptanceJson?.cases;
  }
  if (!cases?.length) return { ok: false, error: '无可用测试用例，请先生成' };

  const skillById = new Map(skills.map((s) => [s.id, s]));
  const results: NonNullable<EvolutionAcceptanceState['lastResults']> = [];

  for (const c of cases) {
    const skill = skillById.get(c.skillId);
    if (!skill) {
      results.push({
        caseId: c.id,
        ok: false,
        stderr: `找不到 skillId=${c.skillId}`,
      });
      continue;
    }
    const checks = normalizeChecks(c.checks as unknown);
    if (!checks.length) {
      results.push({ caseId: c.id, ok: false, stderr: '无有效检查项' });
      continue;
    }
    const code = buildPythonForSkill(skill.skillMarkdown, checks);
    const exec = await executeCode('python', code);
    const ok =
      exec.exitCode === 0 &&
      Boolean(exec.stdout?.includes('acceptance_ok')) &&
      !(exec.stderr || '').includes('AssertionError');
    results.push({
      caseId: c.id,
      ok,
      stdout: exec.stdout?.slice(0, 2000),
      stderr: exec.stderr?.slice(0, 1500),
    });
  }

  const passed = results.length > 0 && results.every((r: { ok: boolean }) => r.ok);
  const pLatest = getPoint(pointId);
  if (!pLatest) return { ok: false, error: '进化点不存在' };

  const prev = pLatest.acceptanceJson ?? { status: 'pending' as const };
  const nextState: EvolutionAcceptanceState = {
    ...prev,
    status: passed ? 'passed' : 'failed',
    lastRunAt: new Date().toISOString(),
    lastResults: results,
  };

  const updated: EvolutionPointRecord = {
    ...pLatest,
    acceptanceJson: nextState,
    updatedAt: new Date().toISOString(),
  };
  await upsertEvolutionPointRecord(updated);

  return { ok: true, passed, results };
}

/** 闭环完成后将关联技能安装到发起者 Darwin（幂等：同 skillId 会 upsert） */
export async function installLinkedSkillsForAuthor(pointId: string): Promise<{ installed: number }> {
  const p = getPoint(pointId);
  if (!p) return { installed: 0 };
  if (p.status !== 'ended' || p.endReason !== 'completed') return { installed: 0 };
  const skills = p.linkedSkills ?? [];
  if (skills.length === 0) return { installed: 0 };

  let n = 0;
  for (const s of skills) {
    const skillId = `evo-point-${pointId}-${s.id}`.slice(0, 120);
    try {
      await installSkillForUser(p.authorUserId, {
        skillId,
        title: String(s.title ?? 'Skill').slice(0, 200),
        description: `来自进化点闭环：${p.title}`.slice(0, 500),
        skillMarkdown: s.skillMarkdown,
        source: 'web-learned',
      });
      n += 1;
    } catch (e) {
      console.error('[EvolutionAcceptance] install skill failed', pointId, skillId, e);
    }
  }
  return { installed: n };
}
