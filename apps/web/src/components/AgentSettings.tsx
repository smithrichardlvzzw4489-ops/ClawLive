'use client';

import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';

interface UserConnection {
  id: string;
  name: string;
  agentChatId?: string;
  phone?: string;
}

interface AgentSettingsProps {
  roomId: string;
  onClose: () => void;
  onConfigComplete?: () => void;
  isPreLiveConfig?: boolean;
}

export function AgentSettings({ roomId, onClose, onConfigComplete, isPreLiveConfig = false }: AgentSettingsProps) {
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
  const [agentMode, setAgentMode] = useState<'telegram' | 'direct'>('telegram');
  const [openclawGatewayUrl, setOpenclawGatewayUrl] = useState('');
  const [openclawToken, setOpenclawToken] = useState('');
  const [applyingDirect, setApplyingDirect] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  useEffect(() => {
    loadConfig();
  }, [roomId]);

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
      const response = await fetch(`${API_BASE_URL}/api/agent-config/${roomId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setChatId(data.agentChatId || '');
        setOpenclawGatewayUrl(data.openclawGatewayUrl || '');
        if (data.agentType === 'openclaw-direct') {
          setAgentMode('direct');
          if (data.agentStatus === 'connected') setLoginStep('done');
        } else if (data.agentStatus === 'active' || data.agentStatus === 'connected') {
          setLoginStep('done');
        }
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    } finally {
      setLoading(false);
    }
  };

  const testOpenClawConnection = async () => {
    if (!openclawGatewayUrl.trim() || !openclawToken.trim()) {
      setMessage({ type: 'error', text: '请先填写 Gateway URL 和 Token' });
      return;
    }
    setTestingConnection(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/agent-config/test-openclaw-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          gatewayUrl: openclawGatewayUrl.trim(),
          token: openclawToken.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ type: 'success', text: '✅ 连接成功' });
      } else {
        setMessage({ type: 'error', text: data.error || '连接失败，请检查 URL 和 ngrok' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '网络错误' });
    } finally {
      setTestingConnection(false);
    }
  };

  const applyDirectOpenClaw = async () => {
    if (!openclawGatewayUrl.trim() || !openclawToken.trim()) {
      setMessage({ type: 'error', text: '请填写 Gateway URL 和 Token' });
      return;
    }
    setApplyingDirect(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/agent-config/${roomId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          agentType: 'openclaw-direct',
          agentEnabled: true,
          openclawGatewayUrl: openclawGatewayUrl.trim(),
          openclawToken: openclawToken.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '配置失败');
      setLoginStep('done');
      setMessage({ type: 'success', text: '✅ 直连 OpenClaw 已配置！' });
      onConfigComplete?.();
      if (isPreLiveConfig) setTimeout(() => onClose(), 1500);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '配置失败' });
    } finally {
      setApplyingDirect(false);
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
      const res = await fetch(`${API_BASE_URL}/api/user-agent-connections/apply-to-room/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ connectionId: selectedConnectionId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '应用失败');
      setLoginStep('done');
      setMessage({ type: 'success', text: '✅ 连接已应用！' });
      onConfigComplete?.();
      if (isPreLiveConfig) setTimeout(() => onClose(), 1500);
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
          setMessage({ type: 'error', text: data.error || '发送失败' });
        }
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' });
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
          const applyRes = await fetch(`${API_BASE_URL}/api/user-agent-connections/apply-to-room/${roomId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ connectionId: data.connection.id }),
          });
          const applyData = await applyRes.json();
          if (!applyData.success) throw new Error(applyData.error || '应用失败');
          setLoginStep('done');
          setMessage({ type: 'success', text: isPreLiveConfig ? '🎉 登录成功！正在开始直播...' : '🎉 登录成功！' });
          onConfigComplete?.();
          setTimeout(() => onClose(), isPreLiveConfig ? 1500 : 2000);
        }
      } else {
        setMessage({ type: 'error', text: data.error || '验证码错误' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' });
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
        const applyRes = await fetch(`${API_BASE_URL}/api/user-agent-connections/apply-to-room/${roomId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ connectionId: data.connection.id }),
        });
        const applyData = await applyRes.json();
        if (!applyData.success) throw new Error(applyData.error || '应用失败');
        setLoginStep('done');
        setMessage({ type: 'success', text: isPreLiveConfig ? '🎉 登录成功！正在开始直播...' : '🎉 登录成功！' });
        onConfigComplete?.();
        setTimeout(() => onClose(), isPreLiveConfig ? 1500 : 2000);
      } else {
        setMessage({ type: 'error', text: data.error || '密码错误' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' });
    } finally {
      setSubmittingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-b-2 border-lobster" />
            <p>加载中...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b p-6 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <h2 className="text-2xl font-bold">
              {isPreLiveConfig ? '开始直播 - Agent 配置' : 'Agent 设置'}
            </h2>
            {isPreLiveConfig && (
              <p className="text-sm text-gray-600 mt-1">配置你的 Telegram Agent，完成后将自动开始直播</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* 连接方式选择 */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setAgentMode('telegram'); setConnectionChoice('choice'); setMessage(null); }}
              className={`flex-1 px-4 py-2 rounded-lg font-medium ${agentMode === 'telegram' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Telegram 用户
            </button>
            <button
              type="button"
              onClick={() => { setAgentMode('direct'); setMessage(null); }}
              className={`flex-1 px-4 py-2 rounded-lg font-medium ${agentMode === 'direct' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              直连 OpenClaw
            </button>
          </div>

          {/* OpenClaw Direct Config */}
          {agentMode === 'direct' && (
            <div className="space-y-4 p-4 border border-teal-200 rounded-lg bg-teal-50">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <strong>云端部署：</strong> 推荐 <code className="bg-amber-100 px-1 rounded">ngrok http 18789</code>。localtunnel 易 408 超时。
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Gateway URL</label>
                <input
                  type="url"
                  value={openclawGatewayUrl}
                  onChange={(e) => setOpenclawGatewayUrl(e.target.value)}
                  placeholder="https://xxx.ngrok-free.app（推荐）或 https://xxx.loca.lt"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                />
                <p className="text-xs text-gray-500 mt-1">推荐 ngrok；localtunnel 遇 408 请换 ngrok</p>
                {openclawGatewayUrl && (openclawGatewayUrl.includes('loca.lt') || openclawGatewayUrl.includes('localtunnel.me')) && (
                  <p className="text-xs text-amber-700 mt-1">⚠️ 当前为 localtunnel，易 408。建议改用 ngrok</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Token</label>
                <input
                  type="password"
                  value={openclawToken}
                  onChange={(e) => setOpenclawToken(e.target.value)}
                  placeholder="gateway.token"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                />
                <p className="text-xs text-gray-500 mt-1">openclaw config set gateway.token 你的密码</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={testOpenClawConnection}
                  disabled={testingConnection || !openclawGatewayUrl.trim() || !openclawToken.trim()}
                  className="px-4 py-2 border border-teal-600 text-teal-600 rounded-lg hover:bg-teal-50 disabled:opacity-50"
                >
                  {testingConnection ? '验证中...' : '验证连接'}
                </button>
                <button
                  type="button"
                  onClick={applyDirectOpenClaw}
                  disabled={applyingDirect || !openclawGatewayUrl.trim() || !openclawToken.trim()}
                  className="flex-1 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 font-semibold"
                >
                  {applyingDirect ? '应用中...' : '应用'}
                </button>
              </div>
              {loginStep === 'done' && agentMode === 'direct' && (
                <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-800">
                  ✅ 直连 OpenClaw 已配置
                </div>
              )}
            </div>
          )}

          {/* Telegram User Config */}
          {agentMode === 'telegram' && (
          <div className="space-y-4 p-4 border border-purple-200 rounded-lg bg-purple-50">
            <div className="bg-white border border-purple-200 rounded p-3 text-sm">
              <p className="text-gray-700">
                以<strong>你的真实 Telegram 用户身份</strong>发送消息，Agent 完美识别你的对话！
              </p>
            </div>

            {/* Connection choice: existing or new */}
            {connectionChoice === 'choice' && loginStep !== 'done' && (
              <div className="space-y-4">
                {connections.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium mb-2">使用已有连接</label>
                    <select
                      value={selectedConnectionId}
                      onChange={(e) => setSelectedConnectionId(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
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
                      className="mt-3 w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                    >
                      {applyingConnection ? '应用中...' : '应用'}
                    </button>
                  </div>
                )}
                {connections.length > 0 && <div className="text-center text-gray-500">或</div>}
                <button
                  type="button"
                  onClick={() => setConnectionChoice('new')}
                  className="w-full px-6 py-3 border-2 border-dashed border-purple-600 text-purple-600 rounded-lg hover:bg-purple-50 font-semibold"
                >
                  + 新建连接
                </button>
              </div>
            )}

            {/* Step 1: Phone Number (new connection only) */}
            {connectionChoice === 'new' && loginStep === 'phone' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    连接名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={connectionName}
                    onChange={(e) => setConnectionName(e.target.value)}
                    placeholder="如：我的直播龙虾"
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                  <p className="text-xs text-gray-600 mt-1">保存后可多次复用</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    手机号（带国家码）<span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+8613800138000"
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    例如：+86 开头（中国）、+1 开头（美国）
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Agent Chat ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    placeholder="@your_agent 或 123456789"
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    你的 OpenClaw Agent 的 Telegram 用户名或 ID
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => { setConnectionChoice('choice'); setMessage(null); }}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    ← 返回
                  </button>
                  <button
                    onClick={sendVerificationCode}
                    disabled={sendingCode || !phoneNumber.trim() || !chatId.trim() || !connectionName.trim()}
                    className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-lg"
                  >
                    {sendingCode ? '发送中...' : '📱 发送验证码'}
                  </button>
                </div>
              </>
            )}

            {/* Step 2: Verification Code */}
            {connectionChoice === 'new' && loginStep === 'code' && (
              <>
                <div className="bg-green-50 border border-green-200 rounded p-3 text-sm">
                  <p className="text-green-800">
                    ✅ 验证码已发送到 <strong>{phoneNumber}</strong>
                  </p>
                  <p className="text-gray-600 mt-1">请打开 Telegram 查看验证码</p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    验证码 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    placeholder="123456"
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none text-center text-2xl tracking-widest"
                    maxLength={6}
                    autoFocus
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    输入 Telegram 发送给你的 6 位验证码
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setLoginStep('phone');
                      setVerificationCode('');
                      setMessage(null);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    ← 返回
                  </button>
                  <button
                    onClick={submitVerificationCode}
                    disabled={submittingCode || !verificationCode.trim()}
                    className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-lg"
                  >
                    {submittingCode ? '验证中...' : '✅ 提交验证码'}
                  </button>
                </div>
              </>
            )}

            {/* Step 3: Two-Factor Password (Optional) */}
            {connectionChoice === 'new' && loginStep === 'password' && (
              <>
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm">
                  <p className="text-yellow-800 font-medium">
                    🔐 检测到两步验证
                  </p>
                  <p className="text-gray-700 mt-1">
                    提示：{passwordHint || '无提示'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    两步验证密码 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={twoFactorPassword}
                    onChange={(e) => setTwoFactorPassword(e.target.value)}
                    placeholder="输入你的两步验证密码"
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    autoFocus
                  />
                </div>

                <button
                  onClick={submitTwoFactorPassword}
                  disabled={submittingPassword || !twoFactorPassword.trim()}
                  className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-lg"
                >
                  {submittingPassword ? '验证中...' : '🔓 提交密码'}
                </button>
              </>
            )}

            {/* Step 4: Done */}
            {loginStep === 'done' && (
              <div className="bg-green-50 border border-green-200 rounded p-4 text-center">
                <div className="text-4xl mb-2">🎉</div>
                <p className="text-green-800 font-semibold text-lg">登录成功！</p>
                <p className="text-gray-600 mt-1">现在你可以以真实用户身份与 Agent 对话了</p>
              </div>
            )}
          </div>
          )}

          {/* Message */}
          {message && (
            <div
              className={`p-4 rounded-lg ${
                message.type === 'success'
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}
            >
              {message.text}
              {message.type === 'error' && (message.text.includes('408') || message.text.includes('超时')) && (
                <p className="mt-2 text-sm opacity-90">多为穿透超时。确认 gateway 和 localtunnel 窗口都在运行，或换 ngrok 试。详见《直连 OpenClaw 傻瓜指南》</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-6 flex gap-3 justify-end sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-semibold"
          >
            {loginStep === 'done' ? '完成' : '取消'}
          </button>
        </div>
      </div>
    </div>
  );
}
