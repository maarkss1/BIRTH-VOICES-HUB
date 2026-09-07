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

interface WebhookLog {
  status: number;
  body: string;
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

  // Webhooks tab: no backend yet (.agents/handoffs/onda-4/01-para-00-webhooks-tenant-fora-de-escopo.md,
  // still unowned) — state untouched from the Onda 2 mitigation, kept purely client-side/simulated.
  const [testWebhookModal, setTestWebhookModal] = useState<string | null>(null);
  const [webhookLog, setWebhookLog] = useState<WebhookLog | null>(null);

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

  const handleTestWebhook = (e: React.FormEvent) => {
    e.preventDefault();
    setWebhookLog({
      status: 200,
      body: JSON.stringify({ success: true, message: 'Evento recebido com sucesso' }, null, 2)
    });
  };

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
  };
}
