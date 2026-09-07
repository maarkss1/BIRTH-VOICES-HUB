import React from 'react';
import { Key, Webhook, Copy, Check, Plus, Trash2, RefreshCw, X, AlertTriangle, Lock, ShieldOff } from 'lucide-react';
import { useDeveloperSettings } from '../../hooks/useDeveloperSettings';
import { Badge, Button, EmptyState, Skeleton } from '../../components/design-system';

// API Keys: connected to the real backend (.agents/handoffs/onda-4/01-para-02-api-key-endpoints-prontos.md)
// — POST/GET/DELETE /api/developers/keys, admin-only within the tenant (same authorization level
// as /api/users and /api/billing/*, AGENTS.md §14/§15). See hooks/useDeveloperSettings.ts.
//
// Webhooks: intentionally left untouched — no backend exists yet for tenant-configurable webhook
// endpoints (.agents/handoffs/onda-4/01-para-00-webhooks-tenant-fora-de-escopo.md, still unowned).
// The section below already tells the truth on its own (empty state + disabled "add endpoint"
// button + local-only test simulation) since the Onda 2 mitigation — not this agent's domain to
// resolve.
export default function DevelopersPage() {
  const {
    isAdmin,
    keysState,
    fetchKeys,
    copiedId,
    newKeyName,
    setNewKeyName,
    showCreateModal,
    setShowCreateModal,
    isCreating,
    createError,
    setCreateError,
    createdKeyReveal,
    dismissCreatedKeyReveal,
    revokingId,
    revokeError,
    testWebhookModal,
    setTestWebhookModal,
    webhookLog,
    setWebhookLog,
    dialogConfirm,
    setDialogConfirm,
    handleTestWebhook,
    handleCreateKey,
    handleRevokeKey,
    handleCopy,
  } = useDeveloperSettings();

  return (
    <div className="space-y-8 max-w-5xl">
        <div className="flex justify-between items-center">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 font-sans">Configurações de Desenvolvedores</h1>
                <p className="text-sm text-slate-500 mt-1">Gerencie suas credenciais de acesso, integrações e webhooks.</p>
            </div>
        </div>

        <div className="space-y-8">
            {/* API Keys */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Key className="h-5 w-5 text-brand" />
                            API Keys
                        </h3>
                        <p className="text-sm text-slate-500">Chaves para autenticação segura via <code className="font-mono text-xs">Authorization: Bearer</code>.</p>
                    </div>
                    {isAdmin && (
                        <button
                            onClick={() => { setCreateError(null); setShowCreateModal(true); }}
                            className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg hover:opacity-90 text-sm font-medium transition-opacity"
                        >
                            <Plus className="h-4 w-4" /> Criar Chave
                        </button>
                    )}
                </div>

                {!isAdmin ? (
                    <EmptyState
                        icon={<Lock className="h-8 w-8" />}
                        title="Acesso restrito"
                        description="A gestão de chaves de API exige o papel de administrador nesta organização."
                    />
                ) : (
                    <div className="space-y-4">
                        {createdKeyReveal && (
                            <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg space-y-3">
                                <div className="flex items-start gap-2 text-amber-800 text-sm font-semibold">
                                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                    <span>
                                        Chave "{createdKeyReveal.name}" criada. Copie agora — por segurança, ela não
                                        será mostrada novamente em lugar nenhum.
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 font-mono text-xs bg-white border border-amber-200 rounded px-3 py-2 overflow-x-auto select-all">
                                        {createdKeyReveal.key}
                                    </code>
                                    <button
                                        onClick={() => handleCopy(createdKeyReveal.id, createdKeyReveal.key)}
                                        className="p-2 bg-white border border-amber-200 rounded text-amber-700 hover:border-amber-400 shrink-0"
                                        title="Copiar chave"
                                    >
                                        {copiedId === createdKeyReveal.id ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                                    </button>
                                </div>
                                <div className="flex justify-end">
                                    <Button size="sm" variant="outline" onClick={dismissCreatedKeyReveal}>
                                        Já copiei, fechar
                                    </Button>
                                </div>
                            </div>
                        )}

                        {revokeError && (
                            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm font-medium flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                <span>{revokeError}</span>
                            </div>
                        )}

                        {keysState.status === 'loading' ? (
                            <div className="space-y-3">
                                <Skeleton className="h-20 w-full" />
                                <Skeleton className="h-20 w-full" />
                            </div>
                        ) : keysState.status === 'error' ? (
                            <EmptyState
                                icon={<AlertTriangle className="h-8 w-8" />}
                                title="Não foi possível carregar as chaves de API"
                                description="Tente novamente em alguns instantes."
                                action={<Button size="sm" variant="outline" onClick={fetchKeys}>Tentar novamente</Button>}
                            />
                        ) : keysState.data.length === 0 ? (
                            <div className="text-center p-8 bg-slate-50 border border-dashed border-slate-200 rounded-lg text-slate-400">
                                Nenhuma chave de API configurada. Clique em "Criar Chave" para gerar uma.
                            </div>
                        ) : (
                            keysState.data.map((k) => (
                                <div key={k.id} className="p-4 border border-slate-200 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 hover:border-slate-300 transition-colors">
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-slate-900 text-sm">{k.name}</span>
                                            <Badge variant={k.revoked ? 'danger' : 'success'}>
                                                {k.revoked ? 'Revogada' : 'Ativa'}
                                            </Badge>
                                        </div>
                                        <div className="text-slate-400 text-xs mt-1.5 font-sans">
                                            Criada em {new Date(k.createdAt).toLocaleString('pt-BR')}
                                            {' · '}
                                            Último uso: {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString('pt-BR') : 'nunca'}
                                            {' · '}
                                            {k.expiresAt ? `Expira em ${new Date(k.expiresAt).toLocaleDateString('pt-BR')}` : 'Sem expiração'}
                                            {k.revoked && k.revokedAt && ` · Revogada em ${new Date(k.revokedAt).toLocaleString('pt-BR')}`}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 self-end md:self-center">
                                        <button
                                            onClick={() => handleRevokeKey(k.id, k.name)}
                                            disabled={k.revoked || revokingId === k.id}
                                            className="p-2 hover:bg-red-50 rounded text-slate-400 hover:text-red-650 border border-slate-200 hover:border-red-200 bg-white shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                                            title={k.revoked ? 'Chave já revogada' : 'Revogar chave de API'}
                                        >
                                            {k.revoked ? <ShieldOff className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Webhooks */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Webhook className="h-5 w-5 text-brand" />
                            Webhooks
                        </h3>
                        <p className="text-sm text-slate-500">Receba notificações de eventos em tempo real no seu servidor.</p>
                    </div>
                    <button
                        disabled
                        title="Cadastro real de endpoints de webhook ainda não implementado"
                        className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-400 rounded-lg text-sm font-medium cursor-not-allowed"
                    >
                        <Plus className="h-4 w-4" /> Adicionar Endpoint
                    </button>
                </div>

                <div className="space-y-3">
                    <div className="p-4 border border-dashed border-slate-200 rounded-lg text-sm text-slate-400 text-center">
                        Nenhum endpoint de webhook cadastrado ainda. Você pode simular uma entrega de teste abaixo.
                    </div>
                    <button
                        onClick={() => setTestWebhookModal('https://example.com/webhooks/voice')}
                        className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded hover:text-brand hover:border-brand shadow-sm transition-colors"
                    >
                        Simular envio de teste
                    </button>
                </div>
            </div>
        </div>

        {/* Test Webhook Modal */}
        {testWebhookModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-slate-900 flex items-center gap-2">
                                <RefreshCw className="h-4 w-4 text-brand" />
                                Testar Webhook
                            </h3>
                            <p className="text-xs text-slate-500 font-mono mt-1">{testWebhookModal}</p>
                        </div>
                        <button
                            onClick={() => {
                                setTestWebhookModal(null);
                                setWebhookLog(null);
                            }}
                            className="text-slate-400 hover:text-slate-600 rounded p-1"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="flex flex-col md:flex-row h-[400px]">
                        {/* Payload Config */}
                        <div className="p-5 w-full md:w-1/2 border-r border-slate-100 flex flex-col gap-4 bg-slate-50">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-2">Evento a simular</label>
                                <select className="w-full text-sm p-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-brand font-mono">
                                    <option value="call.completed">call.completed</option>
                                    <option value="call.analyzed">call.analyzed</option>
                                </select>
                            </div>
                            <div className="flex-1 flex flex-col">
                                <label className="block text-xs font-bold text-slate-600 mb-2">Corpo da Requisição (Payload)</label>
                                <textarea
                                    className="w-full flex-1 p-3 text-xs border border-slate-300 rounded font-mono bg-slate-800 text-green-400 focus:outline-none resize-none"
                                    defaultValue={JSON.stringify({ event: "call.completed", data: { call_id: "test-123", duration: 120 } }, null, 2)}
                                ></textarea>
                            </div>
                            <button
                                onClick={handleTestWebhook}
                                className="w-full py-2 bg-brand text-white text-sm font-bold rounded-lg hover:opacity-90 flex items-center justify-center gap-2 transition-opacity"
                            >
                                <Webhook className="h-4 w-4" /> Enviar Teste
                            </button>
                        </div>

                        {/* Response Log */}
                        <div className="p-5 w-full md:w-1/2 flex flex-col bg-slate-50">
                            <label className="block text-xs font-bold text-slate-600 mb-2">Logs de Resposta</label>
                            {webhookLog ? (
                                <div className="flex-1 flex flex-col gap-2">
                                    <div className={`p-2 text-xs font-bold rounded ${webhookLog.status === 200 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        Status: {webhookLog.status} OK
                                    </div>
                                    <textarea
                                        className="w-full flex-1 p-3 text-xs border border-slate-200 rounded font-mono bg-white text-slate-700 outline-none resize-none"
                                        readOnly
                                        value={webhookLog.body}
                                    ></textarea>
                                </div>
                            ) : (
                                <div className="flex-1 border border-dashed border-slate-300 rounded flex flex-col items-center justify-center text-slate-400 gap-2">
                                    <Webhook className="h-8 w-8 opacity-20" />
                                    <span className="text-xs">Aguardando envio...</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Create Key Modal */}
        {showCreateModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-bold text-slate-900 flex items-center gap-2">
                            <Key className="h-4 w-4 text-brand" />
                            Criar Nova Chave de API
                        </h3>
                        <button
                            onClick={() => setShowCreateModal(false)}
                            className="text-slate-400 hover:text-slate-600 rounded p-1"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <form onSubmit={handleCreateKey}>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Identificador da Chave</label>
                                <input
                                    type="text"
                                    value={newKeyName}
                                    placeholder="Ex: CI Pipeline, Integração AtlasGR, staging"
                                    onChange={(e) => setNewKeyName(e.target.value)}
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-sm font-sans"
                                    required
                                    autoFocus
                                    disabled={isCreating}
                                />
                            </div>
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs text-slate-500 leading-relaxed">
                                <span className="font-bold text-slate-700">Nota:</span> a chave completa é exibida
                                apenas uma vez, imediatamente após a criação. Guarde-a em local seguro — ela não
                                poderá ser recuperada depois.
                            </div>
                            {createError && (
                                <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm font-medium flex items-start gap-2">
                                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                    <span>{createError}</span>
                                </div>
                            )}
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setShowCreateModal(false)}
                                disabled={isCreating}
                                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-100 text-sm font-medium text-slate-600 transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={isCreating}
                                className="px-4 py-2 bg-brand text-white rounded-lg hover:opacity-95 text-sm font-medium transition-opacity disabled:opacity-60"
                            >
                                {isCreating ? 'Gerando...' : 'Gerar Credencial'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        {/* Custom Confirmation Modal */}
        {dialogConfirm && (
            <div className="fixed inset-0 z-55 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200 border border-slate-200">
                    <h3 className="font-bold text-slate-900 text-lg mb-2">{dialogConfirm.title}</h3>
                    <p className="text-sm text-slate-600 mb-6">{dialogConfirm.message}</p>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setDialogConfirm(null)}
                            className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-sm transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={dialogConfirm.onConfirm}
                            className="flex-1 py-2.5 bg-red-600 text-white font-bold rounded-lg text-sm hover:bg-red-750 transition-colors"
                        >
                            Revogar
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}
