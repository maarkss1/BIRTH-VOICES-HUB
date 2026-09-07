import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac, createHash } from 'crypto';

vi.mock('../repositories/webhookEndpointRepository.js', () => ({
  countActiveEndpointsForTenant: vi.fn(),
  createEndpoint: vi.fn(),
  listEndpointsForTenant: vi.fn(),
  listActiveEndpointsForTenant: vi.fn(),
  findEndpointForTenant: vi.fn(),
  findActiveEndpointById: vi.fn(),
  deleteEndpoint: vi.fn(),
  regenerateSecret: vi.fn(),
  recordDeliveryResult: vi.fn(),
}));

import * as webhookEndpointRepository from '../repositories/webhookEndpointRepository.js';
import {
  MAX_ACTIVE_WEBHOOK_ENDPOINTS_PER_TENANT,
  WebhookEndpointServiceError,
  createWebhookEndpointForTenant,
  deleteWebhookEndpointForTenant,
  findActiveSigningSecretHash,
  hashWebhookSecret,
  listWebhookEndpointsForTenant,
  regenerateWebhookEndpointSecret,
  resolveActiveEndpointsForEvent,
} from './webhookEndpointService.js';

type Row = webhookEndpointRepository.TenantWebhookEndpointRecord;

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'ep-1',
    tenantId: 'tenant-a',
    url: 'https://example.com/hooks/birthvoices',
    secretHash: 'deadbeef',
    events: ['call.completed'],
    active: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    lastDeliveryAt: null,
    lastDeliveryStatus: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('webhookEndpointService.createWebhookEndpointForTenant', () => {
  it('returns the plaintext secret exactly once and only the SHA-256 hash reaches the repository', async () => {
    vi.mocked(webhookEndpointRepository.countActiveEndpointsForTenant).mockResolvedValue(0);
    vi.mocked(webhookEndpointRepository.createEndpoint).mockImplementation(async (data) =>
      makeRow({ tenantId: data.tenantId, url: data.url, secretHash: data.secretHash, events: data.events }),
    );

    const result = await createWebhookEndpointForTenant('tenant-a', {
      url: 'https://example.com/hooks/birthvoices',
      events: ['call.completed'],
    });

    expect(result.secret.startsWith('whsec_')).toBe(true);

    const call = vi.mocked(webhookEndpointRepository.createEndpoint).mock.calls[0][0];
    expect(call.tenantId).toBe('tenant-a');
    // The hash sent to the repository must never equal (or contain) the plaintext secret...
    expect(call.secretHash).not.toBe(result.secret);
    expect(call.secretHash).not.toContain(result.secret);
    // ...and must be exactly the SHA-256 hex digest of it (this is also the HMAC signing key
    // webhook.worker.ts uses later, see findActiveSigningSecretHash).
    expect(call.secretHash).toBe(createHash('sha256').update(result.secret).digest('hex'));
  });

  it('rejects creation once the tenant already has 5 active endpoints (contract limit)', async () => {
    expect(MAX_ACTIVE_WEBHOOK_ENDPOINTS_PER_TENANT).toBe(5);
    vi.mocked(webhookEndpointRepository.countActiveEndpointsForTenant).mockResolvedValue(5);

    await expect(
      createWebhookEndpointForTenant('tenant-a', { url: 'https://example.com/hook', events: ['*'] }),
    ).rejects.toThrow(WebhookEndpointServiceError);

    expect(webhookEndpointRepository.createEndpoint).not.toHaveBeenCalled();
  });

  it('allows creation of the 5th endpoint (limit is on active count reaching the max, not before)', async () => {
    vi.mocked(webhookEndpointRepository.countActiveEndpointsForTenant).mockResolvedValue(4);
    vi.mocked(webhookEndpointRepository.createEndpoint).mockImplementation(async (data) =>
      makeRow({ tenantId: data.tenantId, url: data.url, secretHash: data.secretHash, events: data.events }),
    );

    await expect(
      createWebhookEndpointForTenant('tenant-a', { url: 'https://example.com/hook', events: ['*'] }),
    ).resolves.toBeTruthy();
  });
});

