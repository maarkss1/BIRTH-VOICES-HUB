import React from 'react';
import { Key, Webhook, Copy, Check, Plus, Trash2, RefreshCw, X, AlertTriangle, Lock, ShieldOff, CloudOff } from 'lucide-react';
import { useDeveloperSettings } from '../../hooks/useDeveloperSettings';
import { Badge, Button, EmptyState, Skeleton } from '../../components/design-system';

// API Keys: connected to the real backend (.agents/handoffs/onda-4/01-para-02-api-key-endpoints-prontos.md)
// — POST/GET/DELETE /api/developers/keys, admin-only within the tenant (same authorization level
// as /api/users and /api/billing/*, AGENTS.md §14/§15). See hooks/useDeveloperSettings.ts.
//
// Webhooks: connected to the real backend (Onda 5,
// .agents/handoffs/onda-5/00-para-02-conectar-developers-webhooks.md) — POST/GET/DELETE
// /api/developers/webhooks plus POST /api/developers/webhooks/:id/regenerate-secret, same
// admin-only authorization. The one-time-secret contract (AGENTS.md §13) and the 503
// "temporarily unavailable" state (persistence not deployed yet — never a fabricated empty list,
// AGENTS.md §14) are both handled in hooks/useDeveloperSettings.ts.
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
    dialogConfirm,
    setDialogConfirm,
    handleCreateKey,
    handleRevokeKey,
    handleCopy,
    webhooksState,
    fetchWebhooks,
    showCreateWebhookModal,
    setShowCreateWebhookModal,
    newWebhookUrl,
    setNewWebhookUrl,
    newWebhookEvents,
    setNewWebhookEvents,
    isCreatingWebhook,
    createWebhookError,
    setCreateWebhookError,
    createdWebhookSecretReveal,
    dismissCreatedWebhookSecretReveal,
    deletingWebhookId,
    regeneratingWebhookId,
    webhookActionError,
    handleCreateWebhook,
    handleDeleteWebhook,
    handleRegenerateWebhookSecret,
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
                    {isAdmin && (
                        <button
                            onClick={() => { setCreateWebhookError(null); setShowCreateWebhookModal(true); }}
                            className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg hover:opacity-90 text-sm font-medium transition-opacity"
                        >
                            <Plus className="h-4 w-4" /> Adicionar Endpoint
                        </button>
                    )}
                </div>

                {!isAdmin ? (
                    <EmptyState
                        icon={<Lock className="h-8 w-8" />}
                        title="Acesso restrito"
                        description="A gestão de endpoints de webhook exige o papel de administrador nesta organização."
                    />
                ) : (
                    <div className="space-y-4">
                        {createdWebhookSecretReveal && (
                            <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg space-y-3">
                                <div className="flex items-start gap-2 text-amber-800 text-sm font-semibold">
                                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                    <span>
                                        Segredo do endpoint "{createdWebhookSecretReveal.url}" gerado. Copie agora —
                                        por segurança, ele não será mostrado novamente em lugar nenhum. Use o
                                        SHA-256 deste valor como chave HMAC ao verificar a assinatura das entregas.
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 font-mono text-xs bg-white border border-amber-200 rounded px-3 py-2 overflow-x-auto select-all">
                                        {createdWebhookSecretReveal.secret}
                                    </code>
                                    <button
                                        onClick={() => handleCopy(createdWebhookSecretReveal.id, createdWebhookSecretReveal.secret)}
                                        className="p-2 bg-white border border-amber-200 rounded text-amber-700 hover:border-amber-400 shrink-0"
                                        title="Copiar segredo"
                                    >
                                        {copiedId === createdWebhookSecretReveal.id ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                                    </button>
                                </div>
                                <div className="flex justify-end">
                                    <Button size="sm" variant="outline" onClick={dismissCreatedWebhookSecretReveal}>
                                        Já copiei, fechar
                                    </Button>
                                </div>
                            </div>
                        )}

                        {webhookActionError && (
                            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm font-medium flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                <span>{webhookActionError}</span>
                            </div>
                        )}

                        {webhooksState.status === 'loading' ? (
                            <div className="space-y-3">
                                <Skeleton className="h-20 w-full" />
                                <Skeleton className="h-20 w-full" />
                            </div>
                        ) : webhooksState.status === 'unavailable' ? (
                            <EmptyState
                                icon={<CloudOff className="h-8 w-8" />}
                                title="Funcionalidade temporariamente indisponível"
                                description="O cadastro de endpoints de webhook está em implantação nesta versão. Tente novamente em breve."
                                action={<Button size="sm" variant="outline" onClick={fetchWebhooks}>Tentar novamente</Button>}
                            />
                        ) : webhooksState.status === 'error' ? (
                            <EmptyState
                                icon={<AlertTriangle className="h-8 w-8" />}
                                title="Não foi possível carregar os endpoints de webhook"
                                description="Tente novamente em alguns instantes."
                                action={<Button size="sm" variant="outline" onClick={fetchWebhooks}>Tentar novamente</Button>}
                            />
                        ) : webhooksState.data.length === 0 ? (
                            <div className="text-center p-8 bg-slate-50 border border-dashed border-slate-200 rounded-lg text-slate-400">
                                Nenhum endpoint de webhook cadastrado ainda. Clique em "Adicionar Endpoint" para
                                configurar um.
                            </div>
                        ) : (
                            webhooksState.data.map((w) => (
                                <div key={w.id} className="p-4 border border-slate-200 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 hover:border-slate-300 transition-colors">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-slate-900 text-sm font-mono break-all">{w.url}</span>
                                            <Badge variant={w.active ? 'success' : 'danger'}>
                                                {w.active ? 'Ativo' : 'Inativo'}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                                            {w.events.map((event) => (
                                                <Badge key={event} variant="secondary">{event}</Badge>
                                            ))}
                                        </div>
                                        <div className="text-slate-400 text-xs mt-1.5 font-sans">
                                            Criado em {new Date(w.createdAt).toLocaleString('pt-BR')}
                                            {' · '}
                                            Última entrega: {w.lastDeliveryAt
                                                ? `${new Date(w.lastDeliveryAt).toLocaleString('pt-BR')} (${w.lastDeliveryStatus ?? 'sem status'})`
                                                : 'nenhuma ainda'}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 self-end md:self-center shrink-0">
                                        <button
                                            onClick={() => handleRegenerateWebhookSecret(w.id, w.url)}
                                            disabled={regeneratingWebhookId === w.id || deletingWebhookId === w.id}
                                            className="p-2 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 border border-slate-200 bg-white shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                                            title="Regenerar segredo do webhook"
                                        >
                                            <RefreshCw className={`h-4 w-4 ${regeneratingWebhookId === w.id ? 'animate-spin' : ''}`} />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteWebhook(w.id, w.url)}
                                            disabled={deletingWebhookId === w.id || regeneratingWebhookId === w.id}
                                            className="p-2 hover:bg-red-50 rounded text-slate-400 hover:text-red-650 border border-slate-200 hover:border-red-200 bg-white shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                                            title="Remover endpoint de webhook"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>

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

        {/* Create Webhook Endpoint Modal */}
        {showCreateWebhookModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-bold text-slate-900 flex items-center gap-2">
                            <Webhook className="h-4 w-4 text-brand" />
                            Adicionar Endpoint de Webhook
                        </h3>
                        <button
                            onClick={() => setShowCreateWebhookModal(false)}
                            className="text-slate-400 hover:text-slate-600 rounded p-1"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <form onSubmit={handleCreateWebhook}>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">URL do Endpoint</label>
                                <input
                                    type="url"
                                    value={newWebhookUrl}
                                    placeholder="https://seu-servidor.com/webhooks/voice"
                                    onChange={(e) => setNewWebhookUrl(e.target.value)}
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-sm font-mono"
                                    required
                                    autoFocus
                                    disabled={isCreatingWebhook}
                                />
                                <p className="text-xs text-slate-400 mt-1.5">
                                    Deve ser uma URL pública em HTTPS — não pode apontar para rede interna/privada.
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Eventos</label>
                                <input
                                    type="text"
                                    value={newWebhookEvents}
                                    placeholder="agent.call.ended ou * para todos os eventos"
                                    onChange={(e) => setNewWebhookEvents(e.target.value)}
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-sm font-mono"
                                    required
                                    disabled={isCreatingWebhook}
                                />
                                <p className="text-xs text-slate-400 mt-1.5">
                                    Separe múltiplos tipos de evento por vírgula ou espaço (até 20). Use "*" para
                                    assinar todos os eventos.
                                </p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs text-slate-500 leading-relaxed">
                                <span className="font-bold text-slate-700">Nota:</span> o segredo de assinatura
                                completo é exibido apenas uma vez, imediatamente após a criação. Guarde-o em local
                                seguro — ele não poderá ser recuperado depois, apenas regenerado.
                            </div>
                            {createWebhookError && (
                                <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm font-medium flex items-start gap-2">
                                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                    <span>{createWebhookError}</span>
                                </div>
                            )}
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setShowCreateWebhookModal(false)}
                                disabled={isCreatingWebhook}
                                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-100 text-sm font-medium text-slate-600 transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={isCreatingWebhook}
                                className="px-4 py-2 bg-brand text-white rounded-lg hover:opacity-95 text-sm font-medium transition-opacity disabled:opacity-60"
                            >
                                {isCreatingWebhook ? 'Criando...' : 'Criar Endpoint'}
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
                            {dialogConfirm.confirmLabel ?? 'Confirmar'}
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}
