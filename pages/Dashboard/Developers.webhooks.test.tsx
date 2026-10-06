// @vitest-environment jsdom
//
// Covers the Webhooks section of pages/Dashboard/Developers.tsx, connected in Onda 5 to the real
// backend (.agents/handoffs/onda-5/00-para-02-conectar-developers-webhooks.md). Follows the same
// component-test pattern as components/Sidebar.test.tsx (mock useSessionStore, stub global fetch)
// — not owned by Agente 08 (__tests__/**), kept alongside the component per this onda's precedent.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DevelopersPage from './Developers';

let mockRole = 'admin';

vi.mock('../../store/useSessionStore', () => ({
  useSessionStore: (selector: (state: { user: { id: string; email: string; role: string; tenantId: string } | null }) => unknown) =>
    selector({ user: { id: 'user-1', email: 'admin@teste.com', role: mockRole, tenantId: 'tenant-1' } }),
}));

interface MockResponse {
  status?: number;
  body: unknown;
}

function jsonResponse({ status = 200, body }: MockResponse) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('Developers page — Webhooks', () => {
  beforeEach(() => {
    mockRole = 'admin';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows "temporariamente indisponível" (never an empty list) on a 503 from the backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/developers/keys') return Promise.resolve(jsonResponse({ body: { apiKeys: [] } }));
        if (url === '/api/developers/webhooks') {
          return Promise.resolve(jsonResponse({ status: 503, body: { error: 'Endpoints de webhook por tenant ainda não estão disponíveis nesta implantação.' } }));
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    render(<DevelopersPage />);

    expect(await screen.findByText('Funcionalidade temporariamente indisponível')).toBeInTheDocument();
    expect(screen.queryByText(/Nenhum endpoint de webhook cadastrado/)).not.toBeInTheDocument();
  });

  it('shows the real empty state when the tenant has no endpoints', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/developers/keys') return Promise.resolve(jsonResponse({ body: { apiKeys: [] } }));
        if (url === '/api/developers/webhooks') return Promise.resolve(jsonResponse({ body: { webhookEndpoints: [] } }));
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    render(<DevelopersPage />);

    expect(await screen.findByText(/Nenhum endpoint de webhook cadastrado ainda/)).toBeInTheDocument();
  });

  it('reveals the plaintext secret once on create, then hides it after dismissal', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/developers/keys') return Promise.resolve(jsonResponse({ body: { apiKeys: [] } }));
      if (url === '/api/developers/webhooks' && (!init || init.method === undefined)) {
        return Promise.resolve(jsonResponse({ body: { webhookEndpoints: [] } }));
      }
      if (url === '/api/developers/webhooks' && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse({
            status: 201,
            body: {
              webhookEndpoint: {
                id: 'wh-1',
                url: 'https://example.com/hooks/voice',
                events: ['agent.call.ended'],
                active: true,
                createdAt: new Date().toISOString(),
              },
              secret: 'whsec_plaintext-once-only',
            },
          }),
        );
      }
      throw new Error(`unexpected fetch: ${url} ${init?.method}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<DevelopersPage />);
    await screen.findByText(/Nenhum endpoint de webhook cadastrado ainda/);

    await user.click(screen.getByRole('button', { name: /Adicionar Endpoint/i }));
    await user.type(screen.getByPlaceholderText('https://seu-servidor.com/webhooks/voice'), 'https://example.com/hooks/voice');
    await user.type(screen.getByPlaceholderText(/agent\.call\.ended ou \* para todos/), 'agent.call.ended');
    await user.click(screen.getByRole('button', { name: /^Criar Endpoint$/ }));

    expect(await screen.findByText('whsec_plaintext-once-only')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Já copiei, fechar/i }));
    expect(screen.queryByText('whsec_plaintext-once-only')).not.toBeInTheDocument();
  });

  it('propagates the backend 409 (limit reached) message verbatim instead of a generic error', async () => {
    const user = userEvent.setup();
    const limitMessage = 'Limite de 5 endpoints de webhook ativos por tenant atingido. Remova ou desative um endpoint existente antes de criar outro.';
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/developers/keys') return Promise.resolve(jsonResponse({ body: { apiKeys: [] } }));
        if (url === '/api/developers/webhooks' && init?.method === 'POST') {
          return Promise.resolve(jsonResponse({ status: 409, body: { error: limitMessage } }));
        }
        if (url === '/api/developers/webhooks') return Promise.resolve(jsonResponse({ body: { webhookEndpoints: [] } }));
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    render(<DevelopersPage />);
    await screen.findByText(/Nenhum endpoint de webhook cadastrado ainda/);

    await user.click(screen.getByRole('button', { name: /Adicionar Endpoint/i }));
    await user.type(screen.getByPlaceholderText('https://seu-servidor.com/webhooks/voice'), 'https://example.com/hooks/voice');
    await user.type(screen.getByPlaceholderText(/agent\.call\.ended ou \* para todos/), '*');
    await user.click(screen.getByRole('button', { name: /^Criar Endpoint$/ }));

    expect(await screen.findByText(limitMessage)).toBeInTheDocument();
  });

  it('asks for confirmation and calls DELETE before removing an endpoint from the list', async () => {
    const user = userEvent.setup();
    let deleted = false;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/developers/keys') return Promise.resolve(jsonResponse({ body: { apiKeys: [] } }));
        if (url === '/api/developers/webhooks/wh-1' && init?.method === 'DELETE') {
          deleted = true;
          return Promise.resolve(jsonResponse({ body: { success: true } }));
        }
        if (url === '/api/developers/webhooks') {
          return Promise.resolve(
            jsonResponse({
              body: {
                webhookEndpoints: deleted
                  ? []
                  : [
                      {
                        id: 'wh-1',
                        url: 'https://example.com/hooks/voice',
                        events: ['*'],
                        active: true,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        lastDeliveryAt: null,
                        lastDeliveryStatus: null,
                      },
                    ],
              },
            }),
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    render(<DevelopersPage />);
    expect(await screen.findByText('https://example.com/hooks/voice')).toBeInTheDocument();

    await user.click(screen.getByTitle('Remover endpoint de webhook'));
    const dialog = await screen.findByText('Remover Endpoint de Webhook');
    const dialogBox = dialog.closest('div.rounded-xl') as HTMLElement;
    await user.click(within(dialogBox).getByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(deleted).toBe(true));
    await waitFor(() => expect(screen.queryByText('https://example.com/hooks/voice')).not.toBeInTheDocument());
  });

  it('gates both API Keys and Webhooks behind admin role, without a way to trigger create', async () => {
    mockRole = 'member';
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('should not fetch for non-admin'))));

    render(<DevelopersPage />);

    const restricted = await screen.findAllByText('Acesso restrito');
    expect(restricted).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Adicionar Endpoint/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Criar Chave/i })).not.toBeInTheDocument();
  });
});
