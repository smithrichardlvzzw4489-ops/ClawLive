'use client';

import { useState, useEffect } from 'react';

interface AgentSettingsProps {
  roomId: string;
  onClose: () => void;
  onConfigComplete?: () => void;
  isPreLiveConfig?: boolean;
}

export function AgentSettings({ roomId, onClose, onConfigComplete, isPreLiveConfig = false }: AgentSettingsProps) {
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
  }, [roomId]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agent-config/${roomId}`, {
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

  const sendVerificationCode = async () => {
    if (!phoneNumber.trim() || !chatId.trim()) {
      setMessage({ type: 'error', text: '请填写手机号和 Chat ID' });
      return;
    }

    setSendingCode(true);
    setMessage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agent-config/${roomId}/mtproto-start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          phoneNumber: phoneNumber.trim(),
          chatId: chatId.trim(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setLoginStep('code');
        setMessage({ type: 'success', text: '✅ 验证码已发送到你的手机，请查看 Telegram 消息' });
      } else {
        setMessage({ type: 'error', text: data.error || '发送失败' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' });
    } finally {
      setSendingCode(false);
    }
  };

  const submitVerificationCode = async () => {
    if (!verificationCode.trim()) {
      setMessage({ type: 'error', text: '请输入验证码' });
      return;
    }

    setSubmittingCode(true);
    setMessage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agent-config/${roomId}/mtproto-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: verificationCode.trim(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setLoginStep('done');
        if (isPreLiveConfig) {
          setMessage({ type: 'success', text: '🎉 登录成功！正在开始直播...' });
          setTimeout(() => {
            onConfigComplete?.();
          }, 1500);
        } else {
          setMessage({ type: 'success', text: '🎉 登录成功！现在你可以以真实用户身份发送消息了' });
          setTimeout(() => {
            onClose();
          }, 2000);
        }
      } else if (data.needsPassword) {
        setLoginStep('password');
        setPasswordHint(data.passwordHint || '');
        setMessage({ type: 'error', text: `🔐 需要两步验证密码。提示：${data.passwordHint || '无'}` });
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
    if (!twoFactorPassword.trim()) {
      setMessage({ type: 'error', text: '请输入两步验证密码' });
      return;
    }

    setSubmittingPassword(true);
    setMessage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agent-config/${roomId}/mtproto-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          password: twoFactorPassword.trim(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setLoginStep('done');
        if (isPreLiveConfig) {
          setMessage({ type: 'success', text: '🎉 登录成功！正在开始直播...' });
          setTimeout(() => {
            onConfigComplete?.();
          }, 1500);
        } else {
          setMessage({ type: 'success', text: '🎉 登录成功！现在你可以以真实用户身份发送消息了' });
          setTimeout(() => {
            onClose();
          }, 2000);
        }
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
            <div className="text-4xl animate-spin mb-4">🦞</div>
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
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <span>🦞</span>
              <span>{isPreLiveConfig ? '开始直播 - Agent 配置' : 'Agent 设置'}</span>
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
          {/* Telegram User Config */}
          <div className="space-y-4 p-4 border border-purple-200 rounded-lg bg-purple-50">
            <div className="bg-white border border-purple-200 rounded p-3 text-sm">
              <p className="text-gray-700">
                以<strong>你的真实 Telegram 用户身份</strong>发送消息，Agent 完美识别你的对话！
              </p>
            </div>

            {/* Step 1: Phone Number */}
            {loginStep === 'phone' && (
              <>
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

                <button
                  onClick={sendVerificationCode}
                  disabled={sendingCode || !phoneNumber.trim() || !chatId.trim()}
                  className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-lg"
                >
                  {sendingCode ? '发送中...' : '📱 发送验证码'}
                </button>
              </>
            )}

            {/* Step 2: Verification Code */}
            {loginStep === 'code' && (
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
            {loginStep === 'password' && (
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
