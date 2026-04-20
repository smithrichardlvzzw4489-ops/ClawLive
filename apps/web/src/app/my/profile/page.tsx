'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { CodernetCardPageClient } from '@/components/codernet/CodernetCardPageClient';
import { PersonalResumeSection } from '@/components/my/PersonalResumeSection';
import { RecruiterOutboundEmailSection } from '@/components/my/RecruiterOutboundEmailSection';
import { API_BASE_URL } from '@/lib/api';

/** 「我的」开发者名片：上方为自行维护的个人简历，下方为 GITLINK 技术画像（与公开 /codernet/card/:user 同源）。 */
export default function MyProfilePage() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [personalResume, setPersonalResume] = useState<string | null>(null);
  const [recruiterOutboundEmail, setRecruiterOutboundEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.replace('/login?redirect=/my/profile');
      return;
    }
    const base = API_BASE_URL || '';
    fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((u: { username?: string; personalResume?: string | null; recruiterOutboundEmail?: string | null } | null) => {
        if (u?.username) {
          setUsername(u.username);
          setPersonalResume(typeof u.personalResume === 'string' ? u.personalResume : null);
          setRecruiterOutboundEmail(
            typeof u.recruiterOutboundEmail === 'string' && u.recruiterOutboundEmail.trim()
              ? u.recruiterOutboundEmail.trim()
              : null,
          );
        } else router.replace('/login?redirect=/my/profile');
      })
      .catch(() => router.replace('/login?redirect=/my/profile'))
      .finally(() => setLoading(false));
  }, [router]);

  const handleResumeSaved = useCallback((text: string | null) => {
    setPersonalResume(text);
  }, []);

  if (loading || !username) {
    return (
      <MainLayout flatBackground>
        <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-[#06080f]">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout flatBackground>
      <div className="bg-[#06080f] px-4 pt-6 pb-2">
        <div className="mx-auto max-w-4xl">
          <PersonalResumeSection
            initialText={personalResume ?? ''}
            onSaved={handleResumeSaved}
          />
          <RecruiterOutboundEmailSection
            initialEmail={recruiterOutboundEmail}
            onSaved={(e) => setRecruiterOutboundEmail(e)}
            variant="dark"
          />
        </div>
      </div>
      <CodernetCardPageClient
        username={username}
        variant="mine"
        personalResumeAppend={personalResume}
      />
    </MainLayout>
  );
}
