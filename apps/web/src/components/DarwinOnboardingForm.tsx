'use client';

import { useCallback, useState } from 'react';
import type { DarwinOnboardingAnswers } from '@clawlive/shared-types';

const Q1_OPTIONS: { value: DarwinOnboardingAnswers['q1']; label: string }[] = [
  { value: 'A', label: '在校学生' },
  { value: 'B', label: '企业 / 机构职员' },
  { value: 'C', label: '自由职业 / 独立创作者' },
  { value: 'D', label: '开发者 / 技术相关岗位' },
  { value: 'E', label: '其他' },
];

const Q2_OPTIONS: { value: DarwinOnboardingAnswers['q2']; label: string }[] = [
  { value: 'A', label: '学习与理解（课程、概念、读书笔记）' },
  { value: 'B', label: '写作与内容（文章、脚本、运营文案）' },
  { value: 'C', label: '工作与效率（邮件、总结、流程整理）' },
  { value: 'D', label: '编程与自动化（脚本、工具、对接 API）' },
  { value: 'E', label: '检索与研究（资料搜集、对比、综述）' },
];

const Q3_OPTIONS: { value: DarwinOnboardingAnswers['q3']; label: string }[] = [
  { value: 'A', label: '几乎没用过，希望尽量「说人话」就能用' },
  { value: 'B', label: '会用基础提示词，偶尔试复杂任务' },
  { value: 'C', label: '经常写提示词或小脚本，愿意折腾' },
  { value: 'D', label: '能独立接 API / 写集成，需要高阶能力' },
];

const Q4_OPTIONS: { value: DarwinOnboardingAnswers['q4']; label: string }[] = [
  { value: 'A', label: '多讨论、多轮对齐后再产出' },
  { value: 'B', label: '分工明确，各自交付再合并' },
  { value: 'C', label: '尽量少协作，只要最终结果' },
  { value: 'D', label: '还不确定，想先体验一下' },
];

const Q5_OPTIONS: { value: DarwinOnboardingAnswers['q5']; label: string }[] = [
  { value: 'A', label: '少于 1 小时' },
  { value: 'B', label: '约 1～3 小时' },
  { value: 'C', label: '约 3～10 小时' },
  { value: 'D', label: '通常超过 10 小时' },
];

function RadioBlock<K extends string>({
  title,
  name,
  options,
  value,
  onChange,
}: {
  title: string;
  name: string;
  options: { value: K; label: string }[];
  value: K | '';
  onChange: (v: K) => void;
}) {
  return (
    <fieldset className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-left ring-1 ring-white/[0.04]">
      <legend className="px-1 text-sm font-semibold text-slate-200">{title}</legend>
      <div className="mt-3 space-y-2.5">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-300 transition hover:bg-white/[0.04]"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="mt-0.5 border-slate-500 text-lobster focus:ring-lobster/40"
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type Props = {
  onSubmit: (answers: DarwinOnboardingAnswers) => void | Promise<void>;
  submitting?: boolean;
  serverError?: string;
};

export function DarwinOnboardingForm({ onSubmit, submitting, serverError }: Props) {
  const [q1, setQ1] = useState<DarwinOnboardingAnswers['q1'] | ''>('');
  const [q2, setQ2] = useState<DarwinOnboardingAnswers['q2'] | ''>('');
  const [q3, setQ3] = useState<DarwinOnboardingAnswers['q3'] | ''>('');
  const [q4, setQ4] = useState<DarwinOnboardingAnswers['q4'] | ''>('');
  const [q5, setQ5] = useState<DarwinOnboardingAnswers['q5'] | ''>('');
  const [q6, setQ6] = useState('');
  const [localError, setLocalError] = useState('');

  const validate = useCallback((): DarwinOnboardingAnswers | null => {
    if (!q1 || !q2 || !q3 || !q4 || !q5) {
      setLocalError('请完成全部选择题');
      return null;
    }
    const t = q6.trim();
    if (t.length < 10) {
      setLocalError('第 6 题请至少填写 10 个字');
      return null;
    }
    if (t.length > 500) {
      setLocalError('第 6 题请控制在 500 字以内');
      return null;
    }
    setLocalError('');
    return { q1, q2, q3, q4, q5, q6: t };
  }, [q1, q2, q3, q4, q5, q6]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const answers = validate();
    if (!answers) return;
    await onSubmit(answers);
  };

  const err = serverError || localError;

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl space-y-5 text-left">
      <p className="text-sm leading-relaxed text-slate-400">
        申请 DarwinClaw 前请先完成以下 6 题（5 道单选 + 1 道填空），用于生成你的用户画像并支持进化网络推荐。
      </p>

      <RadioBlock
        title="1. 你当前主要身份更接近哪一类？"
        name="darwin-q1"
        options={Q1_OPTIONS}
        value={q1}
        onChange={setQ1}
      />
      <RadioBlock
        title="2. 申请 DarwinClaw 后，最想优先解决哪一类需求？"
        name="darwin-q2"
        options={Q2_OPTIONS}
        value={q2}
        onChange={setQ2}
      />
      <RadioBlock
        title="3. 你对提示词、插件/API、自己写脚本的熟悉程度？"
        name="darwin-q3"
        options={Q3_OPTIONS}
        value={q3}
        onChange={setQ3}
      />
      <RadioBlock
        title="4. 在「进化网络」里，你更倾向哪种协作方式？"
        name="darwin-q4"
        options={Q4_OPTIONS}
        value={q4}
        onChange={setQ4}
      />
      <RadioBlock
        title="5. 你预计每周能投入在 ClawLab / Darwin 上的时间？"
        name="darwin-q5"
        options={Q5_OPTIONS}
        value={q5}
        onChange={setQ5}
      />

      <fieldset className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 ring-1 ring-white/[0.04]">
        <legend className="px-1 text-sm font-semibold text-slate-200">
          6. 请用一句话具体写出：未来 3 个月内，你最希望自己在哪方面明显「进化」？（10～500 字）
        </legend>
        <textarea
          value={q6}
          onChange={(e) => {
            setLocalError('');
            setQ6(e.target.value);
          }}
          rows={5}
          placeholder="例如：能独立用 AI 写完周报并沉淀成模板；或能做出一个小工具自动处理重复工作。"
          className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-lobster/40 focus:outline-none focus:ring-1 focus:ring-lobster/30"
        />
      </fieldset>

      {err ? <p className="text-sm text-red-400/90">{err}</p> : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-2xl bg-lobster py-3.5 text-base font-semibold text-white transition hover:bg-lobster-dark disabled:opacity-60 glow-lobster"
      >
        {submitting ? '提交中...' : '提交问卷并申请 DarwinClaw'}
      </button>
    </form>
  );
}
