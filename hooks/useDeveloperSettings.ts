import { useCallback, useEffect, useState } from 'react';
import { useSessionStore } from '../store/useSessionStore';
import { logger } from '../lib/logger';

// Real backend now exists for API Keys (.agents/handoffs/onda-4/01-para-02-api-key-endpoints-prontos.md):
// POST/GET/DELETE /api/developers/keys, admin-only within the tenant (403 for other roles) — same
// authorization level as GET /api/users and /api/billing/* (AGENTS.md §14/§15).
export interface ApiKeyMetadata {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revoked: boolean;
  revokedAt: string | null;
}

type ApiKeysState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: ApiKeyMetadata[] };

interface DialogConfirmState {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
}

// The plaintext key exists in the frontend ONLY between a successful create response and the
// admin dismissing this banner — never persisted to state that survives a refresh, never part of
// ApiKeyMetadata, never shown again after dismissal (AGENTS.md §13: the backend itself never
// returns it a second time, so there is nothing to re-fetch even if we wanted to).
interface CreatedKeyReveal {
  id: string;
  name: string;
  key: string;
}

// Webhook endpoints: real backend now exists (Onda 5,
// .agents/handoffs/onda-5/00-para-02-conectar-developers-webhooks.md), same admin-only
// authorization level as API keys — POST/GET/DELETE /api/developers/webhooks plus
// POST /api/developers/webhooks/:id/regenerate-secret. Metadata never includes the secret or its
// hash; the plaintext secret is only ever present in a create/regenerate response, exactly once
// (AGENTS.md §13), same shape as ApiKeyMetadata/CreatedKeyReveal above.
export interface WebhookEndpointMetadata {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastDeliveryAt: string | null;
  lastDeliveryStatus: string | null;
}

type WebhookEndpointsState =
  | { status: 'loading' }
  | { status: 'error' }
  // 503 from the backend: the tenant-scoped persistence for webhook endpoints has not been
  // deployed yet (see webhookEndpoint.controller.ts's WebhookEndpointSchemaNotReadyError handling).
  // Must never be rendered as an empty list — that would fabricate "nenhum endpoint configurado"
  // for a tenant that may well have endpoints once persistence lands (AGENTS.md §14).
  | { status: 'unavailable' }
  | { status: 'ready'; data: WebhookEndpointMetadata[] };

interface CreatedWebhookSecretReveal {
  id: string;
  url: string;
  secret: string;
}

