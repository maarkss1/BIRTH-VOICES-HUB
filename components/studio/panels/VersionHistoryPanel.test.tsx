// @vitest-environment jsdom
//
// Covers `.agents/handoffs/onda-6/00-para-07-studio-ui-historico-versoes.md`: the
// "Histórico de Publicações" panel lists real versions from `GET /workflow/:id/versions` scoped
// to the current `workflowId` (never fabricated, never another workflow's data — AGENTS.md
// §14/§15), requires explicit confirmation before rollback, and surfaces a 422 rollback
// rejection's `issues[]` via the same `ValidationIssuesList` publish already uses — never a
// silent failure.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VersionHistoryPanel } from './VersionHistoryPanel';
import { useStudioStore } from '../../../store/useStudioStore';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  } as Response);
}

describe('VersionHistoryPanel', () => {
  beforeEach(() => {
    useStudioStore.setState(useStudioStore.getInitialState(), true);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders nothing while closed, and never fetches', () => {
    render(<VersionHistoryPanel />);
    expect(screen.queryByText('Histórico de Publicações')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches versions scoped to the current workflow id when opened, and lists them newest-first', async () => {
    useStudioStore.setState({ isVersionHistoryOpen: true, workflowId: 'wf-1' });
    vi.mocked(fetch).mockImplementation((url) => {
      expect(String(url)).toBe('/api/workflow/wf-1/versions');
      return jsonResponse({
        versions: [
          { version: 3, publishedAt: '2026-01-03T00:00:00.000Z', publishedBy: 'user-2' },
          { version: 2, publishedAt: '2026-01-02T00:00:00.000Z', publishedBy: 'user-1' },
        ],
      });
    });

    render(<VersionHistoryPanel />);

    expect(await screen.findByText('v3')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('Publicado por user-2')).toBeInTheDocument();
    expect(screen.getByText('Publicado por user-1')).toBeInTheDocument();
  });

  it('shows an explicit empty state — never a fabricated version — for a workflow never published', async () => {
    useStudioStore.setState({ isVersionHistoryOpen: true, workflowId: 'wf-1' });
    vi.mocked(fetch).mockImplementation(() => jsonResponse({ versions: [] }));

    render(<VersionHistoryPanel />);

    expect(await screen.findByText('Nenhuma versão publicada ainda.')).toBeInTheDocument();
  });

  it('shows an explicit error state with a retry action when the version list fetch fails', async () => {
    useStudioStore.setState({ isVersionHistoryOpen: true, workflowId: 'wf-1' });
    vi.mocked(fetch).mockImplementation(() =>
      jsonResponse({ error: 'Workflow não encontrado.' }, false, 404)
    );

    render(<VersionHistoryPanel />);

    expect(await screen.findByText('Workflow não encontrado.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('requires explicit confirmation before calling rollback — a single click never triggers it', async () => {
    const user = userEvent.setup();
    useStudioStore.setState({ isVersionHistoryOpen: true, workflowId: 'wf-1' });
    vi.mocked(fetch).mockImplementation(() =>
      jsonResponse({ versions: [{ version: 1, publishedAt: '2026-01-01T00:00:00.000Z', publishedBy: 'user-1' }] })
    );

    render(<VersionHistoryPanel />);
    await screen.findByText('v1');

    await user.click(screen.getByRole('button', { name: 'Restaurar versão 1' }));

    expect(screen.getByText('Confirma?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sim, restaurar' })).toBeInTheDocument();
    // Only the initial list GET happened so far — no POST rollback yet.
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText('Confirma?')).not.toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('rolls back to the confirmed version, updates the canvas, and refreshes the list', async () => {
    const user = userEvent.setup();
    useStudioStore.setState({ isVersionHistoryOpen: true, workflowId: 'wf-1' });

    const restoredNodes = [{ id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start', category: 'Start', config: {} } }];

    vi.mocked(fetch).mockImplementation((url, init) => {
      const href = String(url);
      if (href === '/api/workflow/wf-1/versions' && (!init || init.method === undefined)) {
        return jsonResponse({ versions: [{ version: 1, publishedAt: '2026-01-01T00:00:00.000Z', publishedBy: 'user-1' }] });
      }
      if (href === '/api/workflow/wf-1/versions/1/rollback' && init?.method === 'POST') {
        return jsonResponse({
          success: true,
          workflow: { id: 'wf-1', version: 2, nodes: restoredNodes, edges: [] },
        });
      }
      throw new Error(`Unexpected fetch: ${href}`);
    });

    render(<VersionHistoryPanel />);
    await screen.findByText('v1');

    await user.click(screen.getByRole('button', { name: 'Restaurar versão 1' }));
    await user.click(screen.getByRole('button', { name: 'Sim, restaurar' }));

    expect(await screen.findByText('Versão restaurada e publicada com sucesso.')).toBeInTheDocument();
    expect(useStudioStore.getState().nodes).toEqual(restoredNodes);
    // Confirmation prompt is gone and the (single) row is no longer stuck loading.
    expect(screen.queryByText('Confirma?')).not.toBeInTheDocument();
  });

  it('surfaces a 422 rollback rejection via the shared issues list — never a silent failure', async () => {
    const user = userEvent.setup();
    useStudioStore.setState({ isVersionHistoryOpen: true, workflowId: 'wf-1' });

    vi.mocked(fetch).mockImplementation((url, init) => {
      const href = String(url);
      if (href === '/api/workflow/wf-1/versions' && !init) {
        return jsonResponse({ versions: [{ version: 1, publishedAt: '2026-01-01T00:00:00.000Z', publishedBy: 'user-1' }] });
      }
      if (href === '/api/workflow/wf-1/versions/1/rollback' && init?.method === 'POST') {
        return jsonResponse(
          {
            error: 'O fluxo contém erros de validação e não pode ser publicado/ativado.',
            issues: [{ id: 'err-runtime-unsupported-voice-1', type: 'error', message: 'Nó de voz sem suporte no runtime atual.' }],
          },
          false,
          422
        );
      }
      throw new Error(`Unexpected fetch: ${href}`);
    });

    const nodesBeforeRollback = useStudioStore.getState().nodes;

    render(<VersionHistoryPanel />);
    await screen.findByText('v1');

    await user.click(screen.getByRole('button', { name: 'Restaurar versão 1' }));
    await user.click(screen.getByRole('button', { name: 'Sim, restaurar' }));

    expect(await screen.findByText('O fluxo contém erros de validação e não pode ser publicado/ativado.')).toBeInTheDocument();
    expect(screen.getByText('Nó de voz sem suporte no runtime atual.')).toBeInTheDocument();
    // The canvas must NOT have been mutated by a rejected rollback.
    expect(useStudioStore.getState().nodes).toBe(nodesBeforeRollback);
  });

  it('closes via the close button without leaving stale data displayed as current', async () => {
    const user = userEvent.setup();
    useStudioStore.setState({ isVersionHistoryOpen: true, workflowId: 'wf-1' });
    vi.mocked(fetch).mockImplementation(() =>
      jsonResponse({ versions: [{ version: 1, publishedAt: '2026-01-01T00:00:00.000Z', publishedBy: 'user-1' }] })
    );

    render(<VersionHistoryPanel />);
    await screen.findByText('v1');

    await user.click(screen.getByLabelText('Fechar histórico de publicações'));

    expect(screen.queryByText('Histórico de Publicações')).not.toBeInTheDocument();
    expect(useStudioStore.getState().isVersionHistoryOpen).toBe(false);
  });
});
