'use client';

import Link from 'next/link';
import type { PrimaryPersona } from '@/hooks/usePrimaryPersona';

type TFunc = (key: string, params?: Record<string, string>) => string;

type MenuUser = {
  isAdmin?: boolean;
};

const linkRow =
  'block px-4 py-3 text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-violet-300';
const linkRowProfile = `${linkRow} hover:text-lobster`;

type Props = {
  t: TFunc;
  persona: PrimaryPersona;
  setPersona: (p: PrimaryPersona) => void;
  user: MenuUser;
};

/**
 * 登录后用户菜单：按「求职者 / 招聘方」偏好排序（招聘广场一并放入菜单便于触达）。
 */
export function UserPersonaMenuLinks({ t, persona, setPersona, user }: Props) {
  const profile = (
    <Link key="profile" href="/my/profile" className={linkRowProfile}>
      🪪 {t('nav.myDeveloperCard')}
    </Link>
  );
  const recruitment = (
    <Link key="recruitment" href="/recruitment" className={linkRow}>
      📋 {t('nav.recruitment')}
    </Link>
  );
  const messages = (
    <Link key="messages" href="/messages" className={linkRow}>
      ✉️ {t('nav.siteMessages')}
    </Link>
  );
  const jobPlaza = (
    <Link key="jobPlaza" href="/job-plaza" className={linkRow}>
      🏢 {t('nav.jobPlaza')}
    </Link>
  );

  const ordered =
    persona === 'recruiter'
      ? [recruitment, messages, jobPlaza, profile]
      : [profile, messages, jobPlaza, recruitment];

  return (
    <>
      <div className="border-b border-white/10 px-4 py-2 text-[11px] leading-snug text-slate-500">
        {persona === 'recruiter' ? t('nav.personaRecruiterBadge') : t('nav.personaDeveloperBadge')}
      </div>
      <div className="divide-y divide-white/10">{ordered}</div>
      <div className="flex gap-1 border-t border-white/10 p-2">
        <button
          type="button"
          onClick={() => setPersona('developer')}
          className={`flex-1 rounded-lg px-2 py-1.5 text-center text-xs font-medium transition-colors ${
            persona === 'developer'
              ? 'bg-lobster/20 text-lobster ring-1 ring-inset ring-lobster/30'
              : 'text-slate-500 hover:bg-white/[0.06] hover:text-slate-300'
          }`}
        >
          {t('nav.personaSwitchDeveloper')}
        </button>
        <button
          type="button"
          onClick={() => setPersona('recruiter')}
          className={`flex-1 rounded-lg px-2 py-1.5 text-center text-xs font-medium transition-colors ${
            persona === 'recruiter'
              ? 'bg-violet-500/20 text-violet-200 ring-1 ring-inset ring-violet-400/30'
              : 'text-slate-500 hover:bg-white/[0.06] hover:text-slate-300'
          }`}
        >
          {t('nav.personaSwitchRecruiter')}
        </button>
      </div>
      {user.isAdmin && (
        <Link
          href="/admin/users"
          className="block border-t border-white/10 px-4 py-3 text-slate-300 hover:bg-white/[0.06] hover:text-violet-300"
        >
          📊 用户与使用统计
        </Link>
      )}
    </>
  );
}
