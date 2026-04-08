'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/api';

export default function CodernetIndexPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [searchValue, setSearchValue] = useState('');

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      setChecking(false);
      return;
    }
    const base = API_BASE_URL || '';
    fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((user) => {
        if (user?.username) {
          router.replace(`/codernet/card/${encodeURIComponent(user.username)}`);
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const val = searchValue.trim().replace(/^@/, '');
    if (!val) return;
    router.push(`/codernet/github/${encodeURIComponent(val)}`);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#06080f] flex items-center justify-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06080f] text-white">
      <div className="pointer-events-none fixed -top-48 -left-48 h-[700px] w-[700px] rounded-full bg-violet-700/15 blur-[160px]" />
      <div className="pointer-events-none fixed -bottom-48 -right-48 h-[700px] w-[700px] rounded-full bg-indigo-600/10 blur-[160px]" />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4">
        <div className="text-center max-w-lg w-full">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-1.5 mb-6">
            <span className="text-xs font-mono text-violet-400 tracking-wider">CODERNET</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-4">
            AI-Powered<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">
              Developer Profile
            </span>
          </h1>

          <p className="text-slate-400 text-sm sm:text-base leading-relaxed mb-8">
            输入任意 GitHub 用户名，AI 自动分析生成开发者画像 —
            技术栈标签、能力雷达图、语言分布、毒舌锐评。
          </p>

          {/* Search input */}
          <form onSubmit={handleSearch} className="relative max-w-md mx-auto mb-6">
            <div className="flex rounded-xl border border-white/[0.1] bg-white/[0.04] overflow-hidden focus-within:border-violet-500/40 transition">
              <span className="flex items-center pl-4 text-slate-500 font-mono text-sm select-none">@</span>
              <input
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="github-username"
                className="flex-1 bg-transparent px-2 py-3 text-sm font-mono text-white placeholder:text-slate-600 outline-none"
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="submit"
                disabled={!searchValue.trim()}
                className="px-5 py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/30 disabled:cursor-not-allowed text-sm font-semibold transition"
              >
                Generate
              </button>
            </div>
          </form>

          {/* Quick examples */}
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            <span className="text-[10px] text-slate-600 self-center mr-1">Try:</span>
            {['torvalds', 'yyx990803', 'tj', 'sindresorhus', 'antirez'].map((name) => (
              <button
                key={name}
                onClick={() => router.push(`/codernet/github/${name}`)}
                className="text-xs font-mono px-2.5 py-1 rounded-md border border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-violet-300 hover:border-violet-500/30 transition"
              >
                @{name}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 max-w-md mx-auto mb-6">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[10px] text-slate-600 font-mono">OR</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          {/* Login CTA */}
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] px-6 py-2.5 text-sm font-medium transition"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            Login with GitHub to create your own card
          </Link>

          {/* Feature cards */}
          <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            {[
              { icon: '🏷️', label: 'Tech Tags', desc: 'AI-detected stack' },
              { icon: '📊', label: 'Capability Radar', desc: '4-axis profile' },
              { icon: '💬', label: 'AI Commentary', desc: '毒舌锐评' },
              { icon: '📈', label: 'Language Stats', desc: 'Code distribution' },
            ].map((f) => (
              <div key={f.label} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                <div className="text-2xl mb-2">{f.icon}</div>
                <p className="text-xs font-semibold text-slate-200">{f.label}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
