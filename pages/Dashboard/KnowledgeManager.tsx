import React, { useCallback, useEffect, useState } from 'react';
import {
  UploadCloud,
  RefreshCw,
  Database,
  Search,
  ShieldCheck,
  Plus,
  Trash2,
  FileText,
  AlertTriangle,
  X,
  Sparkles,
  Bot,
} from 'lucide-react';
import { Card, Button, Badge, EmptyState, Skeleton } from '../../components/design-system';
import { logger } from '../../lib/logger';

interface KnowledgeDoc {
  id: string;
  name: string;
  keyword: string;
  content?: string;
  addedAt?: number;
}

interface AgentItem {
  id: string;
  name: string;
  role: string;
  status: string;
  configuration?: {
    knowledge?: KnowledgeDoc[];
    [key: string]: unknown;
  };
}

interface RagTestResult {
  confidence: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  matches?: Array<{ keyword: string; name: string }>;
  hasDirectMatch?: boolean;
}

export default function KnowledgeManager() {
  const [agentsState, setAgentsState] = useState<{
    status: 'loading' | 'error' | 'ready';
    agents: AgentItem[];
  }>({ status: 'loading', agents: [] });
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Modals state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAddTextModalOpen, setIsAddTextModalOpen] = useState(false);
  const [isRagModalOpen, setIsRagModalOpen] = useState(false);

  // Upload Form
  const [uploadName, setUploadName] = useState('');
  const [uploadKeyword, setUploadKeyword] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Manual Add Form
  const [addName, setAddName] = useState('');
  const [addKeyword, setAddKeyword] = useState('');
  const [addContent, setAddContent] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // RAG Test
  const [ragQuery, setRagQuery] = useState('');
  const [ragTesting, setRagTesting] = useState(false);
  const [ragResult, setRagResult] = useState<RagTestResult | null>(null);
  const [ragError, setRagError] = useState<string | null>(null);

  // Deleting document
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    setAgentsState((prev) => ({ ...prev, status: 'loading' }));
    try {
      const res = await fetch('/api/agents');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: AgentItem[] = Array.isArray(data.agents) ? data.agents : [];
      setAgentsState({ status: 'ready', agents: list });

      setSelectedAgentId((current) => {
        if (current && list.some((a) => a.id === current)) return current;
        return list.length > 0 ? list[0].id : null;
      });
    } catch (err) {
      logger.error('Failed to load agents for knowledge manager', { err });
      setAgentsState({ status: 'error', agents: [] });
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const selectedAgent = agentsState.agents.find((a) => a.id === selectedAgentId) || null;
  const currentKnowledge = selectedAgent?.configuration?.knowledge || [];

  const filteredKnowledge = currentKnowledge.filter(
    (doc) =>
      doc.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      doc.keyword.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgentId || !uploadFile) return;

    setUploading(true);
    setUploadError(null);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64);
        };
        reader.onerror = () => reject(new Error('Erro ao ler arquivo local.'));
      });
      reader.readAsDataURL(uploadFile);
      const contentBase64 = await base64Promise;

      const res = await fetch(`/api/agents/${selectedAgentId}/knowledge/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: uploadName.trim(),
          keyword: uploadKeyword.trim(),
          fileName: uploadFile.name,
          contentBase64,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setIsUploadModalOpen(false);
      setUploadName('');
      setUploadKeyword('');
      setUploadFile(null);
      await fetchAgents();
    } catch (err) {
      logger.error('Knowledge upload failed', { err });
      setUploadError(err instanceof Error ? err.message : 'Falha ao enviar documento.');
    } finally {
      setUploading(false);
    }
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgentId) return;

    setAdding(true);
    setAddError(null);

    try {
      const res = await fetch(`/api/agents/${selectedAgentId}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgentId,
          name: addName.trim(),
          keyword: addKeyword.trim(),
          content: addContent.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setIsAddTextModalOpen(false);
      setAddName('');
      setAddKeyword('');
      setAddContent('');
      await fetchAgents();
    } catch (err) {
      logger.error('Manual knowledge add failed', { err });
      setAddError(err instanceof Error ? err.message : 'Falha ao adicionar documento.');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!selectedAgent || !selectedAgentId) return;

    setDeletingId(docId);
    try {
      const remaining = currentKnowledge.filter((d) => d.id !== docId);
      const res = await fetch(`/api/agents/${selectedAgentId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...selectedAgent.configuration,
          knowledge: remaining,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      await fetchAgents();
    } catch (err) {
      logger.error('Failed to delete knowledge document', { err });
    } finally {
      setDeletingId(null);
    }
  };

  const handleRunRagTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgentId || !ragQuery.trim()) return;

    setRagTesting(true);
    setRagError(null);
    setRagResult(null);

    try {
      const res = await fetch(`/api/agents/${selectedAgentId}/rag/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgentId,
          query: ragQuery.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setRagResult(data.result);
    } catch (err) {
      logger.error('RAG test failed', { err });
      setRagError(err instanceof Error ? err.message : 'Falha ao avaliar pergunta no RAG.');
    } finally {
      setRagTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Knowledge Base (RAG)</h1>
            <Badge variant="success" className="normal-case">
              <ShieldCheck className="h-3.5 w-3.5 mr-1 inline" />
              Antivírus ClamAV Ativo
            </Badge>
          </div>
          <p className="text-sm text-slate-500">
            Base de conhecimento vetorial e documentos contextuais indexados para seus agentes de voz.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => setIsRagModalOpen(true)}
            disabled={!selectedAgent || currentKnowledge.length === 0}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Testar RAG
          </Button>
          <Button variant="outline" onClick={() => setIsAddTextModalOpen(true)} disabled={!selectedAgent}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Texto
          </Button>
          <Button variant="primary" onClick={() => setIsUploadModalOpen(true)} disabled={!selectedAgent}>
            <UploadCloud className="h-4 w-4 mr-2" />
            Upload (.txt / .md)
          </Button>
        </div>
      </div>

      {/* Agents state handling */}
      {agentsState.status === 'loading' ? (
        <div className="space-y-4">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : agentsState.status === 'error' ? (
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8" />}
          title="Erro ao carregar agentes"
          description="Não foi possível consultar os agentes da organização."
          action={
            <Button variant="outline" onClick={fetchAgents}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar novamente
            </Button>
          }
        />
      ) : agentsState.agents.length === 0 ? (
        <EmptyState
          icon={<Bot className="h-8 w-8" />}
          title="Nenhum agente cadastrado"
          description="Crie um agente de voz primeiro para associar documentos e manuais à sua base de conhecimento."
          action={
            <Button variant="primary" onClick={() => window.location.assign('/dashboard/agent-os')}>
              Criar Agente
            </Button>
          }
        />
      ) : (
        <>
          {/* Agent Selection Pills / Bar */}
          <div className="flex items-center gap-3 overflow-x-auto pb-2 border-b border-slate-200 dark:border-slate-800">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">
              Agente Ativo:
            </span>
            {agentsState.agents.map((agent) => {
              const docCount = agent.configuration?.knowledge?.length || 0;
              const isSelected = agent.id === selectedAgentId;
              return (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-brand text-white font-medium shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Bot className="h-4 w-4" />
                  <span>{agent.name}</span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {docCount}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search & Stats Header */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Filtrar por nome ou palavra-chave..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-brand"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
              />
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-4">
              <span>Total de documentos: <strong>{currentKnowledge.length}</strong></span>
              <span>Agente: <strong>{selectedAgent?.name}</strong></span>
            </div>
          </div>

          {/* Document list or Empty state */}
          {currentKnowledge.length === 0 ? (
            <Card className="p-8">
              <EmptyState
                icon={<Database className="h-8 w-8" />}
                title="Base de conhecimento vazia"
                description={`O agente "${selectedAgent?.name}" ainda não possui nenhum documento indexado. Faça o upload de um arquivo .txt/.md ou adicione trechos de texto para habilitar respostas contextuais (RAG).`}
                action={
                  <div className="flex gap-2">
                    <Button variant="primary" size="sm" onClick={() => setIsUploadModalOpen(true)}>
                      <UploadCloud className="h-4 w-4 mr-1.5" />
                      Fazer Upload
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setIsAddTextModalOpen(true)}>
                      <Plus className="h-4 w-4 mr-1.5" />
                      Inserir Texto
                    </Button>
                  </div>
                }
              />
            </Card>
          ) : filteredKnowledge.length === 0 ? (
            <Card className="p-8 text-center text-slate-500">
              Nenhum documento encontrado para o filtro "{searchFilter}".
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredKnowledge.map((doc) => {
                const preview = doc.content ? doc.content.slice(0, 140) : '';
                const dateStr = doc.addedAt
                  ? new Date(doc.addedAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Recente';

                return (
                  <Card
                    key={doc.id}
                    className="p-5 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-all group"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <h3 className="font-semibold text-slate-900 dark:text-white text-base truncate flex-1" title={doc.name}>
                          {doc.name}
                        </h3>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {doc.keyword}
                        </Badge>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 mb-4 font-mono bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                        {preview || 'Sem conteúdo textual exibível.'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400">
                      <span>Adicionado: {dateStr}</span>
                      <button
                        onClick={() => handleDeleteDoc(doc.id)}
                        disabled={deletingId === doc.id}
                        className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-1 rounded-md transition-colors cursor-pointer"
                        title="Remover documento da base"
                        aria-label={`Remover ${doc.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* MODAL: Upload Documento com Antivírus */}
      {isUploadModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          <Card className="w-full max-w-md p-6 bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <UploadCloud className="h-5 w-5 text-brand" />
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Upload de Conhecimento</h2>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                aria-label="Fechar modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleFileUpload} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Documento
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Tabela de Preços 2026"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Palavra-chave / Tópico Principal
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: precos, planos, suporte"
                  value={uploadKeyword}
                  onChange={(e) => setUploadKeyword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Arquivo (.txt, .md, .json, .csv)
                </label>
                <input
                  type="file"
                  required
                  accept=".txt,.md,.json,.csv,text/plain,text/markdown"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand/10 file:text-brand hover:file:bg-brand/20 cursor-pointer"
                />
                <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                  Varredura antivírus obrigatória (ClamAV) antes da indexação.
                </p>
              </div>

              {uploadError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-600 dark:text-red-400">
                  {uploadError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsUploadModalOpen(false)}
                  disabled={uploading}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" size="sm" isLoading={uploading}>
                  Enviar e Indexar
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* MODAL: Adicionar Manualmente */}
      {isAddTextModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          <Card className="w-full max-w-lg p-6 bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-brand" />
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Inserir Conteúdo Textual</h2>
              </div>
              <button
                onClick={() => setIsAddTextModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                aria-label="Fechar modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleManualAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Título / Nome
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Regras de Cancelamento"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Palavra-chave
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: cancelamento, estorno, reembolso"
                  value={addKeyword}
                  onChange={(e) => setAddKeyword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Texto Completo / Instrução de Resposta
                </label>
                <textarea
                  required
                  rows={6}
                  placeholder="Insira o conteúdo detalhado que o agente deve usar para responder perguntas sobre este tópico..."
                  value={addContent}
                  onChange={(e) => setAddContent(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-brand"
                />
              </div>

              {addError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-600 dark:text-red-400">
                  {addError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddTextModalOpen(false)}
                  disabled={adding}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" size="sm" isLoading={adding}>
                  Salvar Documento
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* MODAL: Testador de RAG */}
      {isRagModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          <Card className="w-full max-w-lg p-6 bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-brand" />
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Simulador de Consulta RAG</h2>
              </div>
              <button
                onClick={() => setIsRagModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                aria-label="Fechar modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Simule a pergunta de um lead para avaliar se a base de conhecimento do agente "
              <strong>{selectedAgent?.name}</strong>" é recuperada com alta confiança.
            </p>

            <form onSubmit={handleRunRagTest} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Pergunta do Lead
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Ex: Como funciona a política de cancelamento?"
                    value={ragQuery}
                    onChange={(e) => setRagQuery(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-brand"
                  />
                  <Button type="submit" variant="primary" size="sm" isLoading={ragTesting}>
                    Consultar
                  </Button>
                </div>
              </div>

              {ragError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-600 dark:text-red-400">
                  {ragError}
                </div>
              )}

              {ragResult && (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Nível de Confiança
                    </span>
                    <Badge
                      variant={
                        ragResult.confidenceLevel === 'high'
                          ? 'success'
                          : ragResult.confidenceLevel === 'medium'
                          ? 'warning'
                          : 'danger'
                      }
                    >
                      {ragResult.confidenceLevel === 'high'
                        ? 'Alta Confiança'
                        : ragResult.confidenceLevel === 'medium'
                        ? 'Média Confiança'
                        : 'Baixa Confiança'} ({(ragResult.confidence * 100).toFixed(0)}%)
                    </Badge>
                  </div>

                  {ragResult.matches && ragResult.matches.length > 0 ? (
                    <div>
                      <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">
                        Documentos com correspondência:
                      </span>
                      <div className="space-y-1">
                        {ragResult.matches.map((m, idx) => (
                          <div
                            key={idx}
                            className="text-xs bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800 flex justify-between items-center"
                          >
                            <span className="font-medium text-slate-800 dark:text-slate-200">{m.name}</span>
                            <Badge variant="secondary" className="text-[10px]">
                              {m.keyword}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Nenhuma correspondência direta encontrada na base de conhecimento. O agente usará o prompt geral ou fallback.
                    </p>
                  )}
                </div>
              )}
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
