'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import Link from 'next/link';

interface UserConnection {
  id: string;
  name: string;
  agentChatId?: string;
  phone?: string;
  hasSession?: boolean;
}

export default function CreateRoomPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdRoomId, setCreatedRoomId] = useState('');
  
  // Basic info
  const [formData, setFormData] = useState({
    title: '',
    lobsterName: '',
  });

  // Connection choice: use existing, create new, or direct OpenClaw
  const [connectionChoice, setConnectionChoice] = useState<'choice' | 'existing' | 'new' | 'direct'>('choice');
  const [connections, setConnections] = useState<UserConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [applyingConnection, setApplyingConnection] = useState(false);

  // Agent config (for new connection)
  const [connectionName, setConnectionName] = useState('');
  const [tempId, setTempId] = useState('');
  const [chatId, setChatId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [twoFactorPassword, setTwoFactorPassword] = useState('');
  const [loginStep, setLoginStep] = useState<'phone' | 'code' | 'password' | 'done'>('phone');
  const [passwordHint, setPasswordHint] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [submittingCode, setSubmittingCode] = useState(false);
  const [submittingPassword, setSubmittingPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [liveMode, setLiveMode] = useState<'video' | 'audio'>('video');

  // OpenClaw Direct
  const [openclawGatewayUrl, setOpenclawGatewayUrl] = useState('');
  const [openclawToken, setOpenclawToken] = useState('');
  const [applyingDirect, setApplyingDirect] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  // Auth guard: 未登录则跳转登录页，登录成功后返回
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem('token')) {
      router.replace('/login?redirect=/rooms/create');
      return;
    }
  }, [router]);

  // Load user connections when room created
  useEffect(() => {
    if (!createdRoomId) return;
    const loadConnections = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-agent-connections`, {
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
  }, [createdRoomId]);

  // Step 1: Create room with basic info
  const handleBasicInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Generate room ID from title
      const generatedId = formData.title
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 30) + '-' + Date.now().toString().slice(-6);

      const room = await api.rooms.create({
        id: generatedId,
        title: formData.title,
        description: undefined,
        lobsterName: formData.lobsterName,
      });

      setCreatedRoomId(room.id);
      setMessage({ type: 'success', text: '✅ 直播间创建成功！配置 Agent 后即可开始直播' });
    } catch (err: any) {
      setError(err.message || '创建失败');
    } finally {
      setLoading(false);
    }
  };

  // Apply existing connection and start livestream
  const applyExistingConnection = async () => {
    if (!selectedConnectionId) {
      setMessage({ type: 'error', text: '请选择一个连接' });
      return;
    }
    setApplyingConnection(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-agent-connections/apply-to-room/${createdRoomId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ connectionId: selectedConnectionId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '应用失败');
      setMessage({ type: 'success', text: '✅ 连接已应用！正在开始直播...' });
      setConnectionChoice('existing');
      setLoginStep('done');
      await startLivestream();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '应用失败' });
    } finally {
      setApplyingConnection(false);
    }
  };

  const sendVerificationCode = async () => {
    if (!phoneNumber.trim() || !chatId.trim() || !connectionName.trim()) {
      setMessage({ type: 'error', text: '请填写连接名称、手机号和 Agent Chat ID' });
      return;
    }

    setSendingCode(true);
    setMessage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-agent-connections/mtproto-start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
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
    if (!verificationCode.trim() || !tempId) {
      setMessage({ type: 'error', text: '请输入验证码' });
      return;
    }

    setSubmittingCode(true);
    setMessage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-agent-connections/mtproto-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
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
        setMessage({ type: 'success', text: '🎉 连接已保存！正在应用到直播间并开始直播...' });
        const applyRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-agent-connections/apply-to-room/${createdRoomId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ connectionId: data.connection.id }),
        });
        const applyData = await applyRes.json();
        if (!applyData.success) throw new Error(applyData.error || '应用失败');
        setLoginStep('done');
        await startLivestream();
      } else if (data.needsPassword) {
        setLoginStep('password');
        setPasswordHint(data.passwordHint || '');
        setMessage({ type: 'error', text: `🔐 需要两步验证密码。提示：${data.passwordHint || '无'}` });
      } else {
        setMessage({ type: 'error', text: data.error || '验证码错误' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '网络错误' });
    } finally {
      setSubmittingCode(false);
    }
  };

  const submitTwoFactorPassword = async () => {
    if (!twoFactorPassword.trim() || !tempId) {
      setMessage({ type: 'error', text: '请输入两步验证密码' });
      return;
    }

    setSubmittingPassword(true);
    setMessage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-agent-connections/mtproto-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
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
        setMessage({ type: 'success', text: '🎉 连接已保存！正在应用到直播间并开始直播...' });
        const applyRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-agent-connections/apply-to-room/${createdRoomId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ connectionId: data.connection.id }),
        });
        const applyData = await applyRes.json();
        if (!applyData.success) throw new Error(applyData.error || '应用失败');
        setLoginStep('done');
        await startLivestream();
      } else {
        setMessage({ type: 'error', text: data.error || '密码错误' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '网络错误' });
    } finally {
      setSubmittingPassword(false);
    }
  };

  // 验证 OpenClaw 连接（云端必测）
  const testOpenClawConnection = async () => {
    if (!openclawGatewayUrl.trim() || !openclawToken.trim()) {
      setMessage({ type: 'error', text: '请先填写 Gateway URL 和 Token' });
      return;
    }
    setTestingConnection(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agent-config/test-openclaw-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          gatewayUrl: openclawGatewayUrl.trim(),
          token: openclawToken.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ type: 'success', text: '✅ 连接成功！可以点击「应用并开始直播」' });
      } else {
        setMessage({ type: 'error', text: data.error || '连接失败，请检查 URL 和 Token，确保 ngrok 在运行' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '网络错误' });
    } finally {
      setTestingConnection(false);
    }
  };

  // Apply OpenClaw Direct and start livestream
  const applyDirectOpenClaw = async () => {
    if (!openclawGatewayUrl.trim() || !openclawToken.trim()) {
      setMessage({ type: 'error', text: '请填写 Gateway URL 和 Token' });
      return;
    }
    setApplyingDirect(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agent-config/${createdRoomId}`, {
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
      setMessage({ type: 'success', text: '✅ 直连 OpenClaw 已配置！正在开始直播...' });
      await startLivestream();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '配置失败' });
    } finally {
      setApplyingDirect(false);
    }
  };

  // Step 3: Start livestream and redirect
  const startLivestream = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/rooms/${createdRoomId}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ liveMode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '开始直播失败' });
        return;
      }
      setMessage({ type: 'success', text: '✅ 直播已开始！正在跳转...' });
      setTimeout(() => router.push(`/rooms/${createdRoomId}`), 1500);
    } catch (error) {
      console.error('Failed to start livestream:', error);
      setMessage({ type: 'error', text: '开始直播失败，请到直播间页点击「开始直播」' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <span className="text-3xl">🦞</span>
            <span className="text-2xl font-bold text-lobster">ClawLive</span>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">创建直播间</h1>
            <p className="text-gray-600">配置你的龙虾直播间并开始直播</p>
          </div>

          <form onSubmit={handleBasicInfoSubmit} className="bg-white rounded-xl shadow p-8 space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                直播间标题 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="我的龙虾工作实况"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                龙虾昵称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.lobsterName}
                onChange={(e) => setFormData({ ...formData, lobsterName: e.target.value })}
                placeholder="小龙"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
                required
              />
            </div>

            {!createdRoomId ? (
              <>
                <div className="py-6 px-4 rounded-lg bg-gray-50 border border-dashed border-gray-200 text-center text-gray-500 text-sm">
                  创建直播间后，将在此配置 Agent
                </div>
                <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-6 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? '创建中...' : '创建并配置 Agent →'}
                </button>
                <Link
                  href="/rooms"
                  className="px-6 py-3 border border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition-colors text-center"
                >
                  取消
                </Link>
                </div>
              </>
            ) : (
            <>
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Agent 配置</h3>
              </div>

              {/* Live mode selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">直播模式</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setLiveMode('video')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 font-semibold transition-colors ${
                      liveMode === 'video'
                        ? 'border-lobster bg-lobster/10 text-lobster'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    <span>📹</span>
                    <span>视频直播</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLiveMode('audio')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 font-semibold transition-colors ${
                      liveMode === 'audio'
                        ? 'border-lobster bg-lobster/10 text-lobster'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    <span>🎙️</span>
                    <span>语音直播</span>
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {liveMode === 'video' ? '开启摄像头进行视频直播' : '仅使用麦克风进行语音直播'}
                </p>
              </div>

              {/* Connection choice: existing or new */}
              {connectionChoice === 'choice' && (
                <div className="space-y-4">
                  {connections.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">使用已有连接</label>
                      <select
                        value={selectedConnectionId}
                        onChange={(e) => setSelectedConnectionId(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster"
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
                        className="mt-3 w-full px-6 py-3 bg-lobster text-white rounded-lg hover:bg-lobster-dark disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                      >
                        {applyingConnection ? '应用中...' : '应用并开始直播'}
                      </button>
                    </div>
                  )}
                  {connections.length > 0 && (
                    <div className="text-center text-gray-500">或</div>
                  )}
                  <button
                    type="button"
                    onClick={() => { setConnectionChoice('new'); setMessage(null); }}
                    className="w-full px-6 py-3 border-2 border-dashed border-lobster text-lobster rounded-lg hover:bg-lobster/5 font-semibold"
                  >
                    + 新建连接（手机号 + Agent Chat ID）
                  </button>
                  <div className="text-center text-gray-500">或</div>
                  <button
                    type="button"
                    onClick={() => { setConnectionChoice('direct'); setMessage(null); }}
                    className="w-full px-6 py-3 border-2 border-dashed border-teal-500 text-teal-600 rounded-lg hover:bg-teal-50 font-semibold"
                  >
                    🔌 直连 OpenClaw（无需 Telegram）
                  </button>
                </div>
              )}

              {/* OpenClaw Direct 配置 */}
              {connectionChoice === 'direct' && (
                <div className="space-y-4 p-4 border border-teal-200 rounded-lg bg-teal-50">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                    <strong>云端部署：</strong> Gateway URL 必须是<strong>公网可访问</strong>地址。本机 OpenClaw 需用 ngrok 暴露：<code className="bg-amber-100 px-1 rounded">ngrok http 18789</code>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Gateway URL <span className="text-red-500">*</span></label>
                    <input
                      type="url"
                      value={openclawGatewayUrl}
                      onChange={(e) => setOpenclawGatewayUrl(e.target.value)}
                      placeholder="https://xxx.ngrok-free.app"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">不能用 localhost，必须填 ngrok 生成的 https 地址</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Token <span className="text-red-500">*</span></label>
                    <input
                      type="password"
                      value={openclawToken}
                      onChange={(e) => setOpenclawToken(e.target.value)}
                      placeholder="gateway.token"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">终端执行：openclaw config set gateway.token 你的密码</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={testOpenClawConnection}
                      disabled={testingConnection || !openclawGatewayUrl.trim() || !openclawToken.trim()}
                      className="px-4 py-3 border border-teal-600 text-teal-600 rounded-lg hover:bg-teal-50 disabled:opacity-50 font-medium"
                    >
                      {testingConnection ? '验证中...' : '验证连接'}
                    </button>
                    <button
                      type="button"
                      onClick={applyDirectOpenClaw}
                      disabled={applyingDirect || !openclawGatewayUrl.trim() || !openclawToken.trim()}
                      className="flex-1 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 font-semibold"
                    >
                      {applyingDirect ? '应用中...' : '应用并开始直播'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setConnectionChoice('choice'); setMessage(null); }}
                      className="px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      返回
                    </button>
                  </div>
                </div>
              )}

              {/* Step 1: Phone Number (MTProto - 手机号 + Agent Chat ID) */}
              {connectionChoice === 'new' && loginStep === 'phone' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      连接名称 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={connectionName}
                      onChange={(e) => setConnectionName(e.target.value)}
                      placeholder="如：我的工作龙虾"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">保存后可多次复用</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      手机号（带国家码）<span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+8613800138000"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">
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
                      placeholder="@your_agent 或 123456789"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      你的 OpenClaw Agent 的 Telegram 用户名或 ID
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setConnectionChoice('choice'); setMessage(null); }}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      ← 返回
                    </button>
                    <button
                      type="button"
                      onClick={sendVerificationCode}
                      disabled={sendingCode || !phoneNumber.trim() || !chatId.trim() || !connectionName.trim()}
                      className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-lg"
                    >
                      {sendingCode ? '发送中...' : '📱 发送验证码'}
                    </button>
                  </div>
                </>
              )}

              {/* Step 2: Verification Code (MTProto) */}
              {connectionChoice === 'new' && loginStep === 'code' && (
                <>
                  <div className="bg-green-50 border border-green-200 rounded p-3 text-sm">
                    <p className="text-green-800">
                      ✅ 验证码已发送到 <strong>{phoneNumber}</strong>
                    </p>
                    <p className="text-gray-600 mt-1">请打开 Telegram 查看验证码</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      验证码 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      placeholder="123456"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none text-center text-2xl tracking-widest"
                      maxLength={6}
                      autoFocus
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      输入 Telegram 发送给你的 6 位验证码
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
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
                      className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-lg"
                    >
                      {submittingCode ? '验证中...' : '✅ 提交验证码'}
                    </button>
                  </div>
                </>
              )}

              {/* Step 3: Two-Factor Password (MTProto) */}
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      两步验证密码 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      value={twoFactorPassword}
                      onChange={(e) => setTwoFactorPassword(e.target.value)}
                      placeholder="输入你的两步验证密码"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      autoFocus
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLoginStep('code');
                        setTwoFactorPassword('');
                        setMessage(null);
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      ← 返回
                    </button>
                    <button
                      type="button"
                      onClick={submitTwoFactorPassword}
                      disabled={submittingPassword || !twoFactorPassword.trim()}
                      className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-lg"
                    >
                      {submittingPassword ? '验证中...' : '🔓 提交密码'}
                    </button>
                  </div>
                </>
              )}

              {/* Step 4: Done */}
              {(connectionChoice === 'existing' || connectionChoice === 'new') && loginStep === 'done' && (
                <div className="bg-green-50 border border-green-200 rounded p-6 text-center">
                  <div className="text-6xl mb-4 animate-bounce">🎉</div>
                  <p className="text-green-800 font-semibold text-xl mb-2">配置完成！</p>
                  <p className="text-gray-600">正在进入直播间...</p>
                  <div className="mt-4 animate-spin text-4xl">🦞</div>
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
                  <p>{message.text}</p>
                  {message.type === 'error' && createdRoomId && (
                    <Link
                      href={`/rooms/${createdRoomId}`}
                      className="mt-3 inline-block px-4 py-2 bg-lobster text-white rounded-lg hover:bg-lobster-dark font-semibold"
                    >
                      前往直播间手动开始 →
                    </Link>
                  )}
                </div>
              )}
            </>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}
