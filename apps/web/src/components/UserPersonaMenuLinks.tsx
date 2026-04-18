'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { PrimaryPersona } from '@/contexts/PrimaryPersonaContext';

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
  setPersona: (p: 'developer' | 'recruiter') => void;
  user: MenuUser;
};

/**
 * 登录后用户菜单：与首页身份一致；求职者不展示招聘管理，招聘方不展示我的画像。
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
  const chooseHome = (
    <Link key="choose" href="/" className={linkRow}>
      🏠 {t('nav.choosePersonaHome')}
    </Link>
  );

  let ordered: ReactNode[];
  let badge: string;
  if (persona === 'recruiter') {
    ordered = [recruitment, messages, jobPlaza];
    badge = t('nav.personaRecruiterBadge');
  } else if (persona === 'developer') {
    ordered = [profile, messages, jobPlaza];
    badge = t('nav.personaDeveloperBadge');
  } else {
    ordered = [chooseHome, jobPlaza, messages];
    badge = t('nav.personaUnsetBadge');
  }

  return (
    <>
      <div className="border-b border-white/10 px-4 py-2 text-[11px] leading-snug text-slate-500">{badge}</div>
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
