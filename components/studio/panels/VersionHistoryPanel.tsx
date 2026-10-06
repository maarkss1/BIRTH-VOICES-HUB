import React, { useEffect, useState } from 'react';
import { X, History, RotateCcw, Loader2, ShieldAlert, Clock, CheckCircle2 } from 'lucide-react';
import { useStudioStore } from '../../../store/useStudioStore';
import { ValidationIssuesList } from './ValidationIssuesList';

function formatPublishedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * "Histórico de Publicações" — lists every archived `WorkflowVersion` for the workflow currently
 * open in the Studio (`GET /workflow/:id/versions`) and lets the user restore one
 * (`POST /workflow/:id/versions/:version/rollback`), gated behind an explicit inline confirmation
 * since rollback replaces the live published content. A version rejected by the same
 * ValidationEngine/runtime-compatibility gate as a fresh publish surfaces its `issues[]` via the
 * same `ValidationIssuesList` publish already uses (see
 * `.agents/handoffs/onda-6/00-para-07-studio-ui-historico-versoes.md`) — never a silent failure.
 *
 * All data here comes straight from the store's `workflowVersions`/`rollbackIssues`, themselves
 * populated only by the real endpoints above (`store/useStudioStore.ts`); nothing is fabricated
 * client-side (AGENTS.md §14), and every request is scoped to this session's own `workflowId`
 * (AGENTS.md §15 — the server independently re-derives tenant ownership from `req.tenantId`).
 */
export function VersionHistoryPanel() {
  const {
    isVersionHistoryOpen,
    closeVersionHistory,
    workflowVersions,
    versionHistoryState,
    versionHistoryError,
    fetchWorkflowVersions,
    rollbackWorkflowToVersion,
    rollbackState,
    rollbackIssues,
    rollbackError,
    rollbackTargetVersion
  } = useStudioStore();

  const [confirmingVersion, setConfirmingVersion] = useState<number | null>(null);

  useEffect(() => {
    if (isVersionHistoryOpen) {
      fetchWorkflowVersions();
    } else {
      setConfirmingVersion(null);
    }
  }, [isVersionHistoryOpen, fetchWorkflowVersions]);

  if (!isVersionHistoryOpen) return null;

  const isRollingBack = rollbackState === 'rolling-back';

  const handleConfirmRollback = async (version: number) => {
    setConfirmingVersion(null);
    await rollbackWorkflowToVersion(version);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="w-[560px] max-h-[80vh] bg-slate-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-slate-700/50">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-white font-semibold leading-none mb-1">Histórico de Publicações</h3>
              <p className="text-gray-400 text-xs">Versões publicadas deste fluxo, mais recente primeiro.</p>
            </div>
          </div>
          <button
            onClick={closeVersionHistory}
            aria-label="Fechar histórico de publicações"
            className="p-2 text-slate-400 hover:bg-slate-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Rollback outcome: never silent, always surfaced (success banner or the same issues[]
            list publish uses for a 422). */}
        {rollbackState === 'error' && (
          <div className="px-4 py-3 bg-red-500/10 border-b border-red-500/20 text-red-300 text-xs shrink-0">
            <div className="flex items-center gap-2 font-semibold mb-1">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              {rollbackError || 'Rollback bloqueado pela validação do fluxo.'}
            </div>
            {rollbackIssues.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto">
                <ValidationIssuesList issues={rollbackIssues} />
              </div>
            )}
          </div>
        )}
        {rollbackState === 'success' && (
          <div className="px-4 py-2 bg-green-500/10 border-b border-green-500/20 text-green-300 text-xs font-semibold flex items-center gap-2 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Versão restaurada e publicada com sucesso.
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-900/50">
          {versionHistoryState === 'loading' && (
            <div className="flex items-center justify-center py-10 text-gray-400 text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando histórico...
            </div>
          )}

          {versionHistoryState === 'error' && (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
              <ShieldAlert className="w-8 h-8 text-red-400" />
              <p className="text-sm text-red-300 font-semibold">{versionHistoryError}</p>
              <button
                onClick={() => fetchWorkflowVersions()}
                className="mt-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {versionHistoryState === 'idle' && workflowVersions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
              <Clock className="w-8 h-8 text-gray-500" />
              <p className="text-sm text-gray-300 font-semibold">Nenhuma versão publicada ainda.</p>
              <p className="text-xs text-gray-500">Publique este fluxo para começar a acumular histórico.</p>
            </div>
          )}

          {versionHistoryState === 'idle' &&
            workflowVersions.map((v) => (
              <div
                key={v.version}
                className="p-3 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-100">v{v.version}</span>
                    <span className="text-[10px] font-mono text-gray-500">{formatPublishedAt(v.publishedAt)}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                    Publicado por {v.publishedBy || 'usuário desconhecido'}
                  </p>
                </div>

                {confirmingVersion === v.version ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-amber-300 font-semibold mr-1">Confirma?</span>
                    <button
                      onClick={() => handleConfirmRollback(v.version)}
                      disabled={isRollingBack}
                      className="px-2 py-1 rounded-md bg-red-600/90 hover:bg-red-500 text-white text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Sim, restaurar
                    </button>
                    <button
                      onClick={() => setConfirmingVersion(null)}
                      disabled={isRollingBack}
                      className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-gray-300 text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingVersion(v.version)}
                    disabled={isRollingBack}
                    aria-label={`Restaurar versão ${v.version}`}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    {isRollingBack && rollbackTargetVersion === v.version ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                    Restaurar esta versão
                  </button>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
