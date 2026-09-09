import { Request, Response } from 'express';
import { saveWorkflowSchema } from '../validators/index.js';
import { getWorkflow, saveWorkflow, updateWorkflow, removeWorkflow, getWorkflowHistory, restoreWorkflowVersion, duplicateWorkflow, publishWorkflow, listWorkflowVersions, rollbackToVersion, NotFoundError, ValidationFailedError } from '../services/workflowService.js';
import { writeAuditLog } from '../services/audit.js';

export async function getWorkflowHandler(req: Request, res: Response) {
  const workflow = await getWorkflow(req.tenantId!);
  res.json({ workflow: workflow || null });
}

export async function saveWorkflowHandler(req: Request, res: Response) {
  const parsed = saveWorkflowSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const data = { ...parsed.data, commitMessage: req.body.commitMessage };
  const workflow = await saveWorkflow(req.tenantId!, req.user!.id, data);
  writeAuditLog(req.tenantId, req.user!.id, 'WORKFLOW_SAVE', { workflowId: workflow.id, name: workflow.name, version: workflow.version });
  res.json({ success: true, workflow });
}

export async function updateWorkflowHandler(req: Request, res: Response) {
  const parsed = saveWorkflowSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const workflow = await updateWorkflow(req.tenantId!, req.user!.id, parsed.data);
    writeAuditLog(req.tenantId, req.user!.id, 'WORKFLOW_UPDATE', { workflowId: workflow.id, name: workflow.name });
    res.json({ success: true, workflow });
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    throw err;
  }
}

export async function deleteWorkflowHandler(req: Request, res: Response) {
  try {
    const deleted = await removeWorkflow(req.tenantId!);
    writeAuditLog(req.tenantId, req.user!.id, 'WORKFLOW_DELETE', { workflowId: deleted.id });
    res.json({ success: true, message: 'Fluxo removido com sucesso.' });
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    throw err;
  }
}

export async function getWorkflowHistoryHandler(req: Request, res: Response) {
  const history = await getWorkflowHistory(req.tenantId!);
  res.json({ history });
}

export async function restoreWorkflowVersionHandler(req: Request, res: Response) {
  const { version } = req.body;
  if (!version) return res.status(400).json({ error: 'Versão é obrigatória.' });

  try {
    const workflow = await restoreWorkflowVersion(req.tenantId!, req.user!.id, Number(version));
    writeAuditLog(req.tenantId, req.user!.id, 'WORKFLOW_RESTORE', { workflowId: workflow.id, restoredVersion: version });
    res.json({ success: true, workflow });
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    throw err;
  }
}

export async function publishWorkflowHandler(req: Request, res: Response) {
  try {
    const workflow = await publishWorkflow(req.tenantId!, req.user!.id);
    writeAuditLog(req.tenantId, req.user!.id, 'WORKFLOW_PUBLISH', { workflowId: workflow.id, version: workflow.version });
    res.json({ success: true, workflow });
  } catch (err) {
    if (err instanceof ValidationFailedError) {
      // 422: request was well-formed, but the workflow content fails ValidationEngine. The
      // frontend (TopBar/Inspector) must surface `issues` verbatim, never treat this as a
      // generic failure and never retry-as-success.
      return res.status(422).json({ error: err.message, issues: err.issues });
    }
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    throw err;
  }
}

// GET /workflow/:id/versions — published-version archive for one workflow, tenant-scoped by
// `req.tenantId` (never the raw `:id` param alone — see workflowRepository.findWorkflowByIdForTenant
// and AGENTS.md §15). Returns 404 rather than an empty tenant-agnostic list when the workflow
// belongs to another tenant or does not exist, so cross-tenant existence can never be inferred
// from the response shape.
export async function listWorkflowVersionsHandler(req: Request, res: Response) {
  try {
    const versions = await listWorkflowVersions(req.tenantId!, String(req.params.id));
    res.json({ versions });
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    throw err;
  }
}

// POST /workflow/:id/versions/:version/rollback — republishes an archived version's content as a
// brand new version. Goes through the same publish gates as publishWorkflowHandler and maps a
// gate failure to the same 422 shape.
export async function rollbackWorkflowVersionHandler(req: Request, res: Response) {
  const versionParam = Number(req.params.version);
  if (!Number.isInteger(versionParam) || versionParam < 1) {
    return res.status(400).json({ error: 'Versão inválida.' });
  }

  try {
    const workflow = await rollbackToVersion(req.tenantId!, req.user!.id, String(req.params.id), versionParam);
    writeAuditLog(req.tenantId, req.user!.id, 'WORKFLOW_ROLLBACK', {
      workflowId: workflow.id,
      rolledBackToVersion: versionParam,
      newVersion: workflow.version,
    });
    res.json({ success: true, workflow });
  } catch (err) {
    if (err instanceof ValidationFailedError) {
      return res.status(422).json({ error: err.message, issues: err.issues });
    }
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    throw err;
  }
}

export async function duplicateWorkflowHandler(req: Request, res: Response) {
  try {
    const workflow = await duplicateWorkflow(req.tenantId!, req.user!.id, req.body.sourceId); // mock param
    writeAuditLog(req.tenantId, req.user!.id, 'WORKFLOW_DUPLICATE', { originalId: req.body.sourceId, newId: workflow.id });
    res.json({ success: true, workflow });
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    throw err;
  }
}
