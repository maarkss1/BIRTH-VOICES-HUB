// Covers `.agents/handoffs/onda-5/00-para-07-workflow-versionamento-rollback.md` ("Teste
// esperado"): publish archives the pre-publish version without duplicating/skipping numbers,
// rollback 404s on a missing/cross-tenant workflow or a non-existent version, rollback refuses a
// version that fails the runtime-compatibility gate today (422-shaped error), and rollback never
// rewrites an already-archived version number — it always appends a new one.
//
// Since `.agents/handoffs/onda-5/01-para-07-schema-workflow-version-pronto.md` landed the
// dedicated `WorkflowVersion` Prisma model, this file mocks `workflowRepository`'s WorkflowVersion
// functions (`createWorkflowVersion`/`findWorkflowVersionsForWorkflow`/`findWorkflowVersion`/
// `isUniqueConstraintViolation`) instead of asserting on `Workflow.metadata.publishedVersions`
// JSON shape — the public behavior under test (gates, archive-once, never-rewrite) is unchanged.
//
// Deliberately NOT under `__tests__/**` (AGENTS.md §11 reserves that directory to Agente 08); this
// file is colocated with `workflowService.ts`, which Agente 07 owns, and vitest's default include
// glob picks it up (`vite.config.ts` sets no explicit `test.include`, so any `*.test.ts` file in
// the project runs under `npm run test`).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma, type WorkflowVersion } from '@prisma/client';

vi.mock('../repositories/workflowRepository.js', () => ({
  findWorkflowForTenant: vi.fn(),
  findWorkflowByIdForTenant: vi.fn(),
  upsertWorkflow: vi.fn(),
  createWorkflowVersion: vi.fn(),
  findWorkflowVersionsForWorkflow: vi.fn(),
  findWorkflowVersion: vi.fn(),
  isUniqueConstraintViolation: vi.fn(
    (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  ),
}));

import * as workflowRepository from '../repositories/workflowRepository.js';
import {
  publishWorkflow,
  listWorkflowVersions,
  rollbackToVersion,
  NotFoundError,
  ValidationFailedError,
  type WorkflowMetadata,
} from './workflowService.js';
import type { NodeType, StudioEdge, StudioNode } from '../../lib/studio/types.js';

const mockFindForTenant = vi.mocked(workflowRepository.findWorkflowForTenant);
const mockFindByIdForTenant = vi.mocked(workflowRepository.findWorkflowByIdForTenant);
const mockUpsert = vi.mocked(workflowRepository.upsertWorkflow);
const mockCreateVersion = vi.mocked(workflowRepository.createWorkflowVersion);
const mockListVersions = vi.mocked(workflowRepository.findWorkflowVersionsForWorkflow);
const mockFindVersion = vi.mocked(workflowRepository.findWorkflowVersion);

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

// Structurally valid but depends on a node the phone runtime does not execute today
// (`human_handoff`) — this is exactly the shape of graph a runtime-capability regression (or an
// old archived version that used to be supported) looks like. Was `voice` through Onda 5; Onda 6
// made `voice` itself executable (Twilio-named-TTS MVP — see
// .agents/handoffs/onda-6/04-para-07-voice-node-fixture-desatualizada.md), so `human_handoff`
// (still blocked, no runtime bridge — see
// .agents/handoffs/onda-5/04-para-05-voice-human-handoff-design.md) is now the example.
function runtimeIncompatibleGraph() {
  const nodes = [
    node('start-1', 'start'),
    node('handoff-1', 'human_handoff', { department: 'vendas' }),
    node('prompt-1', 'prompt', { promptText: 'Atenda com objetividade.' }),
    node('end-1', 'end'),
  ];
  const edges = [
    edge('e1', 'start-1', 'handoff-1'),
    edge('e2', 'handoff-1', 'prompt-1'),
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

// A row shaped like the Prisma `WorkflowVersion` model — what
// `findWorkflowVersionsForWorkflow`/`findWorkflowVersion`/`createWorkflowVersion` resolve to.
interface WorkflowVersionRow {
  id: string;
  workflowId: string;
  version: number;
  nodes: unknown;
  edges: unknown;
  metadata: unknown;
  publishedAt: Date;
  publishedBy: string | null;
}

// Cast once at the boundary, exactly like `workflowRow` does for `Workflow` — the real Prisma
// `WorkflowVersion` type requires `nodes`/`edges`/`metadata` to already be `Prisma.JsonValue`.
function workflowVersionRow(overrides: Partial<WorkflowVersionRow> & { version: number }): WorkflowVersion {
  const { nodes, edges } = validGraph();
  return {
    id: `wfv-${overrides.version}`,
    workflowId: 'wf-1',
    nodes,
    edges,
    metadata: {},
    publishedAt: new Date(`2026-01-0${overrides.version}T00:00:00.000Z`),
    publishedBy: 'user-1',
    ...overrides,
  } as unknown as WorkflowVersion;
}

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`workflowId`,`version`)',
    { code: 'P2002', clientVersion: '5.22.0' }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: archiving succeeds unless a test overrides it to simulate a race/duplicate.
  mockCreateVersion.mockResolvedValue(workflowVersionRow({ version: 1 }));
});

