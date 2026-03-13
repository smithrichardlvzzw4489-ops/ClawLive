'use client';

import { useState, useEffect } from 'react';

interface WorkAgentSettingsProps {
  workId: string;
  onClose: () => void;
  onConfigComplete?: () => void;
}

export function WorkAgentSettings({ workId, onClose, onConfigComplete }: WorkAgentSettingsProps) {
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

  const loadConfig = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/work-agent-config/${workId}`, {
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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/work-agent-config/${workId}/mtproto-start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          phoneNumber: phoneNumber.trim(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setLoginStep('code');
        setMessage({ type: 'success', text: '✅ 验证码已发送到你的手机，请查看 Telegram 消息' });
        if (data.needsPassword) {
          setPasswordHint(data.passwordHint || '');
        }
      } else {
        setMessage({ type: 'error', text: `❌ ${data.error || '发送验证码失败'}` });
      }
    } catch (error) {
      console.error('Error sending verification code:', error);
      setMessage({ type: 'error', text: '❌ 网络错误，请重试' });
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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/work-agent-config/${workId}/mtproto-code`, {
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
        if (data.needsPassword) {
          setLoginStep('password');
          setPasswordHint(data.passwordHint || '');
          setMessage({ type: 'success', text: '✅ 验证码正确，请输入两步验证密码' });
        } else {
          await completeConfiguration();
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
    if (!twoFactorPassword.trim()) {
      setMessage({ type: 'error', text: '请输入两步验证密码' });
      return;
    }

    setSubmittingPassword(true);
    setMessage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/work-agent-config/${workId}/mtproto-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          password: twoFactorPassword,
        }),
      });

      const data = await response.json();

      if (data.success) {
        await completeConfiguration();
      } else {
        setMessage({ type: 'error', text: `❌ ${data.error || '密码错误'}` });
      }
    } catch (error) {
      console.error('Error submitting password:', error);
      setMessage({ type: 'error', text: '❌ 网络错误，请重试' });
    } finally {
      setSubmittingPassword(false);
    }
  };

  const completeConfiguration = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/work-agent-config/${workId}/mtproto-complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          agentChatId: chatId.trim(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setLoginStep('done');
        setMessage({ type: 'success', text: '✅ Agent 配置成功！' });
        onConfigComplete?.();
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setMessage({ type: 'error', text: `❌ ${data.error || '配置失败'}` });
      }
    } catch (error) {
      console.error('Error completing configuration:', error);
      setMessage({ type: 'error', text: '❌ 网络错误，请重试' });
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🦞</span>
            <h2 className="text-xl font-bold">Agent 设置</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
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

              {/* Phone Number Step */}
              {loginStep === 'phone' && (
                <div className="space-y-4">
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

                  <button
                    onClick={sendVerificationCode}
                    disabled={sendingCode}
                    className="w-full px-6 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
              )}

              {/* Verification Code Step */}
              {loginStep === 'code' && (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-green-900">
                      ✅ 验证码已发送到你的 Telegram！请查看"Telegram"应用中的消息。
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
              {loginStep === 'password' && (
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
                  <p className="text-gray-600 mb-6">
                    Agent 已成功连接，现在可以开始对话了
                  </p>
                  <button
                    onClick={onClose}
                    className="px-8 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors"
                  >
                    开始创作
                  </button>
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
        {loginStep !== 'done' && !loading && (
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
    </div>
  );
}
