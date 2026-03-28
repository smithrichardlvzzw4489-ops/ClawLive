'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { api, APIError, API_BASE_URL } from '@/lib/api';

// ─── Types ─────────────────────────────────────────────────────────────────

interface LobsterMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  streaming?: boolean;
  statusText?: string;
}

interface LobsterInstance {
  userId: string;
  appliedAt: string;
  lastActiveAt: string;
  messageCount: number;
}

interface PlatformModel {
  id: string;
  name: string;
  enabled: boolean;
}

interface KeyStatus {
  hasPlatformKey: boolean;
  clawPoints: number;
  litellmConfigured: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const WELCOME_MESSAGE: LobsterMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    '你好！我是虾米 🦀 你的专属 AI 助手。\n\n我现在支持：\n• 🔍 搜索最新网络资讯\n• 📄 查看你发布的内容\n• 🧩 调用 Skills 市场的技能\n• 🤔 多步骤自主推理\n\n有什么我可以帮你的吗？',
  timestamp: new Date().toISOString(),
};

// ─── Sub-components ─────────────────────────────────────────────────────────

function LobsterAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass =
    size === 'sm'
      ? 'h-8 w-8 text-lg'
      : size === 'lg'
        ? 'h-16 w-16 text-4xl'
        : 'h-10 w-10 text-2xl';
  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-400 to-orange-500 font-bold text-white shadow-sm`}
    >
      🦀
    </div>
  );
}

/** 将文本中的 Markdown 链接 [text](url) 和裸 URL 转换为可点击的 React 节点数组 */
function renderTextWithLinks(text: string, isUser: boolean): React.ReactNode[] {
  const linkColor = isUser ? 'text-white underline decoration-white/60' : 'text-lobster underline decoration-lobster/40';
  const parts: React.ReactNode[] = [];
  // 匹配 Markdown 链接 [text](url) 或裸 URL
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s，。！？、\]）)]+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    if (match[1] && match[2]) {
      // Markdown 链接
      parts.push(
        <a key={key++} href={match[2]} target="_blank" rel="noopener noreferrer" className={linkColor}>
          {match[1]}
        </a>
      );
    } else if (match[3]) {
      // 裸 URL
      parts.push(
        <a key={key++} href={match[3]} target="_blank" rel="noopener noreferrer" className={linkColor}>
          {match[3]}
        </a>
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function MessageBubble({ msg }: { msg: LobsterMessage }) {
  const isUser = msg.role === 'user';

  if (!isUser && msg.statusText && !msg.content) {
    return (
      <div className="flex gap-3">
        <LobsterAvatar size="sm" />
        <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 text-sm text-gray-500 shadow-sm ring-1 ring-gray-100">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-orange-400" />
          <span>{msg.statusText}</span>
        </div>
      </div>
    );
  }

  // 将内容按换行拆分，逐段渲染链接
  const renderContent = (text: string) =>
    text.split('\n').map((line, i, arr) => (
      <React.Fragment key={i}>
        {renderTextWithLinks(line, isUser)}
        {i < arr.length - 1 && <br />}
      </React.Fragment>
    ));

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && <LobsterAvatar size="sm" />}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'rounded-tr-sm bg-lobster text-white'
            : 'rounded-tl-sm bg-white text-gray-800 shadow-sm ring-1 ring-gray-100'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{renderContent(msg.content)}</p>
        {msg.streaming && (
          <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current opacity-70" />
        )}
        {!msg.streaming && (
          <p className={`mt-1 text-[11px] ${isUser ? 'text-white/60' : 'text-gray-400'}`}>
            {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
      </div>
      {isUser && (
        <div className="h-8 w-8 shrink-0 self-end rounded-full bg-gray-300 flex items-center justify-center text-sm font-bold text-gray-600">
          我
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <LobsterAvatar size="sm" />
      <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm ring-1 ring-gray-100">
        <div className="flex gap-1 items-center">
          <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

// ─── Key Setup Sheet ─────────────────────────────────────────────────────────

function KeySetupSheet({
  keyStatus,
  onClose,
}: {
  keyStatus: KeyStatus;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="font-bold text-gray-900">虾米 · API Key 状态</h2>
            <p className="text-xs text-gray-500 mt-0.5">使用平台积分兑换的虚拟 Key 调用 AI</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {keyStatus.litellmConfigured ? (
            keyStatus.hasPlatformKey ? (
              <div className="rounded-xl bg-green-50 border border-green-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-green-500 text-lg">✅</span>
                  <p className="font-semibold text-green-800 text-sm">平台虚拟 Key 已就绪</p>
                </div>
                <p className="text-xs text-green-700 ml-7">
                  虾米将使用你通过积分兑换的虚拟 Key 调用 AI，消耗 Key 余额。
                </p>
                <p className="text-xs text-green-600 ml-7 mt-1">
                  当前积分余额：{keyStatus.clawPoints.toLocaleString()} 积分
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-amber-500 text-lg">⚠️</span>
                  <p className="font-semibold text-amber-800 text-sm">暂无平台虚拟 Key</p>
                </div>
                <p className="text-xs text-amber-700">
                  虾米需要平台虚拟 Key 才能调用 AI，前往积分中心用积分兑换后即可使用。
                </p>
                <p className="text-xs text-amber-600">
                  当前积分余额：{keyStatus.clawPoints.toLocaleString()} 积分
                </p>
                <a
                  href="/points"
                  className="block w-full rounded-xl bg-lobster py-2.5 text-center text-sm font-semibold text-white hover:bg-lobster-dark"
                >
                  前往积分中心兑换
                </a>
              </div>
            )
          ) : (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
              <p className="text-sm text-gray-600">平台 AI 服务暂未开放，请稍后再试。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Admin Models Panel ──────────────────────────────────────────────────────

function AdminModelsPanel({
  models,
  onSave,
  onClose,
}: {
  models: PlatformModel[];
  onSave: (models: PlatformModel[], secret: string) => Promise<void>;
  onClose: () => void;
}) {
  const [list, setList] = useState<PlatformModel[]>(() =>
    models.map((m) => ({ ...m })),
  );
  const [adminSecret, setAdminSecret] = useState('');
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [importing, setImporting] = useState(false);

  const toggle = (idx: number) =>
    setList((prev) => prev.map((m, i) => (i === idx ? { ...m, enabled: !m.enabled } : m)));

  const remove = (idx: number) =>
    setList((prev) => prev.filter((_, i) => i !== idx));

  const importFromLitellm = async () => {
    setImporting(true);
    setSaveMsg('');
    try {
      const data = await api.platform.getLitellmModels();
      const fetched: Array<{ id: string; name: string }> = data.models || [];
      if (!fetched.length) {
        setSaveMsg('⚠️ LiteLLM 未返回任何模型，请检查 LITELLM_BASE_URL 配置');
        return;
      }
      setList((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newOnes = fetched
          .filter((m) => !existingIds.has(m.id))
          .map((m) => ({ id: m.id, name: m.name, enabled: true }));
        // 同时把已有的同名模型标为 enabled
        const updated = prev.map((m) =>
          fetched.some((f) => f.id === m.id) ? { ...m, enabled: true } : m,
        );
        return [...updated, ...newOnes];
      });
      setSaveMsg(`✅ 已从 LiteLLM 导入 ${fetched.length} 个模型`);
    } catch {
      setSaveMsg('❌ 无法连接 LiteLLM，请确认服务器配置');
    } finally {
      setImporting(false);
    }
  };

  const addModel = () => {
    const id = newId.trim();
    const name = newName.trim();
    if (!id || !name) return;
    if (list.some((m) => m.id === id)) {
      setSaveMsg('该模型 ID 已存在');
      return;
    }
    setList((prev) => [...prev, { id, name, enabled: true }]);
    setNewId('');
    setNewName('');
    setSaveMsg('');
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      await onSave(list, adminSecret);
      setSaveMsg('✅ 保存成功');
    } catch (err) {
      setSaveMsg(`❌ ${err instanceof Error ? err.message : '保存失败'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="font-bold text-gray-900">平台模型配置</h2>
            <p className="text-xs text-gray-500 mt-0.5">管理虾米可用的 AI 模型</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-4">
          {/* Admin secret */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">管理员密码</label>
            <input
              type="password"
              value={adminSecret}
              onChange={(e) => setAdminSecret(e.target.value)}
              placeholder="输入平台管理员密码（ADMIN_SECRET）"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-lobster/50 focus:ring-2 focus:ring-lobster/10"
            />
          </div>

          {/* Import from LiteLLM */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500">模型列表</label>
              <button
                onClick={importFromLitellm}
                disabled={importing}
                className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-50"
              >
                {importing ? (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
                ) : (
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                )}
                从 LiteLLM 自动导入
              </button>
            </div>
          </div>

          {/* Model list */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2"></label>
            <div className="space-y-2">
              {list.map((m, i) => (
                <div
                  key={m.id}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                    m.enabled
                      ? 'border-green-200 bg-green-50'
                      : 'border-gray-100 bg-gray-50 opacity-60'
                  }`}
                >
                  {/* Toggle */}
                  <button
                    onClick={() => toggle(i)}
                    className={`relative h-5 w-9 rounded-full transition-colors ${
                      m.enabled ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        m.enabled ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{m.name}</p>
                    <p className="text-xs text-gray-400 truncate">{m.id}</p>
                  </div>
                  <button
                    onClick={() => remove(i)}
                    className="shrink-0 rounded-lg p-1 text-gray-300 hover:bg-red-50 hover:text-red-400"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              {list.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-4">暂无模型，请在下方添加</p>
              )}
            </div>
          </div>

          {/* Add model */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">添加自定义模型</label>
            <div className="flex gap-2">
              <input
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="模型 ID，如 openai/gpt-4o"
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-lobster/50 focus:ring-2 focus:ring-lobster/10"
              />
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="显示名称"
                className="w-28 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-lobster/50 focus:ring-2 focus:ring-lobster/10"
              />
              <button
                onClick={addModel}
                className="shrink-0 rounded-xl bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700"
              >
                添加
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-4">
          {saveMsg && (
            <p className={`mb-3 text-center text-sm ${saveMsg.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>
              {saveMsg}
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-xl bg-lobster py-2.5 text-sm font-semibold text-white hover:bg-lobster-dark disabled:opacity-60"
            >
              {saving ? '保存中...' : '保存配置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Files Panel ─────────────────────────────────────────────────────────────

interface UserFile {
  id: string;
  filename: string;
  displayName: string;
  type: string;
  sizeBytes: number;
  createdAt: string;
  downloadPath: string;
}

function FilesPanel({ onClose }: { onClose: () => void }) {
  const [files, setFiles] = useState<UserFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    api.lobster.listFiles().then((data: { files: UserFile[] }) => {
      setFiles(data.files || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleDelete = async (file: UserFile) => {
    if (!confirm(`确定要删除「${file.displayName}」吗？`)) return;
    setDeletingId(file.id);
    try {
      await api.lobster.deleteFile(file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch {
      alert('删除失败，请稍后重试');
    } finally {
      setDeletingId(null);
    }
  };

  const typeEmoji: Record<string, string> = {
    ppt: '📊', pdf: '📄', image: '🖼️', document: '📝', data: '📈', note: '🗒️', other: '📎',
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">📁 我的文件柜</h2>
            <p className="text-xs text-gray-500 mt-0.5">虾米生成的文件都在这里</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-lobster" />
            </div>
          ) : files.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-4xl mb-3">📂</p>
              <p className="text-gray-500 text-sm font-medium">文件柜还是空的</p>
              <p className="text-gray-400 text-xs mt-1">让虾米帮你做 PPT 或生成图片，文件会自动保存在这里</p>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 hover:bg-gray-100 transition"
                >
                  <span className="text-2xl flex-shrink-0">{typeEmoji[file.type] ?? '📎'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{file.displayName}</p>
                    <p className="text-xs text-gray-400">
                      {formatSize(file.sizeBytes)} · {new Date(file.createdAt).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                  <a
                    href={`${API_BASE_URL}${file.downloadPath}`}
                    download={file.displayName}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-white hover:text-lobster transition"
                    title="下载"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </a>
                  <button
                    onClick={() => handleDelete(file)}
                    disabled={deletingId === file.id}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-400 transition disabled:opacity-40"
                    title="删除"
                  >
                    {deletingId === file.id ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-red-400 inline-block" />
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400">文件保存在平台服务器，重装浏览器不会丢失</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function MyLobsterPage() {
  const router = useRouter();
  const [applied, setApplied] = useState<boolean | null>(null);
  const [instance, setInstance] = useState<LobsterInstance | null>(null);
  const [messages, setMessages] = useState<LobsterMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showFilesPanel, setShowFilesPanel] = useState(false);

  // admin model config (hidden from users, accessible to admins only)
  const [platformModels, setPlatformModels] = useState<PlatformModel[]>([]);

  // key state
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
  const [showKeySetup, setShowKeySetup] = useState(false);

  // multimodal
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.replace('/login?redirect=/my-lobster');
      return;
    }
    loadStatus();
    loadKeyStatus();
  }, [router]);

  const loadKeyStatus = async () => {
    try {
      const data = await api.lobster.keyStatus();
      setKeyStatus(data as KeyStatus);
    } catch {
      // ignore
    }
  };

  const loadStatus = async () => {
    try {
      const data = await api.lobster.me();
      setApplied(data.applied);
      if (data.applied) {
        setInstance(data.instance);
        await loadHistory();
      }
    } catch {
      setApplied(false);
    }
  };

  const loadHistory = async () => {
    try {
      const data = await api.lobster.history();
      const msgs: LobsterMessage[] = data.messages || [];
      setMessages(msgs.length > 0 ? msgs : [WELCOME_MESSAGE]);
    } catch {
      setMessages([WELCOME_MESSAGE]);
    }
  };

  const handleApply = async () => {
    setApplying(true);
    setError('');
    try {
      const data = await api.lobster.apply();
      if (data.success) {
        setApplied(true);
        setInstance(data.instance);
        setMessages([WELCOME_MESSAGE]);
      }
    } catch (err) {
      setError(err instanceof APIError ? err.message : '申请失败，请稍后重试');
    } finally {
      setApplying(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPendingImage(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSend = async () => {
    const text = input.trim();
    if ((!text && !pendingImage) || sending) return;

    const imageToSend = pendingImage;
    const userMsg: LobsterMessage = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: imageToSend ? `🖼️ ${text || '（图片）'}` : text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setPendingImage(null);
    setSending(true);
    setError('');

    const assistantPlaceholderId = `assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: assistantPlaceholderId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        streaming: true,
        statusText: '思考中...',
      },
    ]);

    const token = localStorage.getItem('token');
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const response = await fetch(`${API_BASE_URL}/api/lobster/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text || '请描述这张图片', image: imageToSend || undefined }),
        signal: ctrl.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (response.status === 402 && errData.error === 'NO_KEY') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantPlaceholderId
                ? { ...m, content: '⚠️ 需要配置 API Key 才能使用虾米', streaming: false, statusText: undefined }
                : m,
            ),
          );
          setSending(false);
          setShowKeySetup(true);
          return;
        }
        const msg = errData.message || errData.error || `请求失败 (${response.status})`;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantPlaceholderId
              ? { ...m, content: `⚠️ ${msg}`, streaming: false, statusText: undefined }
              : m,
          ),
        );
        setSending(false);
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          let event: { type: string; text?: string; id?: string; message?: string };
          try {
            event = JSON.parse(raw);
          } catch {
            continue;
          }

          if (event.type === 'status') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantPlaceholderId
                  ? { ...m, statusText: event.text, content: '', streaming: true }
                  : m,
              ),
            );
          } else if (event.type === 'delta') {
            streamContent += event.text ?? '';
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantPlaceholderId
                  ? { ...m, content: streamContent, statusText: undefined, streaming: true }
                  : m,
              ),
            );
          } else if (event.type === 'done') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantPlaceholderId
                  ? {
                      ...m,
                      id: event.id ?? m.id,
                      content: streamContent,
                      streaming: false,
                      statusText: undefined,
                      timestamp: new Date().toISOString(),
                    }
                  : m,
              ),
            );
          } else if (event.type === 'error') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantPlaceholderId
                  ? { ...m, content: `⚠️ ${event.message}`, streaming: false, statusText: undefined }
                  : m,
              ),
            );
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantPlaceholderId
            ? { ...m, content: '⚠️ 连接中断，请重试', streaming: false, statusText: undefined }
            : m,
        ),
      );
    } finally {
      setSending(false);
      abortRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearHistory = async () => {
    try {
      await api.lobster.clearHistory();
      setMessages([WELCOME_MESSAGE]);
      setShowClearConfirm(false);
    } catch {
      setShowClearConfirm(false);
    }
  };

  const handleSaveModels = async (models: PlatformModel[], secret: string) => {
    await api.platform.saveModels(models, secret);
    setPlatformModels(models);
    setShowAdminPanel(false);
  };


  // ── Loading ──
  if (applied === null) {
    return (
      <MainLayout>
        <div className="flex justify-center py-24">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-lobster" />
        </div>
      </MainLayout>
    );
  }

  // ── Apply screen ──
  if (!applied) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-red-400 to-orange-500 text-5xl shadow-lg">
            🦀
          </div>
          <h1 className="mb-3 text-2xl font-bold text-gray-900">虾米</h1>
          <p className="mb-2 text-gray-600">虾米平台专属 AI 助手，由平台自主运营</p>
          <p className="mb-8 text-sm text-gray-500">搜索网页 · 查看内容 · 调用技能 · 多步推理</p>

          <div className="mb-8 grid grid-cols-4 gap-3 rounded-2xl bg-gray-50 p-4 text-center text-xs">
            <div><p className="text-xl">🔍</p><p className="mt-1 text-gray-600">网页搜索</p></div>
            <div><p className="text-xl">📄</p><p className="mt-1 text-gray-600">平台内容</p></div>
            <div><p className="text-xl">🧩</p><p className="mt-1 text-gray-600">Skills 技能</p></div>
            <div><p className="text-xl">🤔</p><p className="mt-1 text-gray-600">多步推理</p></div>
          </div>

          {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

          <button
            onClick={handleApply}
            disabled={applying}
            className="w-full rounded-2xl bg-lobster py-3.5 text-base font-semibold text-white shadow-md transition hover:bg-lobster-dark disabled:opacity-60"
          >
            {applying ? '申请中...' : '申请我的虾米'}
          </button>
        </div>
      </MainLayout>
    );
  }

  // ── Chat screen ──
  return (
    <MainLayout>
      <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-2xl flex-col">

        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-gray-200/60 bg-white/80 px-4 py-3 backdrop-blur-sm">
          <LobsterAvatar size="md" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">虾米</p>
            <p className="text-xs text-green-500">● 在线 · 工具调用 · 网页搜索 · Skills</p>
          </div>

          {/* Admin: model config (hidden button, admin-only access) */}
          <button
            onClick={() => setShowAdminPanel(true)}
            title="管理模型配置"
            className="shrink-0 rounded-lg p-1.5 text-gray-300 hover:bg-gray-100 hover:text-gray-500"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {/* Key 状态指示器 */}
          <button
            onClick={() => setShowKeySetup(true)}
            title={keyStatus?.hasPlatformKey ? 'Key 已配置' : '点击查看 Key 状态'}
            className={`shrink-0 flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-medium transition ${
              keyStatus?.hasPlatformKey
                ? 'bg-green-50 text-green-600 hover:bg-green-100'
                : 'bg-amber-50 text-amber-600 hover:bg-amber-100 animate-pulse'
            }`}
          >
            {keyStatus?.hasPlatformKey ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Key
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                配置 Key
              </>
            )}
          </button>

          {instance && (
            <p className="shrink-0 text-xs text-gray-400">已发送 {instance.messageCount} 条</p>
          )}
          <button
            onClick={() => setShowFilesPanel(true)}
            className="shrink-0 flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
            title="我的文件柜"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            文件
          </button>
          <button
            onClick={() => setShowClearConfirm(true)}
            className="shrink-0 rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            清空
          </button>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto bg-gray-50 px-4 py-4"
          onClick={() => { /* close any open panels */ }}
        >
          <div className="space-y-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            {sending && messages[messages.length - 1]?.role !== 'assistant' && (
              <TypingIndicator />
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-gray-200/60 bg-white px-4 py-3">
          {error && !sending && <p className="mb-2 text-xs text-red-500">{error}</p>}

          {/* 图片预览 */}
          {pendingImage && (
            <div className="mb-2 flex items-center gap-2">
              <img src={pendingImage} alt="待发送图片" className="h-16 w-16 rounded-xl object-cover ring-1 ring-gray-200" />
              <button onClick={() => setPendingImage(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-red-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            {/* 图片上传 */}
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={sending}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
              title="发送图片"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>

            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={pendingImage ? '描述这张图片，或直接发送...' : '问我任何问题... Enter 发送'}
              rows={1}
              maxLength={2000}
              disabled={sending}
              className="flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-lobster/40 focus:bg-white focus:ring-2 focus:ring-lobster/10 disabled:opacity-60"
              style={{ maxHeight: '120px', overflowY: input.split('\n').length > 3 ? 'auto' : 'hidden' }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
              }}
            />
            <button
              onClick={handleSend}
              disabled={(!input.trim() && !pendingImage) || sending}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lobster text-white shadow transition hover:bg-lobster-dark disabled:opacity-40"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
              </svg>
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-gray-300">
            虾米可能犯错，重要信息请自行核实
          </p>
        </div>
      </div>

      {/* Clear confirm */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-bold text-gray-900">清空对话记录</h3>
            <p className="mb-6 text-sm text-gray-600">
              清空后虾米将失去对之前对话的记忆，无法恢复。确定要清空吗？
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleClearHistory}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-medium text-white hover:bg-red-600"
              >
                确定清空
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin models panel */}
      {showAdminPanel && (
        <AdminModelsPanel
          models={platformModels}
          onSave={handleSaveModels}
          onClose={() => setShowAdminPanel(false)}
        />
      )}

      {/* Key setup sheet */}
      {showKeySetup && keyStatus && (
        <KeySetupSheet
          keyStatus={keyStatus}
          onClose={() => setShowKeySetup(false)}
        />
      )}

      {/* Files panel */}
      {showFilesPanel && (
        <FilesPanel onClose={() => setShowFilesPanel(false)} />
      )}
    </MainLayout>
  );
}