describe('publishWorkflow archives the pre-publish version', () => {
  it('archives the current content under the current version number, then increments the version — no duplication or gaps across two consecutive publishes', async () => {
    const { nodes, edges } = validGraph();

    // --- first publish: v1 -> v2 ---
    mockFindForTenant.mockResolvedValueOnce(workflowRow({ version: 1, nodes, edges, metadata: {} }));
    mockUpsert.mockResolvedValueOnce(workflowRow({ version: 2, status: 'active' }));

    await publishWorkflow('tenant-1', 'user-1');

    expect(mockCreateVersion).toHaveBeenNthCalledWith(1, {
      workflowId: 'wf-1',
      version: 1,
      nodes,
      edges,
      metadata: {},
      publishedBy: 'user-1',
    });
    expect(mockUpsert).toHaveBeenNthCalledWith(1, 'tenant-1', 'user-1', 'wf-1', expect.objectContaining({
      status: 'active',
      version: 2,
    }));

    // --- second publish: v2 -> v3 ---
    mockFindForTenant.mockResolvedValueOnce(workflowRow({ version: 2, nodes, edges, metadata: {} }));
    mockUpsert.mockResolvedValueOnce(workflowRow({ version: 3, status: 'active' }));

    await publishWorkflow('tenant-1', 'user-1');

    expect(mockCreateVersion).toHaveBeenNthCalledWith(2, {
      workflowId: 'wf-1',
      version: 2,
      nodes,
      edges,
      metadata: {},
      publishedBy: 'user-1',
    });
    expect(mockUpsert).toHaveBeenNthCalledWith(2, 'tenant-1', 'user-1', 'wf-1', expect.objectContaining({
      status: 'active',
      version: 3,
    }));
  });

  it('never activates a workflow (and never archives anything) when the publish gate rejects the graph', async () => {
    const { nodes, edges } = runtimeIncompatibleGraph();
    mockFindForTenant.mockResolvedValueOnce(workflowRow({ version: 1, nodes, edges, metadata: {} }));

    await expect(publishWorkflow('tenant-1', 'user-1')).rejects.toBeInstanceOf(ValidationFailedError);
    expect(mockCreateVersion).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('logs and continues (never throws, never blocks the publish) when a race already archived this version number', async () => {
    const { nodes, edges } = validGraph();
    mockFindForTenant.mockResolvedValueOnce(workflowRow({ version: 1, nodes, edges, metadata: {} }));
    mockCreateVersion.mockRejectedValueOnce(uniqueConstraintError());
    mockUpsert.mockResolvedValueOnce(workflowRow({ version: 2, status: 'active' }));

    await expect(publishWorkflow('tenant-1', 'user-1')).resolves.toEqual(expect.objectContaining({ version: 2 }));
    expect(mockUpsert).toHaveBeenCalledWith('tenant-1', 'user-1', 'wf-1', expect.objectContaining({
      status: 'active',
      version: 2,
    }));
  });

  it('re-throws any non-unique-constraint error from the archive write instead of silently publishing', async () => {
    const { nodes, edges } = validGraph();
    mockFindForTenant.mockResolvedValueOnce(workflowRow({ version: 1, nodes, edges, metadata: {} }));
    mockCreateVersion.mockRejectedValueOnce(new Error('connection lost'));

    await expect(publishWorkflow('tenant-1', 'user-1')).rejects.toThrow('connection lost');
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe('listWorkflowVersions', () => {
  it('throws NotFoundError instead of an empty list for a workflow id that does not belong to the caller tenant', async () => {
    mockFindByIdForTenant.mockResolvedValueOnce(null);

    await expect(listWorkflowVersions('tenant-1', 'wf-of-another-tenant')).rejects.toBeInstanceOf(NotFoundError);
    expect(mockFindByIdForTenant).toHaveBeenCalledWith('wf-of-another-tenant', 'tenant-1');
    expect(mockListVersions).not.toHaveBeenCalled();
  });

  it('reads from the WorkflowVersion table for the resolved workflow id, tenant-scoped via the parent workflow lookup', async () => {
    mockFindByIdForTenant.mockResolvedValueOnce(workflowRow({ id: 'wf-1' }));
    mockListVersions.mockResolvedValueOnce([
      workflowVersionRow({ version: 3 }),
      workflowVersionRow({ version: 2 }),
      workflowVersionRow({ version: 1 }),
    ]);

    const versions = await listWorkflowVersions('tenant-1', 'wf-1');

    expect(mockListVersions).toHaveBeenCalledWith('wf-1');
    // Newest-first, as returned by the repository (`orderBy: { version: 'desc' }`).
    expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
    expect(versions[0]).toEqual(expect.objectContaining({
      version: 3,
      publishedBy: 'user-1',
      publishedAt: expect.any(String),
    }));
  });

  it('returns [] (never a 404) for a workflow that has never been published', async () => {
    mockFindByIdForTenant.mockResolvedValueOnce(workflowRow({ id: 'wf-1' }));
    mockListVersions.mockResolvedValueOnce([]);

    const versions = await listWorkflowVersions('tenant-1', 'wf-1');
    expect(versions).toEqual([]);
  });
});

describe('rollbackToVersion', () => {
  it('fails with NotFoundError (never leaking content) for a workflow id belonging to another tenant', async () => {
    mockFindByIdForTenant.mockResolvedValueOnce(null);

    await expect(rollbackToVersion('tenant-1', 'user-1', 'wf-of-another-tenant', 1)).rejects.toBeInstanceOf(NotFoundError);
    expect(mockFindByIdForTenant).toHaveBeenCalledWith('wf-of-another-tenant', 'tenant-1');
    expect(mockFindVersion).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('fails with NotFoundError for a version number that was never archived for this workflow', async () => {
    mockFindByIdForTenant.mockResolvedValueOnce(workflowRow({ id: 'wf-1', version: 3 }));
    mockFindVersion.mockResolvedValueOnce(null);

    await expect(rollbackToVersion('tenant-1', 'user-1', 'wf-1', 99)).rejects.toBeInstanceOf(NotFoundError);
    expect(mockFindVersion).toHaveBeenCalledWith('wf-1', 99);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('refuses to roll back to an archived version that fails the runtime-compatibility gate today, with the same error shape as a fresh publish rejection', async () => {
    const bad = runtimeIncompatibleGraph();
    const current = validGraph();
    mockFindByIdForTenant.mockResolvedValueOnce(workflowRow({
      id: 'wf-1',
      version: 5,
      nodes: current.nodes,
      edges: current.edges,
    }));
    mockFindVersion.mockResolvedValueOnce(workflowVersionRow({ version: 3, nodes: bad.nodes, edges: bad.edges }));

    const error = await rollbackToVersion('tenant-1', 'user-1', 'wf-1', 3).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ValidationFailedError);
    expect((error as ValidationFailedError).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'err-runtime-unsupported-handoff-1', type: 'error' }),
    ]));
    expect(mockCreateVersion).not.toHaveBeenCalled();
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
    }));
    mockFindVersion.mockResolvedValueOnce(workflowVersionRow({ version: 1, nodes: target.nodes, edges: target.edges }));
    mockUpsert.mockResolvedValueOnce(workflowRow({ version: 4, status: 'active' }));

    await rollbackToVersion('tenant-1', 'user-2', 'wf-1', 1);

    expect(mockFindVersion).toHaveBeenCalledWith('wf-1', 1);
    // v3 (what was live right before the rollback) is archived under its own number, never v1's.
    expect(mockCreateVersion).toHaveBeenCalledWith({
      workflowId: 'wf-1',
      version: 3,
      nodes: current.nodes,
      edges: current.edges,
      metadata: {},
      publishedBy: 'user-2',
    });
    expect(mockUpsert).toHaveBeenCalledWith('tenant-1', 'user-2', 'wf-1', expect.objectContaining({
      nodes: target.nodes,
      edges: target.edges,
      metadata: {},
      status: 'active',
      version: 4,
    }));
  });

  it('is idempotent about duplicate archive entries: rolling back when the current version was somehow already archived never throws and never blocks the rollback', async () => {
    const target = validGraph();
    const current = validGraph();
    mockFindByIdForTenant.mockResolvedValueOnce(workflowRow({
      id: 'wf-1',
      version: 3,
      nodes: current.nodes,
      edges: current.edges,
    }));
    mockFindVersion.mockResolvedValueOnce(workflowVersionRow({ version: 1, nodes: target.nodes, edges: target.edges }));
    // Simulate the current live version (3) having somehow already been archived (should never
    // happen in normal operation) — the DB unique constraint rejects the duplicate archive write.
    mockCreateVersion.mockRejectedValueOnce(uniqueConstraintError());
    mockUpsert.mockResolvedValueOnce(workflowRow({ version: 4, status: 'active' }));

    await expect(rollbackToVersion('tenant-1', 'user-1', 'wf-1', 1)).resolves.toEqual(expect.objectContaining({ version: 4 }));
    expect(mockUpsert).toHaveBeenCalledWith('tenant-1', 'user-1', 'wf-1', expect.objectContaining({
      nodes: target.nodes,
      edges: target.edges,
      status: 'active',
      version: 4,
    }));
  });
});
