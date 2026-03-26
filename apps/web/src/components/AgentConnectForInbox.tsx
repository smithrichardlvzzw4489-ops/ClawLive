'use client';

import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';

interface UserConnection {
  id: string;
  name: string;
  agentChatId?: string;
  phone?: string;
}

interface AgentConnectForInboxProps {
  onSuccess: () => void;
  onClose: () => void;
}

export function AgentConnectForInbox({ onSuccess, onClose }: AgentConnectForInboxProps) {
  const [connections, setConnections] = useState<UserConnection[]>([]);
  const [connectionChoice, setConnectionChoice] = useState<'choice' | 'existing' | 'new'>('choice');
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
  const [sendingCode, setSendingCode] = useState(false);
  const [submittingCode, setSubmittingCode] = useState(false);
  const [submittingPassword, setSubmittingPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  const applyExistingConnection = async () => {
    if (!selectedConnectionId) {
      setMessage({ type: 'error', text: '请选择一个连接' });
      return;
    }
    setApplyingConnection(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/user-agent-connections/apply-to-inbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ connectionId: selectedConnectionId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '应用失败');
      setMessage({ type: 'success', text: '✅ 连接成功！' });
      setTimeout(() => onSuccess(), 800);
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
        setMessage({ type: 'success', text: '✅ 验证码已发送到你的手机' });
      } else {
        setMessage({ type: 'error', text: data.error || '发送失败' });
      }
    } catch {
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
      if (data.needsPassword) {
        setLoginStep('password');
        setPasswordHint(data.passwordHint || '');
        setMessage({ type: 'success', text: '✅ 验证码正确，请输入两步验证密码' });
      } else if (data.success) {
          const applyRes = await fetch(`${API_BASE_URL}/api/user-agent-connections/apply-to-inbox`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ connectionId: data.connection.id }),
          });
          if (!(await applyRes.json()).success) throw new Error('应用失败');
          setMessage({ type: 'success', text: '✅ 连接成功！' });
        setTimeout(() => onSuccess(), 800);
      } else {
        setMessage({ type: 'error', text: data.error || '验证码错误' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '失败' });
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
          name: connectionName,
          agentChatId: chatId,
          phoneNumber: phoneNumber,
        }),
      });
      const data = await response.json();
      if (data.success) {
        const applyRes = await fetch(`${API_BASE_URL}/api/user-agent-connections/apply-to-inbox`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ connectionId: data.connection.id }),
        });
        if (!(await applyRes.json()).success) throw new Error('应用失败');
        setMessage({ type: 'success', text: '✅ 连接成功！' });
        setTimeout(() => onSuccess(), 800);
      } else {
        setMessage({ type: 'error', text: data.error || '密码错误' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '失败' });
    } finally {
      setSubmittingPassword(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4">
        <p className="text-sm text-purple-900">以你的 Telegram 身份与 Agent 实时对话</p>
      </div>

      {connectionChoice === 'choice' && (
        <div className="space-y-3">
          {connections.length > 0 && (
            <>
              <label className="block text-sm font-medium text-gray-700">使用已有连接</label>
              <select
                value={selectedConnectionId}
                onChange={(e) => setSelectedConnectionId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">-- 选择 --</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>
                ))}
              </select>
              <button
                onClick={applyExistingConnection}
                disabled={applyingConnection || !selectedConnectionId}
                className="w-full py-2 bg-lobster text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {applyingConnection ? '连接中...' : '应用'}
              </button>
              <div className="text-center text-gray-500 text-sm">或</div>
            </>
          )}
          <button
            onClick={() => setConnectionChoice('new')}
            className="w-full py-2 border-2 border-dashed border-lobster text-lobster rounded-lg text-sm font-medium"
          >
            + 新建连接
          </button>
        </div>
      )}

      {connectionChoice === 'new' && loginStep === 'phone' && (
        <div className="space-y-3">
          <input
            placeholder="连接名称"
            value={connectionName}
            onChange={(e) => setConnectionName(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <input
            placeholder="手机号 +86138..."
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <input
            placeholder="Agent Chat ID @xxx"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <div className="flex gap-2">
            <button onClick={() => setConnectionChoice('choice')} className="flex-1 py-2 border rounded-lg text-sm">
              返回
            </button>
            <button
              onClick={sendVerificationCode}
              disabled={sendingCode || !phoneNumber.trim() || !chatId.trim() || !connectionName.trim()}
              className="flex-1 py-2 bg-lobster text-white rounded-lg text-sm disabled:opacity-50"
            >
              {sendingCode ? '发送中...' : '发送验证码'}
            </button>
          </div>
        </div>
      )}

      {connectionChoice === 'new' && loginStep === 'code' && (
        <div className="space-y-3">
          <p className="text-sm text-green-700">验证码已发送，请查看 Telegram</p>
          <input
            placeholder="验证码"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-center text-lg"
            maxLength={6}
          />
          <div className="flex gap-2">
            <button onClick={() => setLoginStep('phone')} className="flex-1 py-2 border rounded-lg text-sm">返回</button>
            <button
              onClick={submitVerificationCode}
              disabled={submittingCode || !verificationCode.trim()}
              className="flex-1 py-2 bg-lobster text-white rounded-lg text-sm disabled:opacity-50"
            >
              {submittingCode ? '验证中...' : '提交'}
            </button>
          </div>
        </div>
      )}

      {connectionChoice === 'new' && loginStep === 'password' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">请输入两步验证密码{passwordHint ? `（${passwordHint}）` : ''}</p>
          <input
            type="password"
            placeholder="密码"
            value={twoFactorPassword}
            onChange={(e) => setTwoFactorPassword(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <div className="flex gap-2">
            <button onClick={() => setLoginStep('code')} className="flex-1 py-2 border rounded-lg text-sm">返回</button>
            <button
              onClick={submitTwoFactorPassword}
              disabled={submittingPassword || !twoFactorPassword.trim()}
              className="flex-1 py-2 bg-lobster text-white rounded-lg text-sm disabled:opacity-50"
            >
              {submittingPassword ? '验证中...' : '提交'}
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className={`mt-3 p-2 rounded text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <button onClick={onClose} className="mt-4 w-full py-2 text-gray-500 hover:text-gray-700 text-sm">
        关闭
      </button>
    </div>
  );
}
