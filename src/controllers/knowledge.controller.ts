import { Request, Response } from 'express';
import { getAgent, updateAgentConfig } from '../services/agentService.js';
import { knowledgeConfidenceEngine } from '../../lib/voice-runtime/intelligence/KnowledgeConfidenceEngine.js';
import { AgentConfiguration } from '../types/agent.js';
import { AntivirusUnavailableError, InfectedFileError, scanBufferForViruses } from '../infrastructure/antivirus.js';
import { logger } from '../lib/logger.js';

export async function addKnowledgeDocumentHandler(req: Request, res: Response) {
  try {
     const { agentId, name, keyword, content } = req.body;
     const agent = await getAgent(agentId, req.tenantId!);
     if (!agent) return res.status(404).json({ error: 'Agente não encontrado.' });

     const config = (agent.configuration as unknown as AgentConfiguration) || {};
     const knowledge = config.knowledge || [];
     knowledge.push({ id: crypto.randomUUID(), name, keyword, content, addedAt: Date.now() });

     await updateAgentConfig(agentId, req.tenantId!, { knowledge });
     res.json({ success: true, message: 'Documento adicionado à base de conhecimento do agente.' });
  } catch (err: unknown) {
     res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

// Any UTF-8 control character above this ratio of the decoded text is treated as "not plain
// text" — a real binary (PDF/DOCX/image) decoded as UTF-8 is overwhelmingly likely to fail this,
// while genuine prose/Markdown (which only carries \t/\n/\r as control characters) stays well
// under it.
const MAX_NON_PRINTABLE_RATIO = 0.05;

/**
 * Decodes `buffer` as plain UTF-8 text, or returns `null` if it is not genuinely plain text.
 *
 * Two independent checks, both required (AGENTS.md §14: never fabricate — never pretend to have
 * extracted text from a binary):
 * 1. The buffer must round-trip losslessly through UTF-8 decode/encode. `Buffer#toString('utf8')`
 *    silently replaces invalid byte sequences with U+FFFD instead of throwing, so decoding alone
 *    cannot detect a binary file — re-encoding the decoded string and comparing byte-for-byte
 *    against the original buffer does: any invalid sequence in the original changes the
 *    re-encoded bytes.
 * 2. Even a buffer that happens to be valid UTF-8 (some binaries occasionally are, by chance, for
 *    short inputs) is rejected if too much of it decodes to control characters other than
 *    tab/newline/carriage-return — real prose/Markdown essentially never does.
 */
function decodePlainText(buffer: Buffer): string | null {
  const text = buffer.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(buffer)) return null;
  if (!text.trim()) return null;

  let totalChars = 0;
  let nonPrintable = 0;
  for (const char of text) {
    totalChars += 1;
    const code = char.codePointAt(0) ?? 0;
    const isAllowedWhitespace = char === '\t' || char === '\n' || char === '\r';
    if ((code < 0x20 && !isAllowedWhitespace) || code === 0x7f || code === 0xfffd) {
      nonPrintable += 1;
    }
  }

  if (totalChars === 0 || nonPrintable / totalChars > MAX_NON_PRINTABLE_RATIO) return null;
  return text;
}

/**
 * Text-only knowledge upload (Onda 6 MVP — see
 * `.agents/handoffs/onda-6/00-para-04-tool-midcall-voice-upload.md`, Tarefa 3). Deliberately a
 * JSON body (`express.json()`, already mounted in `server.ts`), not `multipart/form-data`: adding
 * `multer`/a PDF/DOCX parser is a new dependency, which `AGENTS.md` §11 reserves for the
 * Coordinator's explicit approval — out of scope for this round.
 *
 * Every buffer is scanned for viruses (`scanBufferForViruses`, Agente 06's
 * `src/infrastructure/antivirus.ts`, ClamAV) BEFORE anything else happens to it — before it is
 * even decoded as text — per AGENTS.md bloqueador #10. `InfectedFileError`/
 * `AntivirusUnavailableError` both reject the upload (422/503); neither is ever caught and
 * silently downgraded to "proceed anyway".
 *
 * PDF/DOCX are explicitly NOT supported yet: there is no extraction pipeline for them in this
 * round, and pretending to extract text from a binary would violate AGENTS.md §14 ("never
 * fabricate"). A binary payload is rejected with an honest 422, not silently indexed as garbled
 * text.
 */
export async function uploadKnowledgeDocumentHandler(req: Request, res: Response) {
  try {
    const { name, keyword, fileName, contentBase64 } = req.body as {
      name?: unknown;
      keyword?: unknown;
      fileName?: unknown;
      contentBase64?: unknown;
    };
    const agentId = String(req.params.id);

    if (
      typeof name !== 'string' || !name.trim()
      || typeof keyword !== 'string' || !keyword.trim()
      || typeof fileName !== 'string' || !fileName.trim()
      || typeof contentBase64 !== 'string' || !contentBase64.trim()
    ) {
      return res.status(400).json({
        error: 'Campos obrigatórios: name, keyword, fileName, contentBase64.',
      });
    }

    const agent = await getAgent(agentId, req.tenantId!);
    if (!agent) return res.status(404).json({ error: 'Agente não encontrado.' });

    let buffer: Buffer;
    try {
      buffer = Buffer.from(contentBase64, 'base64');
    } catch {
      return res.status(400).json({ error: 'contentBase64 não é uma string base64 válida.' });
    }
    if (buffer.length === 0) {
      return res.status(400).json({ error: 'Arquivo vazio.' });
    }

    try {
      await scanBufferForViruses(buffer, fileName);
    } catch (error) {
      if (error instanceof InfectedFileError) {
        logger.warn('Knowledge upload rejected: infected file', {
          agentId,
          tenantId: req.tenantId,
          fileName,
          viruses: error.viruses,
        });
        return res.status(422).json({ error: error.message });
      }
      if (error instanceof AntivirusUnavailableError) {
        logger.error('Knowledge upload rejected: antivirus scan unavailable', {
          agentId,
          tenantId: req.tenantId,
          fileName,
        });
        return res.status(503).json({ error: error.message });
      }
      throw error;
    }

    const content = decodePlainText(buffer);
    if (content === null) {
      return res.status(422).json({
        error: 'Apenas arquivos de texto simples (.txt, .md) são suportados nesta versão — PDF/DOCX ainda não têm pipeline de extração.',
      });
    }

    const config = (agent.configuration as unknown as AgentConfiguration) || {};
    const knowledge = config.knowledge || [];
    knowledge.push({
      id: crypto.randomUUID(),
      name: name.trim(),
      keyword: keyword.trim(),
      content,
      addedAt: Date.now(),
    });

    await updateAgentConfig(agentId, req.tenantId!, { knowledge });
    res.json({ success: true, message: 'Documento adicionado à base de conhecimento do agente.' });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

export async function testRagQueryHandler(req: Request, res: Response) {
  try {
     const { agentId, query } = req.body;
     const agent = await getAgent(agentId, req.tenantId!);
     if (!agent) return res.status(404).json({ error: 'Agente não encontrado.' });

     const config = (agent.configuration as unknown as AgentConfiguration) || {};
     const knowledge = config.knowledge || [];

     const result = knowledgeConfidenceEngine.evaluateKnowledge(query, knowledge);
     res.json({ success: true, result });
  } catch (err: unknown) {
     res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
