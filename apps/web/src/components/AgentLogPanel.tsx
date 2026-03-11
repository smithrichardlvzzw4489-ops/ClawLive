'use client';

import { AgentLog } from '@clawlive/shared-types';
import { format } from 'date-fns';

interface AgentLogPanelProps {
  logs: AgentLog[];
}

export function AgentLogPanel({ logs }: AgentLogPanelProps) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden flex flex-col max-h-[300px]">
      <div className="bg-gray-100 px-4 py-2 border-b">
        <h3 className="font-semibold text-gray-700">🤖 Agent 日志</h3>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {logs.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">暂无日志</p>
        ) : (
          logs.slice(-20).reverse().map((log) => (
            <div
              key={log.id}
              className={`text-xs p-2 rounded ${
                log.status === 'success'
                  ? 'bg-green-50 text-green-800'
                  : log.status === 'error'
                  ? 'bg-red-50 text-red-800'
                  : 'bg-blue-50 text-blue-800'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold">
                  {log.status === 'success' ? '✅' : log.status === 'error' ? '❌' : '⏳'}{' '}
                  {log.action}
                </span>
                <span className="opacity-60">
                  {format(new Date(log.timestamp), 'HH:mm:ss')}
                </span>
              </div>
              {log.details && Object.keys(log.details).length > 0 && (
                <pre className="text-xs opacity-70 overflow-x-auto">
                  {JSON.stringify(log.details, null, 2)}
                </pre>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