export function useDeveloperSettings() {
  const sessionUser = useSessionStore((state) => state.user);
  const isAdmin = sessionUser?.role === 'admin';

  const [keysState, setKeysState] = useState<ApiKeysState>({ status: 'loading' });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdKeyReveal, setCreatedKeyReveal] = useState<CreatedKeyReveal | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [dialogConfirm, setDialogConfirm] = useState<DialogConfirmState | null>(null);

  // Webhook endpoints: real backend now connected (see WebhookEndpointsState above). Deliberately
  // no client-side "simulate test send" here anymore — the previous Onda 2 placeholder faked a 200
  // response without contacting anything, and there is no test-send endpoint in the real contract
  // to back it; keeping a fabricated success response next to real endpoint management would read
  // as real delivery evidence when it isn't (AGENTS.md §14).
  const [webhooksState, setWebhooksState] = useState<WebhookEndpointsState>({ status: 'loading' });
  const [showCreateWebhookModal, setShowCreateWebhookModal] = useState(false);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookEvents, setNewWebhookEvents] = useState('');
  const [isCreatingWebhook, setIsCreatingWebhook] = useState(false);
  const [createWebhookError, setCreateWebhookError] = useState<string | null>(null);
  const [createdWebhookSecretReveal, setCreatedWebhookSecretReveal] = useState<CreatedWebhookSecretReveal | null>(null);
  const [deletingWebhookId, setDeletingWebhookId] = useState<string | null>(null);
  const [webhookActionError, setWebhookActionError] = useState<string | null>(null);
  const [regeneratingWebhookId, setRegeneratingWebhookId] = useState<string | null>(null);

  const fetchKeys = useCallback(() => {
    if (!isAdmin) return;
    setKeysState({ status: 'loading' });
    fetch('/api/developers/keys')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { apiKeys: ApiKeyMetadata[] }) => {
        setKeysState({ status: 'ready', data: Array.isArray(data.apiKeys) ? data.apiKeys : [] });
      })
      .catch((err) => {
        logger.error('Failed to load API keys', { err });
        setKeysState({ status: 'error' });
      });
  }, [isAdmin]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const fetchWebhooks = useCallback(() => {
    if (!isAdmin) return;
    setWebhooksState({ status: 'loading' });
    fetch('/api/developers/webhooks')
      .then(async (res) => {
        if (res.status === 503) {
          setWebhooksState({ status: 'unavailable' });
          return null;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { webhookEndpoints: WebhookEndpointMetadata[] } | null) => {
        if (data === null) return; // already handled as 'unavailable' above
        setWebhooksState({ status: 'ready', data: Array.isArray(data.webhookEndpoints) ? data.webhookEndpoints : [] });
      })
      .catch((err) => {
        logger.error('Failed to load webhook endpoints', { err });
        setWebhooksState({ status: 'error' });
      });
  }, [isAdmin]);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newKeyName.trim();
    if (!name) return;

    setIsCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/developers/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      // Shown once, in this response only — never fetchable again afterwards.
      setCreatedKeyReveal({ id: data.apiKey.id, name: data.apiKey.name, key: data.key });
      setNewKeyName('');
      setShowCreateModal(false);
      fetchKeys();
    } catch (err) {
      logger.error('Failed to create API key', { err });
      setCreateError(err instanceof Error ? err.message : 'Não foi possível criar a chave de API.');
    } finally {
      setIsCreating(false);
    }
  };

  const dismissCreatedKeyReveal = () => setCreatedKeyReveal(null);

  const handleRevokeKey = (id: string, name: string) => {
    setDialogConfirm({
      title: 'Revogar Chave de API',
      message: `Tem certeza de que deseja revogar a chave "${name}"? Quaisquer aplicações ou SDKs que utilizem esta chave deixarão de funcionar imediatamente.`,
      confirmLabel: 'Revogar',
      onConfirm: async () => {
        setDialogConfirm(null);
        setRevokingId(id);
        setRevokeError(null);
        try {
          const res = await fetch(`/api/developers/keys/${id}`, { method: 'DELETE' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          fetchKeys();
        } catch (err) {
          logger.error('Failed to revoke API key', { err });
          setRevokeError(err instanceof Error ? err.message : 'Não foi possível revogar a chave de API.');
        } finally {
          setRevokingId(null);
        }
      }
    });
  };

  // events: free-text, comma/whitespace-separated (e.g. "agent.call.ended, lead.qualified" or
  // "*" for all event types) — parsed client-side into the array createWebhookEndpointSchema
  // expects. No curated event picker here: the platform does not expose a stable, versioned
  // catalog of event types today (only `agent.call.ended` is actually dispatched in production —
  // see telephonyService.ts), so presenting a dropdown of options would imply a completeness that
  // does not exist (AGENTS.md §14).
  function parseWebhookEvents(raw: string): string[] {
    return Array.from(new Set(raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)));
  }

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = newWebhookUrl.trim();
    const events = parseWebhookEvents(newWebhookEvents);
    if (!url || events.length === 0) return;

    setIsCreatingWebhook(true);
    setCreateWebhookError(null);
    try {
      const res = await fetch('/api/developers/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, events }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) {
        throw new Error(data.error || 'Endpoints de webhook por tenant ainda não estão disponíveis nesta implantação.');
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      // Shown once, in this response only — never fetchable again afterwards (AGENTS.md §13).
      setCreatedWebhookSecretReveal({
        id: data.webhookEndpoint.id,
        url: data.webhookEndpoint.url,
        secret: data.secret,
      });
      setNewWebhookUrl('');
      setNewWebhookEvents('');
      setShowCreateWebhookModal(false);
      fetchWebhooks();
    } catch (err) {
      logger.error('Failed to create webhook endpoint', { err });
      setCreateWebhookError(err instanceof Error ? err.message : 'Não foi possível criar o endpoint de webhook.');
    } finally {
      setIsCreatingWebhook(false);
    }
  };

  const dismissCreatedWebhookSecretReveal = () => setCreatedWebhookSecretReveal(null);

  const handleDeleteWebhook = (id: string, url: string) => {
    setDialogConfirm({
      title: 'Remover Endpoint de Webhook',
      message: `Tem certeza de que deseja remover o endpoint "${url}"? Ele deixará de receber eventos imediatamente e esta ação não pode ser desfeita.`,
      confirmLabel: 'Remover',
      onConfirm: async () => {
        setDialogConfirm(null);
        setDeletingWebhookId(id);
        setWebhookActionError(null);
        try {
          const res = await fetch(`/api/developers/webhooks/${id}`, { method: 'DELETE' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          fetchWebhooks();
        } catch (err) {
          logger.error('Failed to delete webhook endpoint', { err });
          setWebhookActionError(err instanceof Error ? err.message : 'Não foi possível remover o endpoint de webhook.');
        } finally {
          setDeletingWebhookId(null);
        }
      }
    });
  };

  const handleRegenerateWebhookSecret = (id: string, url: string) => {
    setDialogConfirm({
      title: 'Regenerar Segredo do Webhook',
      message: `Regenerar o segredo de "${url}" invalida imediatamente o segredo atual — qualquer verificação de assinatura feita pelo seu servidor com o segredo anterior passará a falhar até você atualizá-lo. Deseja continuar?`,
      confirmLabel: 'Regenerar',
      onConfirm: async () => {
        setDialogConfirm(null);
        setRegeneratingWebhookId(id);
        setWebhookActionError(null);
        try {
          const res = await fetch(`/api/developers/webhooks/${id}/regenerate-secret`, { method: 'POST' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          setCreatedWebhookSecretReveal({
            id: data.webhookEndpoint.id,
            url: data.webhookEndpoint.url,
            secret: data.secret,
          });
          fetchWebhooks();
        } catch (err) {
          logger.error('Failed to regenerate webhook secret', { err });
          setWebhookActionError(err instanceof Error ? err.message : 'Não foi possível regenerar o segredo do webhook.');
        } finally {
          setRegeneratingWebhookId(null);
        }
      }
    });
  };

  const handleCopy = (id: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((current) => (current === id ? null : current));
    }, 2000);
  };

  return {
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
  };
}
