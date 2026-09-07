import * as workflowRepository from '../repositories/workflowRepository.js';
import { validationEngine } from '../../lib/studio/ValidationEngine.js';
import { validateRuntimeCompatibility } from './workflowRuntimeService.js';
import { logger } from '../../lib/logger.js';
import type { StudioNode, StudioEdge, ValidationIssue } from '../../lib/studio/types.js';

export class NotFoundError extends Error {}

/**
 * Thrown by `publishWorkflow` when the workflow's nodes/edges don't pass the visual graph
 * validator or the production-runtime capability gate. This is the ONLY error type an
 * "activate/publish" caller should ever see for a rejected workflow — there is no other
 * successful code path that marks a workflow `status: 'active'`.
 */
export class ValidationFailedError extends Error {
  issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super('O fluxo contém erros de validação e não pode ser publicado/ativado.');
    this.name = 'ValidationFailedError';
    this.issues = issues;
  }
}

/**
 * `Workflow.nodes`/`edges` are persisted as Prisma `Json` (see prisma/schema.prisma), so at the
 * type level they're `unknown` until read back. Studio is the only normal writer of that column,
 * but we still guard against non-array garbage (old rows/manual DB edits) rather than letting
 * validators throw on `.filter`/`.forEach`.
 */
function toStudioGraph(nodes: unknown, edges: unknown): { nodes: StudioNode[]; edges: StudioEdge[] } {
  return {
    nodes: Array.isArray(nodes) ? (nodes as StudioNode[]) : [],
    edges: Array.isArray(edges) ? (edges as StudioEdge[]) : [],
  };
}

/** A single saved revision of a workflow, appended to `WorkflowMetadata.history` on every save. */
export interface WorkflowVersionSnapshot {
  version: number;
  timestamp: number;
  author: string;
  message: string;
  nodes: unknown;
  edges: unknown;
}

/**
 * A published-version archive entry, created by `publishWorkflow`/`rollbackToVersion` for the
 * content a publish/rollback is about to supersede — never for a version that was never actually
 * live. Backed by the dedicated Prisma `WorkflowVersion` table (see the model comment in
 * `prisma/schema.prisma` and `.agents/handoffs/onda-5/01-para-07-schema-workflow-version-
 * pronto.md`), one immutable row per (workflowId, version). This interface is the service-layer
 * return/input shape; `toPublishedWorkflowVersion` below converts a `WorkflowVersion` Prisma row
 * into it.
 *
 * Earlier in Onda 5 this was stored inline in `Workflow.metadata.publishedVersions` (interim
 * mechanism, before the dedicated table existed). That JSON is NOT migrated/backfilled into the
 * table — any workflow published before this change keeps its old archive frozen in `metadata`,
 * unread by the code below (per the handoff's explicit "sem backfill retroativo" decision).
 */
export interface PublishedWorkflowVersion {
  version: number;
  nodes: unknown;
  edges: unknown;
  metadata: Record<string, unknown>;
  publishedAt: string; // ISO 8601
  publishedBy: string | null;
}

function toPublishedWorkflowVersion(row: {
  version: number;
  nodes: unknown;
  edges: unknown;
  metadata: unknown;
  publishedAt: Date;
  publishedBy: string | null;
}): PublishedWorkflowVersion {
  return {
    version: row.version,
    nodes: row.nodes,
    edges: row.edges,
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    publishedAt: row.publishedAt.toISOString(),
    publishedBy: row.publishedBy,
  };
}

/**
 * Shape of the Workflow.metadata Prisma `Json` field. `history` is the per-save draft trail
 * (every `saveWorkflow` call, published or not) — unaffected by this change, still stored inline.
 *
 * `publishedVersions` is kept here ONLY as the legacy shape of content archived before the
 * dedicated `WorkflowVersion` table existed (see `PublishedWorkflowVersion` above). Nothing in
 * this file writes to it anymore; it is never read by `listWorkflowVersions`/`rollbackToVersion`
 * either — a workflow published before this migration keeps that history frozen here, invisible
 * to the new code path, exactly as documented in the schema handoff.
 */
export interface WorkflowMetadata {
  history?: WorkflowVersionSnapshot[];
  /** @deprecated Legacy pre-WorkflowVersion-table archive. Frozen; no longer read or written. */
  publishedVersions?: PublishedWorkflowVersion[];
  [key: string]: unknown;
}

