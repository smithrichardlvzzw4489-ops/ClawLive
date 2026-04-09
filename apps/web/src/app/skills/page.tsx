'use client';

import { useCallback, useEffect, useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

type PublishedSkill = {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  creditCostPerCall: number;
  platformFeeRate: number;
  installCount: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
  skillMarkdown?: string;
  author?: { id: string; username: string; avatarUrl: string | null };
};

type Tab = 'market' | 'my' | 'publish';

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  pending: { text: '审核中', color: 'bg-yellow-100 text-yellow-700' },
  approved: { text: '已上架', color: 'bg-green-100 text-green-700' },
  rejected: { text: '已拒绝', color: 'bg-red-100 text-red-700' },
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SkillsPage() {
  const { isAuthenticated } = useAuth();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const [tab, setTab] = useState<Tab>('market');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'my' || t === 'publish' || t === 'market') setTab(t);
  }, []);

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">🧩 Skills 市场</h1>
          <p className="mt-1 text-sm text-gray-500">
            平台官方技能 + 用户创作的付费技能，GITLINK 通过积分调用
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-xl bg-gray-100 p-1">
          {([
            { key: 'market', label: '📦 技能广场' },
            { key: 'my', label: '📋 我发布的' },
            { key: 'publish', label: '➕ 发布技能' },
          ] as { key: Tab; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                tab === key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Panels */}
        {tab === 'market' && <MarketPanel />}
        {tab === 'my' && <MySkillsPanel token={token} />}
        {tab === 'publish' && <PublishPanel token={token} onSuccess={() => setTab('my')} />}
      </div>
    </MainLayout>
  );
}

// ─── Market Panel ─────────────────────────────────────────────────────────────

