import React, { useState } from 'react';
import { LiveSupervisor } from '../../components/LiveSupervisor/LiveSupervisor';
import { PhoneCall, Info } from 'lucide-react';

export default function SupervisionPage() {
  // There is currently no backend endpoint that lists active calls tenant-wide for a supervisor
  // (GET /api/sessions only returns the requesting user's own sessions, and real phone-call
  // sessions are created with userId: null — see handoff
  // .agents/handoffs/onda-4/11-para-05-active-sessions-endpoint.md). Rather than fabricate a
  // roster of fake in-progress calls (AGENTS.md §14), a supervisor watches a specific call by
  // entering the session/call id they already have from ops tooling or a CallLog entry, until
  // that endpoint exists.
  const [sessionIdInput, setSessionIdInput] = useState('');
  const [activeSession, setActiveSession] = useState<string | null>(null);

  const handleWatch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = sessionIdInput.trim();
    if (trimmed) setActiveSession(trimmed);
  };

  return (
    <div className="h-full flex flex-col -m-8">
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <PhoneCall className="w-6 h-6 text-indigo-600" />
          Supervisão ao Vivo
        </h1>
        <p className="text-gray-500 mt-1">Acompanhe métricas emocionais e cognitivas em tempo real durante chamadas ativas.</p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Watch-by-id panel */}
        <div className="w-80 bg-slate-50 border-r border-gray-200 overflow-y-auto p-4">
          <h3 className="font-semibold text-gray-700 mb-3">Acompanhar chamada</h3>

          <form onSubmit={handleWatch} className="space-y-2">
            <label htmlFor="session-id-input" className="block text-xs font-medium text-gray-500">
              ID da sessão / chamada
            </label>
            <input
              id="session-id-input"
              type="text"
              value={sessionIdInput}
              onChange={(e) => setSessionIdInput(e.target.value)}
              placeholder="ex.: sess-1a2b3c"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              type="submit"
              disabled={!sessionIdInput.trim()}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Acompanhar
            </button>
          </form>

          <div className="mt-4 p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-800 flex gap-2">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Uma lista de chamadas ativas do tenant em tempo real ainda depende de um endpoint dedicado
              (ver handoff ao Agente 05). Até lá, informe o id da sessão que deseja supervisionar.
            </span>
          </div>
        </div>

        {/* Live Supervisor Component */}
        <div className="flex-1 p-6 bg-slate-100 overflow-hidden">
          {activeSession ? (
            <LiveSupervisor sessionId={activeSession} />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400 text-center px-8">
              Informe o id de uma chamada ativa ao lado para começar a monitorar em tempo real.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