/**
 * Archives `versionToArchive`'s content as a new `WorkflowVersion` row, unless one already exists
 * for that (workflowId, version) pair — enforced by the DB's own `@@unique([workflowId, version])`
 * constraint (not just an in-memory check), so a genuine race between two concurrent publishes/
 * rollbacks for the same workflow can never produce two archive rows for the same version.
 * `Workflow.version` should only ever increase via `publishWorkflow`/`rollbackToVersion`, so a
 * collision should never happen in normal operation; if the constraint is hit anyway (race, or a
 * manual DB edit), we log and keep the already-archived row rather than throwing or duplicating.
 */
async function archivePublishedVersion(
  workflowId: string,
  versionToArchive: number,
  nodes: unknown,
  edges: unknown,
  publishedBy: string
): Promise<void> {
  try {
    await workflowRepository.createWorkflowVersion({
      workflowId,
      version: versionToArchive,
      nodes,
      edges,
      publishedBy,
    });
  } catch (err) {
    if (workflowRepository.isUniqueConstraintViolation(err)) {
      logger.error('Refusing to duplicate an already-archived workflow version', { workflowId, versionToArchive });
      return;
    }
    throw err;
  }
}

export function getWorkflow(tenantId: string, _version?: number) {
  return workflowRepository.findWorkflowForTenant(tenantId);
}

export async function getWorkflowHistory(tenantId: string) {
  const existing = await workflowRepository.findWorkflowForTenant(tenantId);
  if (!existing) return [];
  const metadata = existing.metadata as unknown as WorkflowMetadata;
  return metadata?.history || [];
}

export async function saveWorkflow(tenantId: string, userId: string, data: { name?: string; nodes?: unknown; edges?: unknown, commitMessage?: string }) {
  const existing = await workflowRepository.findWorkflowForTenant(tenantId);

  const metadata = (existing?.metadata as unknown as WorkflowMetadata) || {};
  const newVersion = (existing?.version || 0) + 1;

  const snapshot: WorkflowVersionSnapshot = {
    version: newVersion,
    timestamp: Date.now(),
    author: userId,
    message: data.commitMessage || `Update ${newVersion}`,
    nodes: data.nodes || existing?.nodes || [],
    edges: data.edges || existing?.edges || []
  };

  metadata.history = metadata.history || [];
  metadata.history.push(snapshot);

  // Every structural save is unvalidated new content. Even if the row used to be active, the
  // write goes back to draft and must cross publishWorkflow again before production can see it.
  return workflowRepository.upsertWorkflow(tenantId, userId, existing?.id ?? null, {
    ...data,
    metadata,
    version: newVersion,
    status: 'draft',
  });
}

export async function updateWorkflow(tenantId: string, userId: string, data: { name?: string; nodes?: unknown; edges?: unknown }) {
  const existing = await workflowRepository.findWorkflowForTenant(tenantId);
  if (!existing) throw new NotFoundError('Workflow não encontrado para atualização.');

  const structuralChange = data.nodes !== undefined || data.edges !== undefined;

  return workflowRepository.upsertWorkflow(tenantId, userId, existing.id, {
    name: data.name ?? existing.name,
    nodes: data.nodes ?? existing.nodes,
    edges: data.edges ?? existing.edges,
    status: structuralChange ? 'draft' : undefined,
  });
}

/**
 * The single gate a workflow must pass through to become `active`.
 *
 * Two independent validations happen server-side against the persisted graph:
 * 1. `ValidationEngine` checks graph correctness (start node, reachability, dead ends, cycles,
 *    required node configuration, etc.).
 * 2. `validateRuntimeCompatibility` checks whether the production telephony runtime can honestly
 *    execute every node/branch. A visually valid graph is NOT activated if it depends on a node
 *    whose runtime executor does not exist yet.
 *
 * This prevents the Studio from advertising a successful publish for a graph that real calls
 * would silently ignore.
 *
 * Before the new content goes live, the content it is about to supersede is archived (see
 * `archivePublishedVersion`/`PublishedWorkflowVersion`) under its own (pre-increment) version
 * number, then `Workflow.version` is incremented. A running phone call already mid-conversation
 * is unaffected either way — `telephonyService.ts` snapshots the workflow into
 * `PhoneSessionMetadata.workflow` at call start and never re-reads the live row mid-call.
 */
