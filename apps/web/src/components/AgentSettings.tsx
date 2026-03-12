'use client';

import { useState, useEffect } from 'react';

interface AgentSettingsProps {
  roomId: string;
  onClose: () => void;
}

export function AgentSettings({ roomId, onClose }: AgentSettingsProps) {
  const [agentType, setAgentType] = useState<'mock' | 'telegram' | 'telegram-user'>('mock');
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [twoFactorPassword, setTwoFactorPassword] = useState('');
  const [loginStep, setLoginStep] = useState<'phone' | 'code' | 'password' | 'done'>('phone');
  const [passwordHint, setPasswordHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [autoGetting, setAutoGetting] = useState(false);
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
        setAgentType(data.agentType || 'mock');
        setAgentEnabled(data.agentEnabled || false);
        setChatId(data.agentChatId || '');
        // Don't load bot token for security (only show if it exists)
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    } finally {
      setLoading(false);
    }
  };

  const autoGetChatId = async () => {
    if (!botToken.trim()) {
      setMessage({ type: 'error', text: '请先输入 Bot Token' });
      return;
    }

    setAutoGetting(true);
    setMessage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agent-config/get-chat-id`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ botToken: botToken.trim() }),
      });

      const data = await response.json();

      if (data.success) {
        setChatId(data.chatId);
        setMessage({ type: 'success', text: `✅ 成功获取 Chat ID: ${data.chatId}` });
      } else {
        setMessage({ type: 'error', text: data.error || '获取失败' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' });
    } finally {
      setAutoGetting(false);
    }
  };

  const testConnection = async () => {
    if (!botToken.trim() || !chatId.trim()) {
      setMessage({ type: 'error', text: '请填写 Bot Token 和 Chat ID' });
      return;
    }

    setTesting(true);
    setMessage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agent-config/test-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          botToken: botToken.trim(),
          chatId: chatId.trim(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ type: 'success', text: '✅ 连接成功！Agent 可以正常工作' });
      } else {
        setMessage({ type: 'error', text: data.error || '连接失败' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' });
    } finally {
      setTesting(false);
    }
  };

  // 简化版 MTProto 登录流程
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
        setMessage({ type: 'success', text: '🎉 登录成功！现在你可以以真实用户身份发送消息了' });
        setTimeout(() => {
          onClose();
        }, 2000);
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
        setMessage({ type: 'success', text: '🎉 登录成功！现在你可以以真实用户身份发送消息了' });
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setMessage({ type: 'error', text: data.error || '密码错误' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' });
    } finally {
      setSubmittingPassword(false);
    }
  };

  const saveConfig = async () => {
    if (agentType === 'telegram' && agentEnabled) {
      if (!botToken.trim() || !chatId.trim()) {
        setMessage({ type: 'error', text: '请填写完整的 Agent 配置' });
        return;
      }
    }

    setSaving(true);
    setMessage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agent-config/${roomId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          agentType,
          agentEnabled,
          agentBotToken: botToken.trim() || undefined,
          agentChatId: chatId.trim() || undefined,
        }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: '✅ 配置已保存！' });
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.error || '保存失败' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' });
    } finally {
      setSaving(false);
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
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <span>🦞</span>
            <span>Agent 设置</span>
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Agent Type */}
          <div>
            <label className="block text-sm font-semibold mb-3">Agent 类型</label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  checked={agentType === 'mock'}
                  onChange={() => setAgentType('mock')}
                  className="w-4 h-4"
                />
                <div>
                  <div className="font-medium">演示模式（推荐测试）</div>
                  <div className="text-sm text-gray-600">使用简单的关键词自动回复</div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  checked={agentType === 'telegram'}
                  onChange={() => setAgentType('telegram')}
                  className="w-4 h-4"
                />
                <div>
                  <div className="font-medium">Telegram Bot（OpenClaw）</div>
                  <div className="text-sm text-gray-600">使用 Bot 身份（主播消息会标记为"[主播]"）</div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 border-blue-300 bg-blue-50">
                <input
                  type="radio"
                  checked={agentType === 'telegram-user'}
                  onChange={() => setAgentType('telegram-user')}
                  className="w-4 h-4"
                />
                <div>
                  <div className="font-medium">🌟 Telegram 用户身份（推荐）</div>
                  <div className="text-sm text-gray-600">以你的真实用户身份发送消息（无前缀，完美融入对话）</div>
                </div>
              </label>
            </div>
          </div>

          {/* Enable Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <div className="font-semibold">启用 Agent</div>
              <div className="text-sm text-gray-600">直播时自动响应消息</div>
            </div>
            <label className="relative inline-block w-14 h-8">
              <input
                type="checkbox"
                checked={agentEnabled}
                onChange={(e) => setAgentEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-full h-full bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors"></div>
              <div className="absolute left-1 top-1 w-6 h-6 bg-white rounded-full transition-transform peer-checked:translate-x-6"></div>
            </label>
          </div>

          {/* Telegram Bot Config */}
          {agentType === 'telegram' && agentEnabled && (
            <div className="space-y-4 p-4 border border-blue-200 rounded-lg bg-blue-50">
              <h3 className="font-semibold text-lg">Telegram Bot 配置</h3>

              {/* Bot Token */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Bot Token <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <p className="text-xs text-gray-600 mt-1">
                  从 @BotFather 获取 → /mybots → 选择Bot → API Token
                </p>
              </div>

              {/* Chat ID */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Chat ID <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    placeholder="123456789"
                    className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={autoGetChatId}
                    disabled={autoGetting || !botToken.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {autoGetting ? '获取中...' : '自动获取'}
                  </button>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  点击"自动获取"前，请先给你的 Bot 发送一条消息
                </p>
              </div>

              {/* Test Connection */}
              <button
                onClick={testConnection}
                disabled={testing || !botToken.trim() || !chatId.trim()}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {testing ? '测试中...' : '🔌 测试连接'}
              </button>
            </div>
          )}

          {/* Telegram User (MTProto) Config - 简化版 */}
          {agentType === 'telegram-user' && agentEnabled && (
            <div className="space-y-4 p-4 border border-purple-200 rounded-lg bg-purple-50">
              <h3 className="font-semibold text-lg">🌟 Telegram 用户身份登录</h3>
              
              <div className="bg-white border border-purple-200 rounded p-3 text-sm">
                <p className="text-gray-700">
                  以<strong>你的真实 Telegram 用户身份</strong>发送消息（不是 Bot），Agent 完美识别！
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
                    className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
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
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      输入 Telegram 发送给你的验证码（通常是 5-6 位数字）
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
                      className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
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
                    />
                  </div>

                  <button
                    onClick={submitTwoFactorPassword}
                    disabled={submittingPassword || !twoFactorPassword.trim()}
                    className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
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
                  <p className="text-gray-600 mt-1">现在你可以以真实用户身份发送消息了</p>
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
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-6 flex gap-3 justify-end sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {agentType === 'telegram-user' && loginStep === 'done' ? '完成' : '取消'}
          </button>
          {/* 只有非 MTProto 用户身份或未完成登录时才显示保存按钮 */}
          {(agentType !== 'telegram-user' || loginStep === 'phone') && (
            <button
              onClick={saveConfig}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              {saving ? '保存中...' : '💾 保存设置'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
