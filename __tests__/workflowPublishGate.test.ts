import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/repositories/workflowRepository.js', () => ({
  findWorkflowForTenant: vi.fn(),
  findActiveWorkflowForTenant: vi.fn(),
  upsertWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  createWorkflowVersion: vi.fn(),
  isUniqueConstraintViolation: vi.fn(() => false),
}));

import { findWorkflowForTenant, upsertWorkflow } from '../src/repositories/workflowRepository.js';
import { publishWorkflow, ValidationFailedError } from '../src/services/workflowService.js';
import type { NodeType, StudioEdge, StudioNode } from '../lib/studio/types.js';

const mockFind = vi.mocked(findWorkflowForTenant);
const mockUpsert = vi.mocked(upsertWorkflow);

type Workflow = Awaited<ReturnType<typeof findWorkflowForTenant>>;

function node(id: string, type: NodeType, config: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { label: id, category: 'test', config },
  } as StudioNode;
}

function edge(id: string, source: string, target: string, sourceHandle?: string, isFallback = false): StudioEdge {
  return {
    id,
    source,
    target,
    sourceHandle,
    type: 'studioEdge',
    data: { isFallback },
  } as StudioEdge;
}

function workflow(nodes: StudioNode[], edges: StudioEdge[]): NonNullable<Workflow> {
  return {
    id: 'wf-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    name: 'Fluxo',
    status: 'draft',
    nodes,
    edges,
    metadata: {},
    version: 4,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  } as unknown as NonNullable<Workflow>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpsert.mockResolvedValue({ id: 'wf-1', status: 'active' } as Awaited<ReturnType<typeof upsertWorkflow>>);
});

describe('workflow publish production-runtime gate', () => {
  it('activates a graph that is structurally valid and executable by the phone runtime', async () => {
    const nodes = [
      node('start-1', 'start'),
      node('llm-1', 'llm', { provider: 'Gemini' }),
      node('prompt-1', 'prompt', { promptText: 'Atenda com objetividade.' }),
      node('end-1', 'end'),
    ];
    const edges = [
      edge('e1', 'start-1', 'llm-1'),
      edge('e2', 'llm-1', 'prompt-1'),
      edge('e3', 'prompt-1', 'end-1'),
    ];
    mockFind.mockResolvedValue(workflow(nodes, edges));

    await publishWorkflow('tenant-1', 'user-1');

    expect(mockUpsert).toHaveBeenCalledWith('tenant-1', 'user-1', 'wf-1', expect.objectContaining({
      status: 'active',
      version: 5,
    }));
  });

  it('refuses a visually valid graph containing a node the phone runtime cannot execute', async () => {
    const nodes = [
      node('start-1', 'start'),
      // Onda 6 history: this example node was 'voice' through rodada 1, then 'human_handoff'
      // through rodada 2 — each got unblocked by a real feature within the same onda, breaking
      // this test twice in a row (see .agents/handoffs/onda-6/04-para-08-*.md, both rodadas).
      // Every real Studio NodeType is executable today, so a synthetic/nonexistent type is the
      // only example that cannot be invalidated by a future feature unblocking a real node.
      node('bogus-1', 'este_tipo_nao_existe' as unknown as NodeType, {}),
      node('prompt-1', 'prompt', { promptText: 'Atenda com objetividade.' }),
      node('end-1', 'end'),
    ];
    const edges = [
      edge('e1', 'start-1', 'bogus-1'),
      edge('e2', 'bogus-1', 'prompt-1'),
      edge('e3', 'prompt-1', 'end-1'),
    ];
    mockFind.mockResolvedValue(workflow(nodes, edges));

    const error = await publishWorkflow('tenant-1', 'user-1').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ValidationFailedError);
    expect((error as ValidationFailedError).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'err-runtime-unsupported-bogus-1', type: 'error' }),
    ]));
    expect(mockUpsert).not.toHaveBeenCalledWith('tenant-1', 'user-1', 'wf-1', { status: 'active' });
  });

  it('refuses a non-deterministic parallel fan-out even when the canvas graph has no cycle', async () => {
    const nodes = [
      node('start-1', 'start'),
      node('prompt-a', 'prompt', { promptText: 'A' }),
      node('prompt-b', 'prompt', { promptText: 'B' }),
      node('end-a', 'end'),
      node('end-b', 'end'),
    ];
    const edges = [
      edge('e1', 'start-1', 'prompt-a'),
      edge('e2', 'start-1', 'prompt-b'),
      edge('e3', 'prompt-a', 'end-a'),
      edge('e4', 'prompt-b', 'end-b'),
    ];
    mockFind.mockResolvedValue(workflow(nodes, edges));

    await expect(publishWorkflow('tenant-1', 'user-1')).rejects.toBeInstanceOf(ValidationFailedError);
    expect(mockUpsert).not.toHaveBeenCalledWith('tenant-1', 'user-1', 'wf-1', { status: 'active' });
  });
});
