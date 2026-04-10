'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, APIError } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { MainLayout } from '@/components/MainLayout';

type BehaviorBreakdown = { total: number; byType: Record<string, number> };

type OverviewUser = {
  id: string;
  username: string;
  email: string | null;
  isAdmin: boolean;
  clawPoints: number;
  createdAt: string;
  updatedAt: string;
  usage: {
    roomsHosted: number;
    feedPosts: number;
    publishedSkills: number;
    vibekidsWorks: number;
    installedDarwinSkills: number;
    evolverRounds: number;
    comments: number;
    pointLedgerEntries: number;
    darwin: { lobsterMessages: number; lastActiveAt: string } | null;
    githubLinked: boolean;
    codernetCrawledAt: string | null;
    humanBehaviors: BehaviorBreakdown;
    agentBehaviors: BehaviorBreakdown;
  };
};

export default function AdminUsersPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<{ totalUsers: number; users: OverviewUser[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login?redirect=/admin/users');
      return;
    }
    if (!user.isAdmin) {
      setError('无管理员权限');
      setLoading(false);
      return;
    }
    api.admin
      .usersOverview()
      .then(setData)
      .catch((e: unknown) => {
        const msg = e instanceof APIError ? e.message : '加载失败';
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [authLoading, user, router]);

  if (authLoading || loading) {
    return (
      <MainLayout flatBackground>
        <div className="mx-auto max-w-6xl px-4 py-16 text-center text-slate-400">加载中…</div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout flatBackground>
        <div className="mx-auto max-w-6xl px-4 py-16">
          <p className="text-amber-400">{error}</p>
          <Link href="/" className="mt-4 inline-block text-violet-400 hover:underline">
            返回首页
          </Link>
        </div>
      </MainLayout>
    );
  }

  if (!data) return null;

  return (
    <MainLayout flatBackground>
    <div className="mx-auto max-w-[110rem] px-3 py-8 sm:px-4 lg:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white sm:text-2xl">用户与使用情况</h1>
          <p className="mt-1 text-sm text-slate-400">
            当前注册用户：<span className="font-mono text-cyan-400">{data.totalUsers}</span>
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.06]"
        >
          返回首页
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/[0.08] glass">
        <table className="w-full min-w-[960px] border-collapse text-left text-sm text-slate-300">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-3 font-medium">用户</th>
              <th className="px-3 py-3 font-medium">注册</th>
              <th className="px-3 py-3 font-medium">虾米积分</th>
              <th className="px-3 py-3 font-medium">直播/帖/技能/作品</th>
              <th className="px-3 py-3 font-medium">Darwin</th>
              <th className="px-3 py-3 font-medium">GitHub/Codenet</th>
              <th className="px-3 py-3 font-medium">行为（人轨）</th>
              <th className="px-3 py-3 font-medium">行为（虾米轨）</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.id} className="border-b border-white/[0.06] hover:bg-white/[0.03]">
                <td className="px-3 py-3 align-top">
                  <div className="font-medium text-white">{u.username}</div>
                  {u.isAdmin && (
                    <span className="mt-0.5 inline-block rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-300">
                      admin
                    </span>
                  )}
                  {u.email && <div className="mt-1 text-xs text-slate-500">{u.email}</div>}
                </td>
                <td className="px-3 py-3 align-top font-mono text-xs text-slate-500">
                  {u.createdAt.slice(0, 10)}
                </td>
                <td className="px-3 py-3 align-top font-mono">{u.clawPoints}</td>
                <td className="px-3 py-3 align-top text-xs leading-relaxed">
                  直播 {u.usage.roomsHosted} · 帖 {u.usage.feedPosts} · 发布技能 {u.usage.publishedSkills} ·
                  VibeKids {u.usage.vibekidsWorks}
                  <br />
                  安装技能 {u.usage.installedDarwinSkills} · 进化轮 {u.usage.evolverRounds} · 评论{' '}
                  {u.usage.comments} · 积分流水 {u.usage.pointLedgerEntries}
                </td>
                <td className="px-3 py-3 align-top text-xs">
                  {u.usage.darwin ? (
                    <>
                      消息 {u.usage.darwin.lobsterMessages}
                      <br />
                      <span className="text-slate-500">
                        活跃 {u.usage.darwin.lastActiveAt.slice(0, 16).replace('T', ' ')}
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className="px-3 py-3 align-top text-xs">
                  GitHub {u.usage.githubLinked ? '已绑' : '—'}
                  <br />
                  Codenet 爬取 {u.usage.codernetCrawledAt ? u.usage.codernetCrawledAt.slice(0, 10) : '—'}
                </td>
                <td className="px-3 py-3 align-top font-mono text-xs text-slate-400">
                  共 {u.usage.humanBehaviors.total}
                  <br />
                  {Object.entries(u.usage.humanBehaviors.byType)
                    .map(([k, v]) => `${k}:${v}`)
                    .join(' ')}
                </td>
                <td className="px-3 py-3 align-top font-mono text-xs text-slate-400">
                  共 {u.usage.agentBehaviors.total}
                  <br />
                  {Object.entries(u.usage.agentBehaviors.byType)
                    .map(([k, v]) => `${k}:${v}`)
                    .join(' ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        人轨行为来自推荐用隐式反馈（浏览/进房等）；虾米轨来自 Darwin 侧技能安装与引用等。单机文件存储，与数据库用户 id 对齐。
      </p>
    </div>
    </MainLayout>
  );
}
