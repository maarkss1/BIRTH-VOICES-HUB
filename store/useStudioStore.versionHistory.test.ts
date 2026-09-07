// @vitest-environment jsdom
//
// Store-level coverage for the "Histórico de Publicações" slice added by
// `.agents/handoffs/onda-6/00-para-07-studio-ui-historico-versoes.md`
// (`fetchWorkflowVersions`/`rollbackWorkflowToVersion`), independent of the panel's rendering.
// Asserts: the list is always scoped to the current `workflowId` (never fabricated, never another
// workflow's data — AGENTS.md §14/§15), a successful rollback replaces the canvas with the
// server's response and refreshes the list, and a rejected rollback (422) surfaces `issues[]`
// without silently mutating the canvas.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useStudioStore } from './useStudioStore';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  } as Response);
}

describe('useStudioStore — version history & rollback', () => {
  beforeEach(() => {
    useStudioStore.setState(useStudioStore.getInitialState(), true);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('fetchWorkflowVersions', () => {
    it('never fetches (and clears the list) when no workflow id has been resolved yet — an honest empty state, not a fabricated one', async () => {
      await useStudioStore.getState().fetchWorkflowVersions();

      expect(fetch).not.toHaveBeenCalled();
      expect(useStudioStore.getState().workflowVersions).toEqual([]);
      expect(useStudioStore.getState().versionHistoryState).toBe('idle');
    });

    it('requests the list scoped to this session\'s own workflow id, newest-first as returned by the server', async () => {
      useStudioStore.setState({ workflowId: 'wf-tenant-a' });
      vi.mocked(fetch).mockImplementation((url) => {
        expect(String(url)).toBe('/api/workflow/wf-tenant-a/versions');
        return jsonResponse({
          versions: [
            { version: 2, publishedAt: '2026-01-02T00:00:00.000Z', publishedBy: 'user-2' },
            { version: 1, publishedAt: '2026-01-01T00:00:00.000Z', publishedBy: 'user-1' },
          ],
        });
      });

      await useStudioStore.getState().fetchWorkflowVersions();

      expect(useStudioStore.getState().workflowVersions.map((v) => v.version)).toEqual([2, 1]);
      expect(useStudioStore.getState().versionHistoryState).toBe('idle');
    });

    it('never leaves a previous workflow\'s versions displayed as current when the server 404s (e.g. switched to another workflow/tenant)', async () => {
      useStudioStore.setState({
        workflowId: 'wf-of-another-tenant',
        workflowVersions: [{ version: 9, publishedAt: '2026-01-09T00:00:00.000Z', publishedBy: 'someone-else' }],
      });
      vi.mocked(fetch).mockImplementation(() => jsonResponse({ error: 'Workflow não encontrado.' }, false, 404));

      await useStudioStore.getState().fetchWorkflowVersions();

      expect(useStudioStore.getState().workflowVersions).toEqual([]);
      expect(useStudioStore.getState().versionHistoryState).toBe('error');
      expect(useStudioStore.getState().versionHistoryError).toBe('Workflow não encontrado.');
    });

    it('sets an explicit error state (never throws, never a silent empty success) when the server is unreachable', async () => {
      useStudioStore.setState({ workflowId: 'wf-1' });
      vi.mocked(fetch).mockRejectedValue(new Error('network down'));

      await useStudioStore.getState().fetchWorkflowVersions();

      expect(useStudioStore.getState().versionHistoryState).toBe('error');
      expect(useStudioStore.getState().workflowVersions).toEqual([]);
    });
  });

  describe('rollbackWorkflowToVersion', () => {
    it('replaces the canvas with the restored content, tracks the new workflow id/version, and refreshes the version list', async () => {
      useStudioStore.setState({ workflowId: 'wf-1' });
      const restoredNodes = [{ id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start', category: 'Start', config: {} } }];
      const restoredEdges = [{ id: 'e1', source: 'start-1', target: 'end-1', type: 'studioEdge', data: {} }];

      let listFetchCount = 0;
      vi.mocked(fetch).mockImplementation((url, init) => {
        const href = String(url);
        if (href === '/api/workflow/wf-1/versions/1/rollback' && init?.method === 'POST') {
          return jsonResponse({
            success: true,
            workflow: { id: 'wf-1', version: 4, nodes: restoredNodes, edges: restoredEdges },
          });
        }
        if (href === '/api/workflow/wf-1/versions') {
          listFetchCount += 1;
          return jsonResponse({ versions: [] });
        }
        throw new Error(`Unexpected fetch: ${href}`);
      });

      await useStudioStore.getState().rollbackWorkflowToVersion(1);

      expect(useStudioStore.getState().nodes).toEqual(restoredNodes);
      expect(useStudioStore.getState().edges).toEqual(restoredEdges);
      expect(useStudioStore.getState().workflowId).toBe('wf-1');
      expect(useStudioStore.getState().rollbackState).toBe('success');
      // The list is refreshed after a successful rollback (it archived a new version).
      expect(listFetchCount).toBe(1);
    });

    it('never mutates the canvas and surfaces `issues[]` when the runtime-compatibility gate rejects the rollback (422)', async () => {
      useStudioStore.setState({ workflowId: 'wf-1' });
      const nodesBefore = useStudioStore.getState().nodes;
      const edgesBefore = useStudioStore.getState().edges;

      vi.mocked(fetch).mockImplementation(() =>
        jsonResponse(
          {
            error: 'O fluxo contém erros de validação e não pode ser publicado/ativado.',
            issues: [{ id: 'err-runtime-unsupported-voice-1', type: 'error', message: 'Nó de voz sem suporte no runtime atual.' }],
          },
          false,
          422
        )
      );

      await useStudioStore.getState().rollbackWorkflowToVersion(3);

      expect(useStudioStore.getState().nodes).toBe(nodesBefore);
      expect(useStudioStore.getState().edges).toBe(edgesBefore);
      expect(useStudioStore.getState().rollbackState).toBe('error');
      expect(useStudioStore.getState().rollbackIssues).toEqual([
        expect.objectContaining({ id: 'err-runtime-unsupported-voice-1', type: 'error' }),
      ]);
    });

    it('is a no-op when no workflow id has been resolved yet — never rolls back a workflow it cannot identify', async () => {
      await useStudioStore.getState().rollbackWorkflowToVersion(1);

      expect(fetch).not.toHaveBeenCalled();
      expect(useStudioStore.getState().rollbackState).toBe('idle');
    });
  });
});
