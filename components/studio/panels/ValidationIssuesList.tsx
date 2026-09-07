import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ValidationIssue } from '../../../lib/studio/types';

interface ValidationIssuesListProps {
  issues: ValidationIssue[];
  /** Headline shown when `issues` is empty. Defaults to the copy used by BottomDrawer's
   *  "Errors & Validation" tab, the original home of this markup. */
  emptyTitle?: string;
  emptyDescription?: string;
}

/**
 * Shared renderer for a `ValidationIssue[]` list — same error/warning card styling everywhere an
 * `issues[]` array reaches the user: originally BottomDrawer's "Errors & Validation" tab
 * (live ValidationEngine output), now also `VersionHistoryPanel`'s rollback-rejection surface
 * (server-side 422 `issues` from a blocked publish/rollback). Extracted so a rollback rejection
 * never has to invent its own ad-hoc error rendering — it reuses exactly what publish already
 * shows (see `.agents/handoffs/onda-6/00-para-07-studio-ui-historico-versoes.md`).
 */
export function ValidationIssuesList({
  issues,
  emptyTitle = 'Seu fluxo está 100% válido!',
  emptyDescription = 'Sem erros estruturais, de provider ou cíclicos detectados.',
}: ValidationIssuesListProps) {
  if (issues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
        <CheckCircle2 className="w-10 h-10 text-green-400 drop-shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
        <p className="text-sm font-semibold text-gray-200">{emptyTitle}</p>
        <p className="text-xs text-gray-400">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {issues.map((iss) => (
        <div
          key={iss.id}
          className={`p-3 rounded-lg border flex items-start gap-3 transition-all ${
            iss.type === 'error'
              ? 'bg-red-500/10 border-red-500/20 text-red-300 shadow-[0_0_10px_rgba(239,68,68,0.1)]'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.1)]'
          }`}
        >
          {iss.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          )}
          <div>
            <div className="text-xs font-bold flex items-center gap-1.5">
              {iss.type === 'error' ? 'Erro Crítico' : 'Alerta de Otimização'}
              {iss.nodeId && (
                <span className="font-mono text-[9px] bg-white/10 border border-white/10 px-1.5 py-0.5 rounded text-gray-400">
                  Node ID: {iss.nodeId}
                </span>
              )}
            </div>
            <p className="text-xs mt-1 font-medium">{iss.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
