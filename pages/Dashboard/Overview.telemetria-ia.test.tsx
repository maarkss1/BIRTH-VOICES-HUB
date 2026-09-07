// @vitest-environment jsdom
//
// Covers the AI cost/tokens/latency cards in pages/Dashboard/Overview.tsx, connected in Onda 6 to
// the real telemetry persisted by lib/voice-runtime/providers/LLMGateway.ts (see
// .agents/handoffs/onda-6/00-para-02-overview-custo-ia-cards.md and
// .agents/handoffs/onda-4/04-para-02-telemetria-custo-ia-disponivel.md). Follows the same
// component-test pattern as pages/Dashboard/Developers.webhooks.test.tsx (mock react-router-dom,
// stub global fetch) — not owned by Agente 08 (__tests__/**), kept alongside the page per that
// onda's precedent.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import RebuiltExecutiveOverview from './Overview';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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

interface MetricFixture {
  id: string;
  name: string;
  value: number;
  tags?: Record<string, unknown>;
  timestamp: string;
}

// Baseline for every endpoint Overview.tsx fetches on mount, other than /api/metrics which each
// test overrides — keeps every test focused on the telemetry cards without duplicating the whole
// dashboard's fetch surface.
function stubFetch(metrics: MetricFixture[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === '/api/onboarding') return Promise.resolve(jsonResponse({ body: { checklist: {} } }));
      if (url === '/api/call-logs') return Promise.resolve(jsonResponse({ body: { callLogs: [] } }));
      if (url === '/api/agents') return Promise.resolve(jsonResponse({ body: { agents: [] } }));
      if (url === '/api/ready') return Promise.resolve(jsonResponse({ body: { checks: { database: 'ok', redis: 'ok' } } }));
      if (url === '/api/metrics') return Promise.resolve(jsonResponse({ body: { metrics } }));
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

describe('Overview — AI cost/tokens/latency cards', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('aggregates real ai_call_* metrics from GET /api/metrics into the cards', async () => {
    stubFetch([
      { id: 'm1', name: 'ai_call_cost_usd', value: 0.012, tags: { provider: 'openai' }, timestamp: new Date().toISOString() },
      { id: 'm2', name: 'ai_call_cost_usd', value: 0.008, tags: { provider: 'openai' }, timestamp: new Date().toISOString() },
      { id: 'm3', name: 'ai_call_tokens', value: 500, tags: { provider: 'openai' }, timestamp: new Date().toISOString() },
      { id: 'm4', name: 'ai_call_tokens', value: 300, tags: { provider: 'openai' }, timestamp: new Date().toISOString() },
      { id: 'm5', name: 'ai_call_latency_ms', value: 800, tags: { provider: 'openai' }, timestamp: new Date().toISOString() },
      { id: 'm6', name: 'ai_call_latency_ms', value: 1200, tags: { provider: 'openai' }, timestamp: new Date().toISOString() },
      // Unrelated event name from the same endpoint must never leak into the AI aggregation.
      { id: 'm7', name: 'platform_ready_check', value: 1, tags: {}, timestamp: new Date().toISOString() },
    ]);

    render(<RebuiltExecutiveOverview />);

    expect(await screen.findByText('US$ 0.02')).toBeInTheDocument();
    expect(screen.getByText('800')).toBeInTheDocument(); // total tokens = 500 + 300 = 800
    expect(screen.getByText('1.000 ms')).toBeInTheDocument(); // avg latency = (800+1200)/2 = 1000
    expect(screen.getAllByText('2 chamadas de IA registradas').length).toBeGreaterThan(0);
  });

  it('shows an honest empty state (never a fabricated number) when the tenant has no AI calls yet', async () => {
    stubFetch([]);

    render(<RebuiltExecutiveOverview />);

    await screen.findByText('Custo de IA (total)');
    const emptyCaptions = await screen.findAllByText('Ainda sem chamadas de IA para esta organização');
    expect(emptyCaptions.length).toBe(3); // cost, tokens, latency — each honestly empty

    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(3);

    // CSAT stays an explicit empty card too — no real data source exists for it yet.
    expect(screen.getByText('CSAT')).toBeInTheDocument();
    expect(screen.getByText('Sem fonte de dado definida')).toBeInTheDocument();

    // The old catch-all "not instrumented" alert is gone now that real cards exist.
    expect(screen.queryByText('Telemetria de IA ainda não instrumentada')).not.toBeInTheDocument();
  });

  it('never mixes AI telemetry across mounts (e.g. switching tenant/session remounts clean)', async () => {
    stubFetch([
      { id: 'a1', name: 'ai_call_cost_usd', value: 5, tags: {}, timestamp: new Date().toISOString() },
      { id: 'a2', name: 'ai_call_tokens', value: 1000, tags: {}, timestamp: new Date().toISOString() },
      { id: 'a3', name: 'ai_call_latency_ms', value: 500, tags: {}, timestamp: new Date().toISOString() },
    ]);
    const { unmount } = render(<RebuiltExecutiveOverview />);
    expect(await screen.findByText('US$ 5.00')).toBeInTheDocument();
    unmount();
    vi.unstubAllGlobals();
    vi.clearAllMocks();

    // Second mount, different (tenant-scoped) response — must render fresh, never the previous
    // tenant's aggregated values.
    stubFetch([]);
    render(<RebuiltExecutiveOverview />);
    await screen.findAllByText('Ainda sem chamadas de IA para esta organização');
    expect(screen.queryByText('US$ 5.00')).not.toBeInTheDocument();
  });
});
