'use client';

import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';

interface UserConnection {
  id: string;
  name: string;
  agentChatId?: string;
  phone?: string;
}

interface WorkAgentSettingsProps {
  workId: string;
  onClose: () => void;
  onConfigComplete?: () => void;
  /** 内联模式：用于创建页，无弹窗遮罩 */
  inline?: boolean;
  /** 内联模式下，进入工作室的回调（替代 onClose） */
  onEnterStudio?: () => void;
}

export function WorkAgentSettings({ workId, onClose, onConfigComplete, inline, onEnterStudio }: WorkAgentSettingsProps) {
  const [connectionChoice, setConnectionChoice] = useState<'choice' | 'existing' | 'new'>('choice');
  const [connections, setConnections] = useState<UserConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [applyingConnection, setApplyingConnection] = useState(false);

  const [connectionName, setConnectionName] = useState('');
  const [tempId, setTempId] = useState('');
  const [chatId, setChatId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [twoFactorPassword, setTwoFactorPassword] = useState('');
  const [loginStep, setLoginStep] = useState<'phone' | 'code' | 'password' | 'done'>('phone');
  const [passwordHint, setPasswordHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [submittingCode, setSubmittingCode] = useState(false);
  const [submittingPassword, setSubmittingPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadConfig();
  }, [workId]);

  useEffect(() => {
    const loadConnections = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/api/user-agent-connections`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setConnections(data.connections || []);
        }
      } catch {
        setConnections([]);
      }
    };
    loadConnections();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/work-agent-config/${workId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setChatId(data.agentChatId || '');
        if (data.agentStatus === 'active' || data.agentStatus === 'connected') {
          setLoginStep('done');
        }
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyExistingConnection = async () => {
    if (!selectedConnectionId) {
      setMessage({ type: 'error', text: '请选择一个连接' });
      return;
    }
    setApplyingConnection(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/user-agent-connections/apply-to-work/${workId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ connectionId: selectedConnectionId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '应用失败');
      setLoginStep('done');
      setMessage({ type: 'success', text: '✅ 连接已应用！' });
      onConfigComplete?.();
      if (!inline) setTimeout(() => onClose(), 1500);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '应用失败' });
    } finally {
      setApplyingConnection(false);
    }
  };

  const sendVerificationCode = async () => {
    if (!phoneNumber.trim() || !chatId.trim() || !connectionName.trim()) {
      setMessage({ type: 'error', text: '请填写连接名称、手机号和 Chat ID' });
      return;
    }

    setSendingCode(true);
    setMessage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/user-agent-connections/mtproto-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          name: connectionName.trim(),
          phoneNumber: phoneNumber.trim(),
          agentChatId: chatId.trim(),
        }),
      });

      const data = await response.json();
      if (data.success) {
        setTempId(data.tempId);
        setLoginStep('code');
        setMessage({ type: 'success', text: '✅ 验证码已发送到你的手机，请查看 Telegram 消息' });
      } else {
        if (response.status === 401 || data.code === 'TOKEN_EXPIRED') {
          localStorage.removeItem('token');
          setMessage({ type: 'error', text: '登录已过期，请刷新页面重新登录' });
        } else {
          setMessage({ type: 'error', text: data.error || '发送验证码失败' });
        }
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误，请重试' });
    } finally {
      setSendingCode(false);
    }
  };

  const submitVerificationCode = async () => {
    if (!verificationCode.trim() || !tempId) return;

    setSubmittingCode(true);
    setMessage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/user-agent-connections/mtproto-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          tempId,
          code: verificationCode.trim(),
          name: connectionName.trim(),
          agentChatId: chatId.trim(),
          phoneNumber: phoneNumber.trim(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        if (data.needsPassword) {
          setLoginStep('password');
          setPasswordHint(data.passwordHint || '');
          setMessage({ type: 'success', text: '✅ 验证码正确，请输入两步验证密码' });
        } else {
          const applyRes = await fetch(`${API_BASE_URL}/api/user-agent-connections/apply-to-work/${workId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ connectionId: data.connection.id }),
          });
          const applyData = await applyRes.json();
          if (!applyData.success) throw new Error(applyData.error || '应用失败');
        setLoginStep('done');
        setMessage({ type: 'success', text: '✅ Agent 配置成功！' });
        onConfigComplete?.();
        if (!inline) setTimeout(() => onClose(), 1500);
      }
      } else {
        setMessage({ type: 'error', text: `❌ ${data.error || '验证码错误'}` });
      }
    } catch (error) {
      console.error('Error submitting code:', error);
      setMessage({ type: 'error', text: '❌ 网络错误，请重试' });
    } finally {
      setSubmittingCode(false);
    }
  };

  const submitTwoFactorPassword = async () => {
    if (!twoFactorPassword.trim() || !tempId) return;

    setSubmittingPassword(true);
    setMessage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/user-agent-connections/mtproto-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          tempId,
          password: twoFactorPassword.trim(),
          name: connectionName.trim(),
          agentChatId: chatId.trim(),
          phoneNumber: phoneNumber.trim(),
        }),
      });

      const data = await response.json();
      if (data.success) {
        const applyRes = await fetch(`${API_BASE_URL}/api/user-agent-connections/apply-to-work/${workId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ connectionId: data.connection.id }),
        });
        const applyData = await applyRes.json();
        if (!applyData.success) throw new Error(applyData.error || '应用失败');
        setLoginStep('done');
        setMessage({ type: 'success', text: '✅ Agent 配置成功！' });
        onConfigComplete?.();
        if (!inline) setTimeout(() => onClose(), 1500);
      } else {
        setMessage({ type: 'error', text: data.error || '密码错误' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '网络错误，请重试' });
    } finally {
      setSubmittingPassword(false);
    }
  };

  const content = (
    <div className={inline ? 'bg-white rounded-lg border border-gray-200 overflow-hidden' : 'bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto'}>
      {/* Header */}
      <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🦞</span>
          <h2 className="text-xl font-bold">{inline ? 'Agent 配置' : 'Agent 设置'}</h2>
        </div>
        {!inline && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        )}
      </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-lobster mx-auto mb-4"></div>
              <p className="text-gray-600">加载中...</p>
            </div>
          ) : (
            <>
              {/* Info Banner */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-purple-900">
                  以你的真实 Telegram 用户身份发送消息，Agent 完美识别你的对话！
                </p>
              </div>

              {/* Connection choice: existing or new */}
              {connectionChoice === 'choice' && loginStep !== 'done' && (
                <div className="space-y-4">
                  {connections.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">使用已有连接</label>
                      <select
                        value={selectedConnectionId}
                        onChange={(e) => setSelectedConnectionId(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
                      >
                        <option value="">-- 选择一个连接 --</option>
                        {connections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.phone ? `(${c.phone})` : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={applyExistingConnection}
                        disabled={applyingConnection || !selectedConnectionId}
                        className="mt-3 w-full px-6 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {applyingConnection ? '应用中...' : '应用'}
                      </button>
                    </div>
                  )}
                  {connections.length > 0 && <div className="text-center text-gray-500">或</div>}
                  <button
                    type="button"
                    onClick={() => setConnectionChoice('new')}
                    className="w-full px-6 py-3 border-2 border-dashed border-lobster text-lobster rounded-lg hover:bg-lobster/5 font-semibold"
                  >
                    + 新建连接
                  </button>
                </div>
              )}

              {/* Phone Number Step (new connection only) */}
              {connectionChoice === 'new' && loginStep === 'phone' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      连接名称 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={connectionName}
                      onChange={(e) => setConnectionName(e.target.value)}
                      placeholder="如：我的工作龙虾"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
                    />
                    <p className="text-sm text-gray-500 mt-1">保存后可多次复用</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      手机号（带国家码）<span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+8615208217540"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      例如：+86 开头（中国）、+1 开头（美国）
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Agent Chat ID <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={chatId}
                      onChange={(e) => setChatId(e.target.value)}
                      placeholder="@L3_Minimax_bot"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      你的 OpenClaw Agent 的 Telegram 用户名或 ID
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => { setConnectionChoice('choice'); setMessage(null); }}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
                    >
                      ← 返回
                    </button>
                    <button
                      onClick={sendVerificationCode}
                      disabled={sendingCode || !phoneNumber.trim() || !chatId.trim() || !connectionName.trim()}
                      className="flex-1 px-6 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {sendingCode ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                          发送中...
                        </>
                      ) : (
                        <>📱 发送验证码</>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Verification Code Step */}
              {connectionChoice === 'new' && loginStep === 'code' && (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-green-900">
                      ✅ 验证码已发送到你的 Telegram！请查看「Telegram」应用中的消息。
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      验证码 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      placeholder="12345"
                      maxLength={6}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent text-center text-2xl tracking-widest"
                      autoFocus
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setLoginStep('phone')}
                      className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
                    >
                      ← 返回
                    </button>
                    <button
                      onClick={submitVerificationCode}
                      disabled={submittingCode}
                      className="flex-1 px-6 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {submittingCode ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                          验证中...
                        </>
                      ) : (
                        <>✅ 验证</>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* 2FA Password Step */}
              {connectionChoice === 'new' && loginStep === 'password' && (
                <div className="space-y-4">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-yellow-900">
                      🔐 你的账户启用了两步验证，请输入密码
                      {passwordHint && ` (提示: ${passwordHint})`}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      两步验证密码 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      value={twoFactorPassword}
                      onChange={(e) => setTwoFactorPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
                      autoFocus
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setLoginStep('code')}
                      className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
                    >
                      ← 返回
                    </button>
                    <button
                      onClick={submitTwoFactorPassword}
                      disabled={submittingPassword}
                      className="flex-1 px-6 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {submittingPassword ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                          验证中...
                        </>
                      ) : (
                        <>✅ 验证</>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Done */}
              {loginStep === 'done' && (
                <div className="text-center py-8">
                  <div className="text-6xl mb-4">✅</div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">配置完成！</h3>
                  <p className="text-gray-600">
                    Agent 已成功连接，现在可以开始对话了
                  </p>
                </div>
              )}

              {/* Message Display */}
              {message && loginStep !== 'done' && (
                <div
                  className={`mt-4 p-4 rounded-lg ${
                    message.type === 'success'
                      ? 'bg-green-50 border border-green-200 text-green-900'
                      : 'bg-red-50 border border-red-200 text-red-900'
                  }`}
                >
                  <p className="text-sm">{message.text}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {loginStep === 'done' && !inline && (
          <div className="border-t px-6 py-4 bg-gray-50 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors"
            >
              完成
            </button>
          </div>
        )}
        {loginStep !== 'done' && !loading && !inline && (
          <div className="border-t px-6 py-4 bg-gray-50">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              取消
            </button>
          </div>
        )}
      </div>
  );

  if (inline) {
    return content;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      {content}
    </div>
  );
}
