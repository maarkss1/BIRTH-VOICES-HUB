import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../services/agentService.js', () => ({
  getAgent: vi.fn(),
  updateAgentConfig: vi.fn(),
}));

// Agente 06's real antivirus module talks to ClamAV over the network — mocked here (same pattern
// already used by `src/infrastructure/antivirus.test.ts`) so these tests exercise the controller's
// scan-first ordering and error-mapping without a real ClamAV daemon.
vi.mock('../infrastructure/antivirus.js', async () => {
  const actual = await vi.importActual<typeof import('../infrastructure/antivirus.js')>('../infrastructure/antivirus.js');
  return {
    ...actual,
    scanBufferForViruses: vi.fn(),
  };
});

import { getAgent, updateAgentConfig } from '../services/agentService.js';
import { AntivirusUnavailableError, InfectedFileError, scanBufferForViruses } from '../infrastructure/antivirus.js';
import { uploadKnowledgeDocumentHandler } from './knowledge.controller.js';

const mockGetAgent = vi.mocked(getAgent);
const mockUpdateAgentConfig = vi.mocked(updateAgentConfig);
const mockScan = vi.mocked(scanBufferForViruses);

// The canonical EICAR antivirus test string — genuinely plain ASCII text, so it only tests
// "clean" here when the scan is mocked to reject it, exactly like a real ClamAV would.
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

function fakeAgent(knowledge: unknown[] = []) {
  return {
    id: 'agent-1',
    tenantId: 'tenant-1',
    userId: null,
    name: 'Agente de teste',
    model: 'gemini',
    configuration: { knowledge },
    phoneNumber: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  } as unknown as NonNullable<Awaited<ReturnType<typeof getAgent>>>;
}

function fakeReq(body: Record<string, unknown>): Request {
  return {
    params: { id: 'agent-1' },
    body,
    tenantId: 'tenant-1',
  } as unknown as Request;
}

function fakeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAgent.mockResolvedValue(fakeAgent());
  mockScan.mockResolvedValue({ clean: true });
});

describe('uploadKnowledgeDocumentHandler', () => {
  it('rejects an infected upload (EICAR) with 422 and never indexes it', async () => {
    mockScan.mockRejectedValue(new InfectedFileError('eicar.txt', ['EICAR-Test-File']));
    const req = fakeReq({
      name: 'Malicioso',
      keyword: 'malware',
      fileName: 'eicar.txt',
      contentBase64: Buffer.from(EICAR, 'utf8').toString('base64'),
    });
    const res = fakeRes();

    await uploadKnowledgeDocumentHandler(req, res);

    expect(mockScan).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(mockUpdateAgentConfig).not.toHaveBeenCalled();
  });

  it('rejects with 503 (fail closed) when the antivirus scanner itself is unavailable, never proceeding unscanned', async () => {
    mockScan.mockRejectedValue(new AntivirusUnavailableError(new Error('ECONNREFUSED')));
    const req = fakeReq({
      name: 'Doc',
      keyword: 'doc',
      fileName: 'doc.txt',
      contentBase64: Buffer.from('conteúdo legítimo', 'utf8').toString('base64'),
    });
    const res = fakeRes();

    await uploadKnowledgeDocumentHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockUpdateAgentConfig).not.toHaveBeenCalled();
  });

  it('accepts a clean, valid .md file and indexes its decoded content into config.knowledge', async () => {
    const markdown = '# Política de reembolso\n\nReembolsos em até 5 dias úteis.';
    const req = fakeReq({
      name: 'Política de reembolso',
      keyword: 'reembolso',
      fileName: 'reembolso.md',
      contentBase64: Buffer.from(markdown, 'utf8').toString('base64'),
    });
    const res = fakeRes();

    await uploadKnowledgeDocumentHandler(req, res);

    expect(mockScan).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(mockUpdateAgentConfig).toHaveBeenCalledTimes(1);
    const [, , configData] = mockUpdateAgentConfig.mock.calls[0];
    expect(configData.knowledge).toEqual([
      expect.objectContaining({ name: 'Política de reembolso', keyword: 'reembolso', content: markdown }),
    ]);
  });

  it('rejects a binary disguised as .txt (non-UTF-8 bytes) with 422 and never fabricates extracted text', async () => {
    // A real PDF/DOCX starts with binary bytes that are not valid UTF-8 (or, even if a stray
    // sequence is, decode overwhelmingly to control characters) — simulated here directly.
    const binary = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x00, 0xff, 0xfe, 0x00, 0x01, 0x02, 0x03, 0x80, 0x81, 0x90]);
    const req = fakeReq({
      name: 'PDF disfarçado',
      keyword: 'pdf',
      fileName: 'documento.txt',
      contentBase64: binary.toString('base64'),
    });
    const res = fakeRes();

    await uploadKnowledgeDocumentHandler(req, res);

    expect(mockScan).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(mockUpdateAgentConfig).not.toHaveBeenCalled();
  });

  it('scans for viruses before doing anything else, even before the text-validity check', async () => {
    mockScan.mockRejectedValue(new InfectedFileError('binario.bin', ['Test-Virus']));
    const binary = Buffer.from([0x00, 0xff, 0xfe, 0x01, 0x02]);
    const req = fakeReq({
      name: 'Binário',
      keyword: 'bin',
      fileName: 'binario.bin',
      contentBase64: binary.toString('base64'),
    });
    const res = fakeRes();

    await uploadKnowledgeDocumentHandler(req, res);

    // The virus verdict wins even though the payload would also fail the text-validity check —
    // proving scan-before-anything-else ordering, not merely that both checks independently fail.
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('infectado') }));
  });

  it('returns 404 without scanning when the agent does not belong to the caller tenant', async () => {
    mockGetAgent.mockResolvedValue(null);
    const req = fakeReq({
      name: 'Doc',
      keyword: 'doc',
      fileName: 'doc.txt',
      contentBase64: Buffer.from('texto', 'utf8').toString('base64'),
    });
    const res = fakeRes();

    await uploadKnowledgeDocumentHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockScan).not.toHaveBeenCalled();
  });

  it('returns 400 when a required field is missing', async () => {
    const req = fakeReq({ name: 'Doc', keyword: 'doc', fileName: 'doc.txt' });
    const res = fakeRes();

    await uploadKnowledgeDocumentHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockScan).not.toHaveBeenCalled();
  });
});