export async function publishWorkflow(tenantId: string, userId: string) {
  const existing = await workflowRepository.findWorkflowForTenant(tenantId);
  if (!existing) throw new NotFoundError('Nenhum fluxo encontrado para publicar.');

  const { nodes, edges } = toStudioGraph(existing.nodes, existing.edges);
  const graphResult = validationEngine.validate(nodes, edges);
  const runtimeIssues = validateRuntimeCompatibility(nodes, edges);
  const issues = [...graphResult.issues, ...runtimeIssues];

  if (!graphResult.isValid || runtimeIssues.some((issue) => issue.type === 'error')) {
    throw new ValidationFailedError(issues);
  }

  await archivePublishedVersion(existing.id, existing.version, existing.nodes, existing.edges, userId);

  return workflowRepository.upsertWorkflow(tenantId, userId, existing.id, {
    status: 'active',
    version: existing.version + 1,
  });
}

/**
 * Published-version archive for one workflow (tenant-scoped by `workflowId` + `tenantId`,
 * never trusting `workflowId` alone — see `workflowRepository.findWorkflowByIdForTenant`).
 * Newest first. Returns `[]` (never a 404) for a workflow that has never been published, since
 * "no versions yet" is a legitimate, non-error state.
 */
export async function listWorkflowVersions(tenantId: string, workflowId: string): Promise<PublishedWorkflowVersion[]> {
  const workflow = await workflowRepository.findWorkflowByIdForTenant(workflowId, tenantId);
  if (!workflow) throw new NotFoundError('Workflow não encontrado.');

  const versions = await workflowRepository.findWorkflowVersionsForWorkflow(workflow.id);
  return versions.map(toPublishedWorkflowVersion);
}

/**
 * Rollback = republish an archived version's content as a BRAND NEW version — never rewrites the
 * version number that content was originally published under, so history stays linear and
 * auditable (the old version's archive entry is untouched; a new one is appended for whatever was
 * live immediately before the rollback).
 *
 * Passes through the exact same two gates as `publishWorkflow` (`ValidationEngine` +
 * `validateRuntimeCompatibility`), evaluated against the ARCHIVED content, not the current one —
 * a version that used to be valid can be rejected today if the runtime capability it depended on
 * has since been removed (see `docs/patterns/workflow-execution-contract.md` §2); rolling back to
 * it must fail the same way a fresh publish of that graph would, never apply it half-broken.
 */
export async function rollbackToVersion(tenantId: string, userId: string, workflowId: string, version: number) {
  const existing = await workflowRepository.findWorkflowByIdForTenant(workflowId, tenantId);
  if (!existing) throw new NotFoundError('Workflow não encontrado.');

  const target = await workflowRepository.findWorkflowVersion(existing.id, version);
  if (!target) throw new NotFoundError(`Versão ${version} não encontrada para este fluxo.`);

  const { nodes, edges } = toStudioGraph(target.nodes, target.edges);
  const graphResult = validationEngine.validate(nodes, edges);
  const runtimeIssues = validateRuntimeCompatibility(nodes, edges);
  const issues = [...graphResult.issues, ...runtimeIssues];

  if (!graphResult.isValid || runtimeIssues.some((issue) => issue.type === 'error')) {
    throw new ValidationFailedError(issues);
  }

  await archivePublishedVersion(existing.id, existing.version, existing.nodes, existing.edges, userId);

  return workflowRepository.upsertWorkflow(tenantId, userId, existing.id, {
    nodes: target.nodes,
    edges: target.edges,
    status: 'active',
    version: existing.version + 1,
  });
}

export async function restoreWorkflowVersion(tenantId: string, userId: string, versionToRestore: number) {
  const existing = await workflowRepository.findWorkflowForTenant(tenantId);
  if (!existing) throw new NotFoundError('Workflow não encontrado.');

  const metadata = existing.metadata as unknown as WorkflowMetadata;
  const history = metadata?.history || [];
  const snapshot = history.find((h) => h.version === versionToRestore);

  if (!snapshot) throw new NotFoundError('Versão não encontrada.');

  return saveWorkflow(tenantId, userId, {
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    commitMessage: `Restaurado para a versão ${versionToRestore}`
  });
}

export async function removeWorkflow(tenantId: string) {
  const existing = await workflowRepository.findWorkflowForTenant(tenantId);
  if (!existing) throw new NotFoundError('Nenhum fluxo encontrado para exclusão.');
  await workflowRepository.deleteWorkflow(existing.id);
  return existing;
}

export async function duplicateWorkflow(tenantId: string, userId: string, _sourceWorkflowId: string) {
  const existing = await workflowRepository.findWorkflowForTenant(tenantId);
  if (!existing) throw new NotFoundError('Workflow de origem não encontrado.');

  return workflowRepository.upsertWorkflow(tenantId, userId, null, {
    name: `${existing.name} (Cópia)`,
    nodes: existing.nodes,
    edges: existing.edges
  });
}
