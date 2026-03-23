'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { AgentConnectForInbox } from '@/components/AgentConnectForInbox';
import { useLocale } from '@/lib/i18n/LocaleContext';

function ApplyToInboxButton({ connectionId }: { connectionId: string }) {
  const { t } = useLocale();
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState(false);

  const apply = async () => {
    setApplying(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-agent-connections/apply-to-inbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ connectionId }),
      });
      const data = await res.json();
      if (data.success) setDone(true);
    } finally {
      setApplying(false);
    }
  };

  return (
    <button
      onClick={apply}
      disabled={applying || done}
      className="px-3 py-1.5 text-sm border border-lobster text-lobster rounded-lg hover:bg-lobster/5 disabled:opacity-50"
    >
      {done ? '✓ ' + t('myAgent.applied') : applying ? '...' : t('myAgent.applyToInbox')}
    </button>
  );
}

interface Connection {
  id: string;
  name: string;
  agentChatId?: string;
  phone?: string;
}

export default function MyAgentPage() {
  const { t } = useLocale();
  const router = useRouter();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const loadConnections = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user-agent-connections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections || []);
      }
    } catch {
      setConnections([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.replace('/login?redirect=/my-agent');
      return;
    }
    loadConnections();
  }, [router]);

  return (
    <MainLayout>
      <div className="container mx-auto px-6 py-8 max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('myAgent.title')}</h1>
        <p className="text-gray-600 mb-6">{t('myAgent.subtitle')}</p>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lobster" />
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-gray-900">{t('myAgent.connections')}</h2>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-lobster text-white rounded-lg font-medium hover:bg-lobster-dark transition-colors"
              >
                + {t('myAgent.addConnection')}
              </button>
            </div>

            {connections.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
                <div className="text-5xl mb-4">🤖</div>
                <p className="text-gray-600 mb-4">{t('myAgent.noConnections')}</p>
                <p className="text-sm text-gray-500 mb-6">{t('myAgent.noConnectionsHint')}</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-6 py-2 bg-lobster text-white rounded-lg font-medium hover:bg-lobster-dark"
                >
                  {t('myAgent.addConnection')}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {connections.map((conn) => (
                  <div
                    key={conn.id}
                    className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{conn.name}</p>
                      {conn.agentChatId && (
                        <p className="text-sm text-gray-500">Chat ID: {conn.agentChatId.slice(0, 12)}...</p>
                      )}
                    </div>
                    <ApplyToInboxButton connectionId={conn.id} />
                  </div>
                ))}
              </div>
            )}

            <div className="mt-8 p-4 bg-gray-50 rounded-xl text-sm text-gray-600">
              <p className="font-medium text-gray-800 mb-2">{t('myAgent.usageTitle')}</p>
              <p>{t('myAgent.usageDesc')}</p>
            </div>
          </>
        )}

        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold">{t('myAgent.addConnection')}</h2>
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                  >
                    ×
                  </button>
                </div>
                <AgentConnectForInbox
                  onSuccess={() => {
                    setShowAddModal(false);
                    loadConnections();
                  }}
                  onClose={() => setShowAddModal(false)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