describe('webhookEndpointService.listWebhookEndpointsForTenant', () => {
  it('never includes the secret or its hash in listed metadata', async () => {
    vi.mocked(webhookEndpointRepository.listEndpointsForTenant).mockResolvedValue([
      makeRow({ id: 'ep-1' }),
      makeRow({ id: 'ep-2', secretHash: 'anotherhash' }),
    ]);

    const rows = await listWebhookEndpointsForTenant('tenant-a');

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).not.toHaveProperty('secret');
      expect(row).not.toHaveProperty('secretHash');
      expect(JSON.stringify(row)).not.toContain('deadbeef');
      expect(JSON.stringify(row)).not.toContain('anotherhash');
    }
  });
});

describe('webhookEndpointService cross-tenant isolation', () => {
  it('delete for a foreign tenant 404s instead of deleting (repository is asked with the caller tenantId, never a global id lookup)', async () => {
    // tenant-b's endpoint does not exist from tenant-a's point of view.
    vi.mocked(webhookEndpointRepository.findEndpointForTenant).mockResolvedValue(null);

    await expect(deleteWebhookEndpointForTenant('tenant-a', 'ep-owned-by-tenant-b')).rejects.toThrow(
      WebhookEndpointServiceError,
    );

    expect(webhookEndpointRepository.findEndpointForTenant).toHaveBeenCalledWith('ep-owned-by-tenant-b', 'tenant-a');
    expect(webhookEndpointRepository.deleteEndpoint).not.toHaveBeenCalled();
  });

  it('regenerate for a foreign tenant 404s the same way', async () => {
    vi.mocked(webhookEndpointRepository.findEndpointForTenant).mockResolvedValue(null);

    await expect(regenerateWebhookEndpointSecret('tenant-a', 'ep-owned-by-tenant-b')).rejects.toThrow(
      WebhookEndpointServiceError,
    );
    expect(webhookEndpointRepository.regenerateSecret).not.toHaveBeenCalled();
  });
});

describe('webhookEndpointService.resolveActiveEndpointsForEvent', () => {
  it('matches an endpoint whose events include the exact event type', async () => {
    vi.mocked(webhookEndpointRepository.listActiveEndpointsForTenant).mockResolvedValue([
      makeRow({ id: 'ep-1', events: ['call.completed'] }),
      makeRow({ id: 'ep-2', events: ['lead.qualified'] }),
    ]);

    const resolution = await resolveActiveEndpointsForEvent('tenant-a', 'call.completed');

    expect(resolution.hasAnyActiveEndpoint).toBe(true);
    expect(resolution.targets).toEqual([{ endpointId: 'ep-1', url: expect.any(String) }]);
  });

  it('matches an endpoint subscribed to "*"', async () => {
    vi.mocked(webhookEndpointRepository.listActiveEndpointsForTenant).mockResolvedValue([
      makeRow({ id: 'ep-wildcard', events: ['*'] }),
    ]);

    const resolution = await resolveActiveEndpointsForEvent('tenant-a', 'anything.happened');

    expect(resolution.targets.map((t) => t.endpointId)).toEqual(['ep-wildcard']);
  });

  it('returns hasAnyActiveEndpoint=true with zero targets when no endpoint subscribes to this event (does not enqueue anything)', async () => {
    vi.mocked(webhookEndpointRepository.listActiveEndpointsForTenant).mockResolvedValue([
      makeRow({ id: 'ep-1', events: ['lead.qualified'] }),
    ]);

    const resolution = await resolveActiveEndpointsForEvent('tenant-a', 'call.completed');

    expect(resolution.hasAnyActiveEndpoint).toBe(true);
    expect(resolution.targets).toEqual([]);
  });

  it('returns hasAnyActiveEndpoint=false when the tenant has no active endpoint at all', async () => {
    vi.mocked(webhookEndpointRepository.listActiveEndpointsForTenant).mockResolvedValue([]);

    const resolution = await resolveActiveEndpointsForEvent('tenant-a', 'call.completed');

    expect(resolution.hasAnyActiveEndpoint).toBe(false);
    expect(resolution.targets).toEqual([]);
  });

  it('never returns a target belonging to another tenant (repository is queried with the caller tenantId only)', async () => {
    vi.mocked(webhookEndpointRepository.listActiveEndpointsForTenant).mockResolvedValue([
      makeRow({ id: 'ep-tenant-a', tenantId: 'tenant-a', events: ['*'] }),
    ]);

    await resolveActiveEndpointsForEvent('tenant-b', 'call.completed');

    expect(webhookEndpointRepository.listActiveEndpointsForTenant).toHaveBeenCalledWith('tenant-b');
  });
});