function MarketPanel() {
  const [skills, setSkills] = useState<PublishedSkill[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<PublishedSkill | null>(null);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const res = await api.publishedSkills.list({ q: query || undefined });
      setSkills((res as { items: PublishedSkill[]; total: number }).items);
      setTotal((res as { items: PublishedSkill[]; total: number }).total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(search); }, [search, load]);

  return (
    <div>
      {/* Search */}
      <div className="mb-4 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setSearch(q)}
          placeholder="搜索技能名称或描述…"
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
        />
        <button
          onClick={() => setSearch(q)}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          搜索
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-gray-400">加载中…</div>
      ) : skills.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          {search ? `未找到与"${search}"相关的技能` : '暂无已上架技能'}
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-gray-400">共 {total} 个技能</p>
          <div className="space-y-3">
            {skills.map((s) => (
              <SkillCard key={s.id} skill={s} onView={() => setDetail(s)} />
            ))}
          </div>
        </>
      )}

      {/* Detail Modal */}
      {detail && (
        <SkillDetailModal skill={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

// ─── My Skills Panel ──────────────────────────────────────────────────────────

function MySkillsPanel({ token }: { token: string | null }) {
  const [skills, setSkills] = useState<PublishedSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<PublishedSkill | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.publishedSkills.my();
      setSkills((res as { items: PublishedSkill[] }).items);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (!token) {
    return <div className="py-16 text-center text-gray-400">请先登录</div>;
  }

  return (
    <div>
      {loading ? (
        <div className="py-16 text-center text-gray-400">加载中…</div>
      ) : skills.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          你还没有发布任何技能
        </div>
      ) : (
        <div className="space-y-3">
          {skills.map((s) => (
            <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{s.title}</span>
                    {STATUS_LABEL[s.status] && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_LABEL[s.status].color}`}>
                        {STATUS_LABEL[s.status].text}
                      </span>
                    )}
                  </div>
                  {s.description && (
                    <p className="mt-1 text-sm text-gray-500">{s.description}</p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                    <span>💎 {s.creditCostPerCall} 积分/次</span>
                    <span>📥 {s.installCount} 次安装</span>
                    <span>{new Date(s.createdAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                </div>
                <button
                  onClick={() => setDetail(s)}
                  className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                >
                  查看详情
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <SkillDetailModal skill={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

// ─── Publish Panel ────────────────────────────────────────────────────────────

function PublishPanel({ token, onSuccess }: { token: string | null; onSuccess: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [skillMarkdown, setSkillMarkdown] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [creditCost, setCreditCost] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!token) {
    return <div className="py-16 text-center text-gray-400">请先登录后再发布技能</div>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('请填写技能名称'); return; }
    if (!skillMarkdown.trim()) { setError('请填写技能内容'); return; }
    setError('');
    setSubmitting(true);
    try {
      const tags = tagsInput
        .split(/[,，\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      await api.publishedSkills.publish({
        title: title.trim(),
        description: description.trim() || undefined,
        skillMarkdown: skillMarkdown.trim(),
        tags,
        creditCostPerCall: creditCost,
      });
      setSuccess(true);
      setTimeout(() => { setSuccess(false); onSuccess(); }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '发布失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl border border-orange-100 bg-orange-50 p-4 text-sm text-orange-700">
        <strong>📌 发布须知</strong>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          <li>你的技能需要通过平台审核后才能上架</li>
          <li>用户每次调用你的技能消耗的积分，平台抽成 30%，其余结算给你</li>
          <li>技能内容用 Markdown 格式编写，包含使用场景、执行步骤和注意事项</li>
        </ul>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">技能名称 *</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：SEO文章优化助手"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">简短描述</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="一句话说明这个技能能做什么"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">标签（逗号分隔）</label>
        <input
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="例如：写作, SEO, 营销"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          每次调用积分 <span className="text-gray-400 font-normal">（建议 5–100，0 = 免费）</span>
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={200}
            value={creditCost}
            onChange={(e) => setCreditCost(Number(e.target.value))}
            className="flex-1 accent-orange-500"
          />
          <span className="w-16 text-right text-sm font-semibold text-orange-600">
            {creditCost} 积分
          </span>
        </div>
        {creditCost > 0 && (
          <p className="mt-1 text-xs text-gray-400">
            平台抽成 30%，你每次获得约{' '}
            <strong className="text-gray-600">{Math.floor(creditCost * 0.7)} 积分</strong>
          </p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          技能内容 * <span className="text-gray-400 font-normal">（Markdown 格式）</span>
        </label>
        <textarea
          value={skillMarkdown}
          onChange={(e) => setSkillMarkdown(e.target.value)}
          rows={14}
          placeholder={`# 技能名称\n\n## 适用场景\n描述这个技能解决什么问题\n\n## 执行步骤\n1. 第一步\n2. 第二步\n\n## 注意事项\n- 注意点一`}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm outline-none focus:border-orange-400"
        />
        <p className="mt-1 text-right text-xs text-gray-400">
          {skillMarkdown.length} / 20000
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}
      {success && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-600">
          ✅ 技能已提交审核，审核通过后自动上架！
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {submitting ? '提交中…' : '提交审核'}
      </button>
    </form>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────────

function SkillCard({
  skill,
  onView,
}: {
  skill: PublishedSkill;
  onView: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">{skill.title}</span>
            {skill.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                {tag}
              </span>
            ))}
          </div>
          {skill.description && (
            <p className="mt-1 text-sm text-gray-500 line-clamp-2">{skill.description}</p>
          )}
          <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
            <span className="font-medium text-orange-500">
              💎 {skill.creditCostPerCall === 0 ? '免费' : `${skill.creditCostPerCall} 积分/次`}
            </span>
            <span>📥 {skill.installCount} 人安装</span>
            {skill.author && <span>👤 {skill.author.username}</span>}
          </div>
        </div>
        <button
          onClick={onView}
          className="shrink-0 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600"
        >
          查看
        </button>
      </div>
    </div>
  );
}

function SkillDetailModal({
  skill,
  onClose,
}: {
  skill: PublishedSkill;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>

        <h2 className="pr-8 text-xl font-bold text-gray-900">{skill.title}</h2>

        <div className="mt-2 flex flex-wrap gap-2">
          {skill.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              {tag}
            </span>
          ))}
        </div>

        {skill.description && (
          <p className="mt-3 text-sm text-gray-500">{skill.description}</p>
        )}

        <div className="mt-3 flex items-center gap-4 text-sm">
          <span className="font-semibold text-orange-500">
            💎 {skill.creditCostPerCall === 0 ? '免费' : `${skill.creditCostPerCall} 积分/次`}
          </span>
          <span className="text-gray-400">📥 {skill.installCount} 次安装</span>
          {skill.author && (
            <span className="text-gray-400">👤 {skill.author.username}</span>
          )}
        </div>

        {skill.skillMarkdown && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">技能内容</h3>
            <pre className="overflow-x-auto rounded-xl bg-gray-50 p-4 text-xs leading-relaxed text-gray-700 whitespace-pre-wrap">
              {skill.skillMarkdown}
            </pre>
          </div>
        )}

        <p className="mt-4 text-xs text-gray-400">
          在 GITLINK 对话框中说&ldquo;帮我安装技能 {skill.id}&rdquo;，GITLINK 会自动安装并使用此技能。
        </p>
      </div>
    </div>
  );
}
