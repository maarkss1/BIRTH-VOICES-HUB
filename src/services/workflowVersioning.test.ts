// Covers `.agents/handoffs/onda-5/00-para-07-workflow-versionamento-rollback.md` ("Teste
// esperado"): publish archives the pre-publish version without duplicating/skipping numbers,
// rollback 404s on a missing/cross-tenant workflow or a non-existent version, rollback refuses a
// version that fails the runtime-compatibility gate today (422-shaped error), and rollback never
// rewrites an already-archived version number — it always appends a new one.
//
// Deliberately NOT under `__tests__/**` (AGENTS.md §11 reserves that directory to Agente 08); this
// file is colocated with `workflowService.ts`, which Agente 07 owns, and vitest's default include
// glob picks it up (`vite.config.ts` sets no explicit `test.include`, so any `*.test.ts` file in
// the project runs under `npm run test`).
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../repositories/workflowRepository.js', () => ({
  findWorkflowForTenant: vi.fn(),
  findWorkflowByIdForTenant: vi.fn(),
  upsertWorkflow: vi.fn(),
}));

import * as workflowRepository from '../repositories/workflowRepository.js';
import {
  publishWorkflow,
  listWorkflowVersions,
  rollbackToVersion,
  NotFoundError,
  ValidationFailedError,
  type WorkflowMetadata,
  type PublishedWorkflowVersion,
} from './workflowService.js';
import type { NodeType, StudioEdge, StudioNode } from '../../lib/studio/types.js';

const mockFindForTenant = vi.mocked(workflowRepository.findWorkflowForTenant);
const mockFindByIdForTenant = vi.mocked(workflowRepository.findWorkflowByIdForTenant);
const mockUpsert = vi.mocked(workflowRepository.upsertWorkflow);

type Workflow = Awaited<ReturnType<typeof workflowRepository.findWorkflowForTenant>>;

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

// Structurally valid AND runtime-executable today (mirrors __tests__/workflowPublishGate.test.ts).
function validGraph() {
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
  return { nodes, edges };
}

// Structurally valid but depends on a node the phone runtime does not execute today (`voice`) —
// this is exactly the shape of graph a runtime-capability regression (or an old archived version
// that used to be supported) looks like.
function runtimeIncompatibleGraph() {
  const nodes = [
    node('start-1', 'start'),
    node('voice-1', 'voice', { provider: 'ElevenLabs', voiceId: 'voice-1' }),
    node('prompt-1', 'prompt', { promptText: 'Atenda com objetividade.' }),
    node('end-1', 'end'),
  ];
  const edges = [
    edge('e1', 'start-1', 'voice-1'),
    edge('e2', 'voice-1', 'prompt-1'),
    edge('e3', 'prompt-1', 'end-1'),
  ];
  return { nodes, edges };
}

interface WorkflowRowOverrides {
  id?: string;
  tenantId?: string;
  version?: number;
  status?: string;
  nodes?: unknown;
  edges?: unknown;
  metadata?: WorkflowMetadata;
}