describe('webhookEndpointService signature verifiability', () => {
  it('the HMAC a receiver recomputes from SHA-256(secret) matches the signature the worker would compute from the persisted secretHash', async () => {
    // Simulate the full round trip: create -> get plaintext secret once -> repository only ever
    // sees/returns its SHA-256 hash -> worker signs with that hash -> receiver, who only ever saw
    // the plaintext secret, must SHA-256 it first to reproduce the same key.
    let stored: Row | null = null;
    vi.mocked(webhookEndpointRepository.countActiveEndpointsForTenant).mockResolvedValue(0);
    vi.mocked(webhookEndpointRepository.createEndpoint).mockImplementation(async (data) => {
      stored = makeRow({ tenantId: data.tenantId, url: data.url, secretHash: data.secretHash, events: data.events });
      return stored;
    });
    vi.mocked(webhookEndpointRepository.findActiveEndpointById).mockImplementation(async (id) =>
      stored && stored.id === id ? stored : null,
    );

    const created = await createWebhookEndpointForTenant('tenant-a', {
      url: 'https://example.com/hook',
      events: ['*'],
    });

    const body = JSON.stringify({ id: 'evt_1', type: 'call.completed', timestamp: '2026-01-01T00:00:00Z', tenantId: 'tenant-a', data: {} });

    // What webhook.worker.ts#signBody does internally for a per-endpoint delivery.
    const secretHashForSigning = await findActiveSigningSecretHash(created.id);
    expect(secretHashForSigning).toBe(hashWebhookSecret(created.secret));
    const signature = createHmac('sha256', secretHashForSigning!).update(body).digest('hex');

    // What a third-party receiver does: they only ever saw `created.secret` (plaintext) — per the
    // documented contract they must hash it with SHA-256 first to get the actual HMAC key.
    const receiverComputedKey = createHash('sha256').update(created.secret).digest('hex');
    const receiverSignature = createHmac('sha256', receiverComputedKey).update(body).digest('hex');

    expect(receiverSignature).toBe(signature);
  });

  it('a signature computed with a different endpoint\'s secret never matches', async () => {
    const secretA = 'whsec_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const secretB = 'whsec_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const body = 'irrelevant-body-bytes';

    const sigWithA = createHmac('sha256', hashWebhookSecret(secretA)).update(body).digest('hex');
    const sigWithB = createHmac('sha256', hashWebhookSecret(secretB)).update(body).digest('hex');

    expect(sigWithA).not.toBe(sigWithB);
  });

  it('findActiveSigningSecretHash resolves null for a deleted/deactivated endpoint (never falls back to another endpoint\'s secret)', async () => {
    vi.mocked(webhookEndpointRepository.findActiveEndpointById).mockResolvedValue(null);

    await expect(findActiveSigningSecretHash('gone-endpoint')).resolves.toBeNull();
  });
});
