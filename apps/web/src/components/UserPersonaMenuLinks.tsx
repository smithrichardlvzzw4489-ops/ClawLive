'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePrimaryPersona, type PrimaryPersona } from '@/contexts/PrimaryPersonaContext';

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
  user: MenuUser;
};

/**
 * 登录后用户菜单：招聘广场在顶栏；此处仅角色相关入口（顶栏不重复招聘广场）。
 */
export function UserPersonaMenuLinks({ t, persona, user }: Props) {
  const router = useRouter();
  const { clearPersona } = usePrimaryPersona();

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
  const chooseHome = (
    <Link key="choose" href="/" className={linkRow}>
      🏠 {t('nav.choosePersonaHome')}
    </Link>
  );

  const ordered =
    persona === 'recruiter'
      ? [recruitment, messages]
      : persona === 'developer'
        ? [profile, messages]
        : [chooseHome, messages];

  return (
    <>
      <div className="divide-y divide-white/10">{ordered}</div>
      {user.isAdmin && (
        <Link
          href="/admin/users"
          className="block border-t border-white/10 px-4 py-3 text-slate-300 hover:bg-white/[0.06] hover:text-violet-300"
        >
          📊 用户与使用统计
        </Link>
      )}
      {(persona === 'developer' || persona === 'recruiter') && (
        <button
          type="button"
          onClick={() => {
            clearPersona();
            router.push('/');
          }}
          className="block w-full border-t border-white/10 px-4 py-2.5 text-left text-xs text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
        >
          {t('nav.switchPersona')}
        </button>
      )}
    </>
  );
}