// Loosely typed on purpose (see `workflowPublishGate.test.ts`'s equivalent helper): `Workflow`'s
// real Prisma type requires `nodes`/`edges`/`metadata` to already be `Prisma.JsonValue`, but the
// whole point of `toStudioGraph` in workflowService.ts is defensively narrowing that untyped `Json`
// column at the service boundary, so tests build these rows as plain StudioNode[]/StudioEdge[]/
// WorkflowMetadata and cast once here, exactly like the runtime does when it reads a real row back.
function workflowRow(overrides: WorkflowRowOverrides): NonNullable<Workflow> {
  const { nodes, edges } = validGraph();
  return {
    id: 'wf-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    name: 'Fluxo',
    description: null,
    status: 'active',
    nodes,
    edges,
    metadata: {},
    version: 1,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as unknown as NonNullable<Workflow>;
}

function publishedVersionsOf(mockData: unknown): PublishedWorkflowVersion[] {
  const metadata = (mockData as { metadata: WorkflowMetadata }).metadata;
  return metadata.publishedVersions ?? [];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('publishWorkflow archives the pre-publish version', () => {
  it('archives the current content under the current version number, then increments the version — no duplication or gaps across two consecutive publishes', async () => {
    const { nodes, edges } = validGraph();

    // --- first publish: v1 -> v2 ---
    mockFindForTenant.mockResolvedValueOnce(workflowRow({ version: 1, nodes, edges, metadata: {} }));
    mockUpsert.mockResolvedValueOnce(workflowRow({ version: 2, status: 'active' }));

    await publishWorkflow('tenant-1', 'user-1');

    expect(mockUpsert).toHaveBeenNthCalledWith(1, 'tenant-1', 'user-1', 'wf-1', expect.objectContaining({
      status: 'active',
      version: 2,
    }));
    const firstCallData = mockUpsert.mock.calls[0][3];
    expect(publishedVersionsOf(firstCallData)).toEqual([
      expect.objectContaining({ version: 1, publishedBy: 'user-1' }),
    ]);

    // --- second publish, starting from what the first publish actually persisted: v2 -> v3 ---
    const metadataAfterFirstPublish = (firstCallData as { metadata: WorkflowMetadata }).metadata;
    mockFindForTenant.mockResolvedValueOnce(
      workflowRow({ version: 2, nodes, edges, metadata: metadataAfterFirstPublish })
    );
    mockUpsert.mockResolvedValueOnce(workflowRow({ version: 3, status: 'active' }));

    await publishWorkflow('tenant-1', 'user-1');

    const secondCallData = mockUpsert.mock.calls[1][3];
    expect(secondCallData).toEqual(expect.objectContaining({ status: 'active', version: 3 }));
    expect(publishedVersionsOf(secondCallData).map((v) => v.version)).toEqual([1, 2]);
  });

  it('never activates a workflow (and never archives anything) when the publish gate rejects the graph', async () => {
    const { nodes, edges } = runtimeIncompatibleGraph();
    mockFindForTenant.mockResolvedValueOnce(workflowRow({ version: 1, nodes, edges, metadata: {} }));

    await expect(publishWorkflow('tenant-1', 'user-1')).rejects.toBeInstanceOf(ValidationFailedError);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe('listWorkflowVersions', () => {
  it('throws NotFoundError instead of an empty list for a workflow id that does not belong to the caller tenant', async () => {
    mockFindByIdForTenant.mockResolvedValueOnce(null);

    await expect(listWorkflowVersions('tenant-1', 'wf-of-another-tenant')).rejects.toBeInstanceOf(NotFoundError);
    expect(mockFindByIdForTenant).toHaveBeenCalledWith('wf-of-another-tenant', 'tenant-1');
  });

  it('returns archived versions newest-first', async () => {
    mockFindByIdForTenant.mockResolvedValueOnce(workflowRow({
      metadata: {
        publishedVersions: [
          { version: 1, nodes: [], edges: [], metadata: {}, publishedAt: 't0', publishedBy: 'user-1' },
          { version: 3, nodes: [], edges: [], metadata: {}, publishedAt: 't2', publishedBy: 'user-1' },
          { version: 2, nodes: [], edges: [], metadata: {}, publishedAt: 't1', publishedBy: 'user-1' },
        ],
      },
    }));

    const versions = await listWorkflowVersions('tenant-1', 'wf-1');
    expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
  });
});

describe('rollbackToVersion', () => {
  it('fails with NotFoundError (never leaking content) for a workflow id belonging to another tenant', async () => {
    mockFindByIdForTenant.mockResolvedValueOnce(null);

    await expect(rollbackToVersion('tenant-1', 'user-1', 'wf-of-another-tenant', 1)).rejects.toBeInstanceOf(NotFoundError);
    expect(mockFindByIdForTenant).toHaveBeenCalledWith('wf-of-another-tenant', 'tenant-1');
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('fails with NotFoundError for a version number that was never archived for this workflow', async () => {
    mockFindByIdForTenant.mockResolvedValueOnce(workflowRow({
      version: 3,
      metadata: {
        publishedVersions: [
          { version: 1, nodes: [], edges: [], metadata: {}, publishedAt: 't0', publishedBy: 'user-1' },
          { version: 2, nodes: [], edges: [], metadata: {}, publishedAt: 't1', publishedBy: 'user-1' },
        ],
      },
    }));

    await expect(rollbackToVersion('tenant-1', 'user-1', 'wf-1', 99)).rejects.toBeInstanceOf(NotFoundError);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('refuses to roll back to an archived version that fails the runtime-compatibility gate today, with the same error shape as a fresh publish rejection', async () => {
    const bad = runtimeIncompatibleGraph();
    const current = validGraph();
    mockFindByIdForTenant.mockResolvedValueOnce(workflowRow({
      version: 5,
      nodes: current.nodes,
      edges: current.edges,
      metadata: {
        publishedVersions: [
          { version: 3, nodes: bad.nodes, edges: bad.edges, metadata: {}, publishedAt: 't0', publishedBy: 'user-1' },
        ],
      },
    }));

    const error = await rollbackToVersion('tenant-1', 'user-1', 'wf-1', 3).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ValidationFailedError);
    expect((error as ValidationFailedError).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'err-runtime-unsupported-voice-1', type: 'error' }),
    ]));
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('republishes the archived content as a brand-new version, archiving the content it supersedes — never rewriting the target version\'s own number', async () => {
    const target = validGraph();
    const current = validGraph();
    mockFindByIdForTenant.mockResolvedValueOnce(workflowRow({
      id: 'wf-1',
      tenantId: 'tenant-1',
      version: 3,
      nodes: current.nodes,
      edges: current.edges,
      metadata: {
        publishedVersions: [
          { version: 1, nodes: target.nodes, edges: target.edges, metadata: {}, publishedAt: 't0', publishedBy: 'user-1' },
          { version: 2, nodes: current.nodes, edges: current.edges, metadata: {}, publishedAt: 't1', publishedBy: 'user-1' },
        ],
      },
    }));
    mockUpsert.mockResolvedValueOnce(workflowRow({ version: 4, status: 'active' }));

    await rollbackToVersion('tenant-1', 'user-2', 'wf-1', 1);

    expect(mockUpsert).toHaveBeenCalledWith('tenant-1', 'user-2', 'wf-1', expect.objectContaining({
      nodes: target.nodes,
      edges: target.edges,
      status: 'active',
      version: 4,
    }));

    const finalMetadata = mockUpsert.mock.calls[0][3] as { metadata: WorkflowMetadata };
    const archived = finalMetadata.metadata.publishedVersions ?? [];
    // v1 and v2 are untouched (same version numbers, never rewritten); v3 (what was live right
    // before the rollback) is newly archived by this call.
    expect(archived.map((v) => v.version).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(archived.find((v) => v.version === 3)).toEqual(expect.objectContaining({
      version: 3,
      publishedBy: 'user-2',
      nodes: current.nodes,
      edges: current.edges,
    }));
  });

  it('is idempotent about duplicate archive entries: rolling back twice never produces two rows for the same version', async () => {
    const target = validGraph();
    const current = validGraph();
    const metadataWithV3Archived: WorkflowMetadata = {
      publishedVersions: [
        { version: 1, nodes: target.nodes, edges: target.edges, metadata: {}, publishedAt: 't0', publishedBy: 'user-1' },
        { version: 3, nodes: current.nodes, edges: current.edges, metadata: {}, publishedAt: 't1', publishedBy: 'user-1' },
      ],
    };
    // Simulate a workflow whose current live version (3) was somehow already archived (should
    // never happen in normal operation, but archivePublishedVersion must not corrupt history if
    // it ever does).
    mockFindByIdForTenant.mockResolvedValueOnce(workflowRow({
      version: 3,
      nodes: current.nodes,
      edges: current.edges,
      metadata: metadataWithV3Archived,
    }));
    mockUpsert.mockResolvedValueOnce(workflowRow({ version: 4, status: 'active' }));

    await rollbackToVersion('tenant-1', 'user-1', 'wf-1', 1);

    const finalMetadata = mockUpsert.mock.calls[0][3] as { metadata: WorkflowMetadata };
    const archived = finalMetadata.metadata.publishedVersions ?? [];
    expect(archived.filter((v) => v.version === 3)).toHaveLength(1);
  });
});
