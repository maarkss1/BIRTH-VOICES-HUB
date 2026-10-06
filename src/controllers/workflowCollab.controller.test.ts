import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import {
  addCommentHandler,
  resolveCommentHandler,
  lockNodeHandler,
  unlockNodeHandler,
} from './workflowCollab.controller.js';
import {
  addComment,
  resolveComment,
  lockNode,
  unlockNode,
  ConflictError,
} from '../services/workflowCollabService.js';
import { NotFoundError } from '../services/workflowService.js';

vi.mock('../services/workflowCollabService.js', () => ({
  addComment: vi.fn(),
  resolveComment: vi.fn(),
  lockNode: vi.fn(),
  unlockNode: vi.fn(),
  ConflictError: class ConflictError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ConflictError';
    }
  },
}));

vi.mock('../services/workflowService.js', () => ({
  NotFoundError: class NotFoundError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'NotFoundError';
    }
  },
}));

function fakeResponse() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe('workflowCollab.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addCommentHandler', () => {
    it('returns 400 when nodeId or text is missing', async () => {
      const req = {
        tenantId: 'tenant-1',
        user: { id: 'user-1' },
        body: { nodeId: 'node-1' },
      } as unknown as Request;
      const res = fakeResponse();

      await addCommentHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'nodeId e text são obrigatórios.' });
    });

    it('adds comment and returns success with workflow', async () => {
      const mockWorkflow = { id: 'wf-1', name: 'Fluxo 1' };
      vi.mocked(addComment).mockResolvedValue(mockWorkflow as never);

      const req = {
        tenantId: 'tenant-1',
        user: { id: 'user-1' },
        body: { nodeId: 'node-1', text: 'Rever este nó de roteamento' },
      } as unknown as Request;
      const res = fakeResponse();

      await addCommentHandler(req, res);

      expect(addComment).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        'node-1',
        'Rever este nó de roteamento'
      );
      expect(res.json).toHaveBeenCalledWith({ success: true, workflow: mockWorkflow });
    });

    it('returns 404 when workflow or node is not found', async () => {
      vi.mocked(addComment).mockRejectedValue(new NotFoundError('Workflow não encontrado.'));

      const req = {
        tenantId: 'tenant-1',
        user: { id: 'user-1' },
        body: { nodeId: 'node-missing', text: 'Texto' },
      } as unknown as Request;
      const res = fakeResponse();

      await addCommentHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Workflow não encontrado.' });
    });

    it('returns 409 when conflict occurs', async () => {
      vi.mocked(addComment).mockRejectedValue(new ConflictError('Nó bloqueado por outro usuário.'));

      const req = {
        tenantId: 'tenant-1',
        user: { id: 'user-1' },
        body: { nodeId: 'node-locked', text: 'Texto' },
      } as unknown as Request;
      const res = fakeResponse();

      await addCommentHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: 'Nó bloqueado por outro usuário.' });
    });
  });

  describe('resolveCommentHandler', () => {
    it('returns 400 when commentId is missing', async () => {
      const req = {
        tenantId: 'tenant-1',
        user: { id: 'user-1' },
        body: {},
      } as unknown as Request;
      const res = fakeResponse();

      await resolveCommentHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'commentId é obrigatório.' });
    });

    it('resolves comment and returns updated workflow', async () => {
      const mockWorkflow = { id: 'wf-1', name: 'Fluxo 1' };
      vi.mocked(resolveComment).mockResolvedValue(mockWorkflow as never);

      const req = {
        tenantId: 'tenant-1',
        user: { id: 'user-1' },
        body: { commentId: 'comment-123' },
      } as unknown as Request;
      const res = fakeResponse();

      await resolveCommentHandler(req, res);

      expect(resolveComment).toHaveBeenCalledWith('tenant-1', 'user-1', 'comment-123');
      expect(res.json).toHaveBeenCalledWith({ success: true, workflow: mockWorkflow });
    });
  });

  describe('lockNodeHandler and unlockNodeHandler', () => {
    it('returns 400 when nodeId is missing in lock', async () => {
      const req = {
        tenantId: 'tenant-1',
        user: { id: 'user-1' },
        body: {},
      } as unknown as Request;
      const res = fakeResponse();

      await lockNodeHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'nodeId é obrigatório.' });
    });

    it('locks node successfully', async () => {
      const mockWorkflow = { id: 'wf-1', lockedNodes: ['node-1'] };
      vi.mocked(lockNode).mockResolvedValue(mockWorkflow as never);

      const req = {
        tenantId: 'tenant-1',
        user: { id: 'user-1' },
        body: { nodeId: 'node-1' },
      } as unknown as Request;
      const res = fakeResponse();

      await lockNodeHandler(req, res);

      expect(lockNode).toHaveBeenCalledWith('tenant-1', 'user-1', 'node-1');
      expect(res.json).toHaveBeenCalledWith({ success: true, workflow: mockWorkflow });
    });

    it('returns 409 when lockNode detects conflict', async () => {
      vi.mocked(lockNode).mockRejectedValue(new ConflictError('Nó já está em edição por outro usuário.'));

      const req = {
        tenantId: 'tenant-1',
        user: { id: 'user-2' },
        body: { nodeId: 'node-1' },
      } as unknown as Request;
      const res = fakeResponse();

      await lockNodeHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: 'Nó já está em edição por outro usuário.' });
    });

    it('returns 400 when nodeId is missing in unlock', async () => {
      const req = {
        tenantId: 'tenant-1',
        user: { id: 'user-1' },
        body: {},
      } as unknown as Request;
      const res = fakeResponse();

      await unlockNodeHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'nodeId é obrigatório.' });
    });

    it('unlocks node successfully', async () => {
      const mockWorkflow = { id: 'wf-1', lockedNodes: [] };
      vi.mocked(unlockNode).mockResolvedValue(mockWorkflow as never);

      const req = {
        tenantId: 'tenant-1',
        user: { id: 'user-1' },
        body: { nodeId: 'node-1' },
      } as unknown as Request;
      const res = fakeResponse();

      await unlockNodeHandler(req, res);

      expect(unlockNode).toHaveBeenCalledWith('tenant-1', 'user-1', 'node-1');
      expect(res.json).toHaveBeenCalledWith({ success: true, workflow: mockWorkflow });
    });
  });
});
