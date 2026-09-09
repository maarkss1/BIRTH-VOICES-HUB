import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, Phone, FileText, Sparkles, CheckCircle2,
  Play, Code, ShieldCheck, Activity,
  RefreshCw, Database, Server,
  ShieldAlert, AlertTriangle
} from 'lucide-react';
import {
  Card, Button, Badge, Progress, Spinner, Skeleton, EmptyState, Alert,
  Tooltip, Modal, useToast, ToastContainer
} from '../../components/design-system';
import { logger } from '../../lib/logger';

interface CallLogEntry {
  id: string;
  contactName?: string;
  duration?: string;
  agent?: string;
  status?: string;
  time?: string;
  timestamp?: string;
}

interface AgentRecord {
  id: string;
  name: string;
  model: string;
  phoneNumber?: string;
  updatedAt?: string;
}

interface ReadyChecks {
  database: 'ok' | 'error';
  redis: 'ok' | 'error';
}

// One row of GET /api/metrics — see prisma/schema.prisma `Metric`. For SLA we only care about
// `name === 'platform_ready_check'` rows (Agente 10, src/services/slaScheduler.ts): a real
// Postgres+Redis health check sampled every ~5 minutes and persisted per tenant, never fabricated.
interface MetricEntry {
  id: string;
  name: string;
  value: number;
  tags?: Record<string, unknown>;
  timestamp: string;
}

type FetchStatus = 'loading' | 'ready' | 'error';

const SLA_READY_CHECK_METRIC = 'platform_ready_check';
const SLA_WINDOW_MS = 24 * 60 * 60 * 1000; // last 24h — see handoff onda-4/10-para-02-sla-telemetria-overview.md

// Names which real component(s) failed on a given platform_ready_check sample, from its `tags`
// (`{ database: 'ok'|'error', redis: 'ok'|'error' }`). Returns null when the sample was healthy.
function describeSlaFailure(sample: MetricEntry | undefined): string | null {
  if (!sample || sample.value !== 0) return null;
  const tags = sample.tags ?? {};
  const failed: string[] = [];
  if (tags.database && tags.database !== 'ok') failed.push('banco de dados');
  if (tags.redis && tags.redis !== 'ok') failed.push('Redis');
  return failed.length > 0 ? failed.join(' e ') : 'componente não identificado';
}

// Parses a "mm:ss" call-duration string into whole seconds. Real call durations are free-text
// (see prisma CallLog.duration / callLogRepository.createCallLog) so not every value is
// guaranteed to match — anything that doesn't parse is simply excluded from the average rather
// than silently coerced to 0, which would understate real call length.
function parseDurationToSeconds(duration?: string): number | null {
  if (!duration) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(duration.trim());
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (Number.isNaN(minutes) || Number.isNaN(seconds)) return null;
  return minutes * 60 + seconds;
}

function formatSecondsAsDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function RebuiltExecutiveOverview() {
  const navigate = useNavigate();
  const { toasts, showToast } = useToast();

  // Onboarding Checklist — real, persisted server-side (GET/POST /api/onboarding). Kept `null`
  // until the first fetch resolves so we never render the server's default checklist as if it
  // had already been confirmed loaded (avoids a flash of "done" state before real data arrives).
  const [checklist, setChecklist] = useState<Record<string, boolean> | null>(null);
  const [checklistError, setChecklistError] = useState(false);

  const [callsState, setCallsState] = useState<{ status: FetchStatus; calls: CallLogEntry[] }>({
    status: 'loading',
    calls: [],
  });
  const [agentsState, setAgentsState] = useState<{ status: FetchStatus; agents: AgentRecord[] }>({
    status: 'loading',
    agents: [],
  });
  const [readyState, setReadyState] = useState<{ status: FetchStatus; checks: ReadyChecks | null }>({
    status: 'loading',
    checks: null,
  });
  // Real SLA samples (GET /api/metrics, name: platform_ready_check) — see
  // .agents/handoffs/onda-4/10-para-02-sla-telemetria-overview.md. Never a fabricated percentage.
  const [slaState, setSlaState] = useState<{ status: FetchStatus; samples: MetricEntry[] }>({
    status: 'loading',
    samples: [],
  });

  const fetchCalls = useCallback(async () => {
    setCallsState((prev) => ({ ...prev, status: 'loading' }));
    try {
      const res = await fetch('/api/call-logs');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCallsState({ status: 'ready', calls: Array.isArray(data.callLogs) ? data.callLogs : [] });
    } catch (err) {
      logger.error('Error loading call logs', { err });
      setCallsState((prev) => ({ ...prev, status: 'error' }));
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    setAgentsState((prev) => ({ ...prev, status: 'loading' }));
    try {
      const res = await fetch('/api/agents');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAgentsState({ status: 'ready', agents: Array.isArray(data.agents) ? data.agents : [] });
    } catch (err) {
      logger.error('Error loading agents', { err });
      setAgentsState((prev) => ({ ...prev, status: 'error' }));
    }
  }, []);

  const fetchReady = useCallback(async () => {
    setReadyState((prev) => ({ ...prev, status: 'loading' }));
    try {
      const res = await fetch('/api/ready');
      const data = await res.json();
      setReadyState({ status: 'ready', checks: data.checks ?? null });
    } catch (err) {
      logger.error('Error loading platform readiness', { err });
      setReadyState({ status: 'error', checks: null });
    }
  }, []);

  // GET /api/metrics is tenant-scoped and mixes several event names (ai_call_*, platform_ready_check,
  // …) — filter down to the SLA sampler's events client-side, same convention as Agente 04's
  // handoff for the cost/tokens/latency cards.
  const fetchSla = useCallback(async () => {
    setSlaState((prev) => ({ ...prev, status: 'loading' }));
    try {
      const res = await fetch('/api/metrics');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const allMetrics: MetricEntry[] = Array.isArray(data.metrics) ? data.metrics : [];
      const samples = allMetrics
        .filter((m) => m.name === SLA_READY_CHECK_METRIC)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setSlaState({ status: 'ready', samples });
    } catch (err) {
      logger.error('Error loading SLA samples', { err });
      setSlaState((prev) => ({ ...prev, status: 'error' }));
    }
  }, []);

  useEffect(() => {
    const fetchChecklist = async () => {
      try {
        const res = await fetch('/api/onboarding');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setChecklist(data.checklist ?? {});
      } catch (err) {
        logger.error('Error loading onboarding checklist from database', { err });
        setChecklistError(true);
        setChecklist({});
      }
    };

    fetchChecklist();
    fetchCalls();
    fetchAgents();
    fetchReady();
    fetchSla();
  }, [fetchCalls, fetchAgents, fetchReady, fetchSla]);

  const updateChecklist = async (key: string, value: boolean) => {
    if (!checklist) return;
    const updated = { ...checklist, [key]: value };
    setChecklist(updated);
    showToast(`Checklist atualizado! Progresso atualizado para ${Math.round(calculateOnboardingProgress(updated))}%`, 'info');

    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: updated }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      logger.error('Error saving onboarding checklist to database', { err });
      showToast('Não foi possível salvar o checklist no servidor. Tente novamente.', 'error');
    }
  };

  const calculateOnboardingProgress = (currentList: Record<string, boolean> | null = checklist) => {
    if (!currentList) return 0;
    const keys = Object.keys(currentList);
    if (keys.length === 0) return 0;
    const completed = keys.filter((k) => currentList[k]).length;
    return (completed / keys.length) * 100;
  };

  // Active onboarding tab/wizard step
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardCollapsed, setWizardCollapsed] = useState(false);

  // Modals for Quick Actions
  const [activeActionModal, setActiveActionModal] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'kpis' | 'audit' | 'analytics'>('kpis');

  // Quick action executor
  const handleExecuteQuickAction = (type: string) => {
    setActiveActionModal(null);

    if (type === 'agent') {
      showToast('Abrindo formulário de criação de agente...', 'info');
      navigate('/dashboard/agents/new');
    } else if (type === 'telephony') {
      navigate('/dashboard/telephony');
    } else if (type === 'test') {
      navigate('/dashboard/playground');
    } else if (type === 'knowledge') {
      navigate('/dashboard/knowledge');
    }
  };

  // ---- Real, derived metrics (no fabricated numbers) ----
  const totalAgents = agentsState.agents.length;
  const agentsWithPhone = agentsState.agents.filter((a) => !!a.phoneNumber).length;

  const totalCalls = callsState.calls.length;
  const today = new Date();
  const callsToday = callsState.calls.filter((c) => {
    if (!c.timestamp) return false;
    const d = new Date(c.timestamp);
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  }).length;

  const completedCalls = callsState.calls.filter((c) => c.status === 'Concluído').length;
  const completionRate = totalCalls > 0 ? (completedCalls / totalCalls) * 100 : null;

  const parsedDurations = callsState.calls
    .map((c) => parseDurationToSeconds(c.duration))
    .filter((v): v is number => v !== null);
  const avgDuration = parsedDurations.length > 0
    ? formatSecondsAsDuration(parsedDurations.reduce((a, b) => a + b, 0) / parsedDurations.length)
    : null;

  // SLA (disponibilidade) — real uptime approximation from platform_ready_check samples in the
  // last 24h, never a fabricated percentage. Empty (not zero) until the scheduler has produced at
  // least one sample for this tenant — see .agents/handoffs/onda-4/10-para-02-sla-telemetria-overview.md.
  const slaWindowSamples = slaState.samples.filter(
    (m) => Date.now() - new Date(m.timestamp).getTime() <= SLA_WINDOW_MS
  );
  const slaUptimePercent = slaWindowSamples.length > 0
    ? (slaWindowSamples.filter((m) => m.value === 1).length / slaWindowSamples.length) * 100
    : null;
  const slaLastFailure = describeSlaFailure(slaState.samples[0]);
  const slaCaption = slaUptimePercent !== null
    ? `${slaWindowSamples.length} amostra${slaWindowSamples.length === 1 ? '' : 's'} (24h) · a cada 5 min${slaLastFailure ? ` · última falha: ${slaLastFailure}` : ''}`
    : 'Ainda sem amostras suficientes';

  return (
    <div className="space-y-8 animate-slide-up text-left">

      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {today.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 font-sans tracking-tight mt-1">
            Birth Hub 360 Executive
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm max-w-xl">
            Plataforma omnicanal de IA de voz para prospecção e atendimento.
          </p>
        </div>

        {/* PLATFORM READINESS — real data from GET /api/ready (database + redis), not a
            decorative "everything is green" claim. */}
        <div className="flex flex-wrap items-center gap-3 bg-slate-100 dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700 w-full lg:w-auto">
          <div className="text-left mr-2 lg:border-r border-slate-200 dark:border-slate-700 pr-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Status da Plataforma</p>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 font-mono">
              {today.toLocaleTimeString('pt-BR')} (UTC-3)
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold">
            {readyState.status === 'loading' && (
              <span className="flex items-center gap-1.5 text-slate-400">
                <Spinner size="sm" /> Verificando...
              </span>
            )}
            {readyState.status === 'error' && (
              <span className="flex items-center gap-1.5 text-red-500">
                <span className="h-2 w-2 rounded-full bg-red-500" /> Indisponível
              </span>
            )}
            {readyState.status === 'ready' && (
              <>
                <Tooltip text="Conexão com o banco de dados (PostgreSQL)">
                  <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <Database className="h-3 w-3" />
                    <span className={`h-2 w-2 rounded-full ${readyState.checks?.database === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
                    Banco de Dados
                  </span>
                </Tooltip>
                <Tooltip text="Fila/cache Redis (sessões, idempotência)">
                  <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <Server className="h-3 w-3" />
                    <span className={`h-2 w-2 rounded-full ${readyState.checks?.redis === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
                    Redis
                  </span>
                </Tooltip>
              </>
            )}
          </div>
        </div>
      </div>

      {/* QUICK ACTIONS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="p-4 hover:border-brand cursor-pointer transition-colors flex items-center gap-3" onClick={() => setActiveActionModal('agent')}>
          <div className="p-2 bg-brand/10 text-brand rounded-lg"><Users className="h-5 w-5" /></div>
          <div className="text-left">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm">Criar Agente</h4>
            <p className="text-xs text-slate-500">Configurar novo agente</p>
          </div>
        </Card>
        <Card className="p-4 hover:border-brand cursor-pointer transition-colors flex items-center gap-3" onClick={() => navigate('/dashboard/analytics')}>
          <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg"><Activity className="h-5 w-5" /></div>
          <div className="text-left">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm">Ver Análises</h4>
            <p className="text-xs text-slate-500">Métricas recentes</p>
          </div>
        </Card>
        <Card className="p-4 hover:border-brand cursor-pointer transition-colors flex items-center gap-3" onClick={() => navigate('/dashboard/playground')}>
          <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg"><Play className="h-5 w-5" /></div>
          <div className="text-left">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm">Acessar Playground</h4>
            <p className="text-xs text-slate-500">Testar chamadas</p>
          </div>
        </Card>
        <Card className="p-4 hover:border-brand cursor-pointer transition-colors flex items-center gap-3" onClick={() => navigate('/dashboard/knowledge')}>
          <div className="p-2 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg"><FileText className="h-5 w-5" /></div>
          <div className="text-left">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm">Nova Base</h4>
            <p className="text-xs text-slate-500">Importar conhecimento</p>
          </div>
        </Card>
      </div>

      {/* COMPACT ONBOARDING WIZARD & CHECKLIST */}
      {checklist === null ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="lg:col-span-2 space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <AnimatePresence>
          {!wizardCollapsed && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-brand-50/50 dark:bg-brand-950/20 p-6 rounded-2xl border border-brand-100 dark:border-brand-900/40"
            >
              {/* Onboarding Wizard (Left 2 cols) */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="primary">Guia de Onboarding</Badge>
                    <span className="text-xs text-slate-500 font-bold">Inicie sua operação em minutos</span>
                  </div>
                  <button
                    onClick={() => setWizardCollapsed(true)}
                    className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-semibold"
                  >
                    Minimizar
                  </button>
                </div>

                {checklistError && (
                  <Alert variant="warning" title="Não foi possível carregar seu progresso salvo" description="Exibindo checklist local; suas próximas alterações ainda serão salvas ao servidor." />
                )}

                <div className="text-left space-y-1">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    Bem-vindo ao Birth Voices Hub
                    <Sparkles className="h-4 w-4 text-amber-500" />
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-450 leading-relaxed">
                    Siga o assistente passo a passo para configurar e testar sua atendente virtual.
                  </p>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-bold text-brand">Progresso do Setup</span>
                    <span className="text-xs font-bold text-brand font-mono">{Math.round(calculateOnboardingProgress())}%</span>
                  </div>
                  <Progress value={calculateOnboardingProgress()} />
                </div>

                {/* Wizard Steps Layout */}
                <div className="grid grid-cols-4 gap-2 pt-2">
                  {[
                    { step: 0, title: 'Organização', active: !!checklist.orgCreated },
                    { step: 1, title: 'IA Agente', active: !!checklist.agentCreated },
                    { step: 2, title: 'Telefonia', active: !!checklist.telephonyConnected },
                    { step: 3, title: 'Atendimento', active: !!checklist.firstCallCompleted },
                  ].map((item) => (
                    <button
                      key={item.step}
                      onClick={() => setWizardStep(item.step)}
                      className={`p-2.5 rounded-lg border text-center transition-all ${
                        wizardStep === item.step
                          ? 'bg-white dark:bg-slate-800 border-brand shadow-sm font-bold text-slate-900 dark:text-white'
                          : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-white/40'
                      }`}
                    >
                      <p className="text-[10px] uppercase font-bold text-slate-400">Etapa {item.step + 1}</p>
                      <p className="text-xs truncate font-semibold">{item.title}</p>
                      <div className="flex justify-center mt-1">
                        {item.active ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <div className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Step Detail Content */}
                <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-brand-100 dark:border-brand-900/30 text-left space-y-3">
                  {wizardStep === 0 && (
                    <>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">1. Criar e Configurar Organização</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Defina as cores corporativas, faça upload do logotipo da empresa e gerencie os administradores do sistema.
                      </p>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="primary" onClick={() => navigate('/dashboard/organization')}>
                          Configurar Organização
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => updateChecklist('orgCreated', true)}>
                          Marcar como feito
                        </Button>
                      </div>
                    </>
                  )}
                  {wizardStep === 1 && (
                    <>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">2. Criar seu Primeiro Agente de Voz</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Configure os prompts comerciais, ajuste o tom de voz e defina as diretrizes de qualificação de leads.
                      </p>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="primary" onClick={() => navigate('/dashboard/agents/new')}>
                          Criar Agente
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => updateChecklist('agentCreated', true)}>
                          Marcar como feito
                        </Button>
                      </div>
                    </>
                  )}
                  {wizardStep === 2 && (
                    <>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">3. Conectar Telefonia e SIP Trunk</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Conecte seu número de telefone virtual ou operadora local via protocolo SIP para receber chamadas de leads.
                      </p>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="primary" onClick={() => navigate('/dashboard/telephony')}>
                          Conectar Telefonia
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => updateChecklist('telephonyConnected', true)}>
                          Marcar como feito
                        </Button>
                      </div>
                    </>
                  )}
                  {wizardStep === 3 && (
                    <>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">4. Executar Primeiro Teste Real de Chamada</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Abra o playground reativo de áudio e simule uma chamada de voz para verificar a latência, o tom e as transcrições do agente.
                      </p>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="primary" onClick={() => navigate('/dashboard/playground')}>
                          Abrir Playground
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => updateChecklist('firstCallCompleted', true)}>
                          Concluir Setup!
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Smart Checklist (Right 1 col) */}
              <div className="bg-white dark:bg-slate-850 p-4 rounded-xl border border-brand-100/60 dark:border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-100 font-bold text-xs uppercase tracking-wider mb-3">
                    <CheckCircle2 className="h-4.5 w-4.5 text-brand" />
                    <span>Checklist Permanente</span>
                  </div>

                  <div className="space-y-2.5">
                    <ChecklistItem label="Organização Configurada" checked={!!checklist.orgCreated} onChange={() => updateChecklist('orgCreated', !checklist.orgCreated)} onClick={() => navigate('/dashboard/organization')} />
                    <ChecklistItem label="Primeiro Agente Criado" checked={!!checklist.agentCreated} onChange={() => updateChecklist('agentCreated', !checklist.agentCreated)} onClick={() => navigate('/dashboard/agents/new')} />
                    <ChecklistItem label="Telefonia Conectada" checked={!!checklist.telephonyConnected} onChange={() => updateChecklist('telephonyConnected', !checklist.telephonyConnected)} onClick={() => navigate('/dashboard/telephony')} />
                    <ChecklistItem label="Conhecimento Enviado" checked={!!checklist.knowledgeAdded} onChange={() => updateChecklist('knowledgeAdded', !checklist.knowledgeAdded)} onClick={() => navigate('/dashboard/knowledge')} />
                    <ChecklistItem label="Primeiro Teste Efetuado" checked={!!checklist.firstTest} onChange={() => updateChecklist('firstTest', !checklist.firstTest)} onClick={() => navigate('/dashboard/playground')} />
                    <ChecklistItem label="Agente de Voz Ativo" checked={!!checklist.agentPublished} onChange={() => updateChecklist('agentPublished', !checklist.agentPublished)} onClick={() => navigate('/dashboard/agents/new')} />
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 mt-3 text-left">
                  <span className="text-[10px] text-slate-400 block leading-tight">
                    Seu progresso é salvo automaticamente na sua conta.
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* DASHBOARD TAB SELECTOR */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('kpis')}
          className={`px-5 py-3 font-bold text-sm border-b-2 transition-all ${
            activeTab === 'kpis'
              ? 'border-brand text-brand'
              : 'border-transparent text-slate-550 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Visão Geral
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-5 py-3 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'audit'
              ? 'border-brand text-brand'
              : 'border-transparent text-slate-550 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Relatório de UX Audit
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-5 py-3 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'analytics'
              ? 'border-brand text-brand'
              : 'border-transparent text-slate-550 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Analytics de Produto
        </button>
      </div>

      {/* TAB 1: EXECUTIVE METRICS & WIDGETS */}
      {activeTab === 'kpis' && (
        <div className="space-y-8 animate-fade-in">
          {/* REAL, COUNTABLE KPIS — derived from GET /api/agents and GET /api/call-logs.
              Disponibilidade (SLA) is real too (GET /api/metrics, platform_ready_check — Agente 10,
              see handoff onda-4/10-para-02-sla-telemetria-overview.md): a periodic sample, not a
              continuous measurement, documented as such via its tooltip/caption below.
              No token/cost/CSAT/latency card here yet — this platform has no telemetry pipeline
              feeding those to this screen yet (see handoff 02-para-04-10-telemetria-overview.md). */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <RealStatCard
              title="Agentes Cadastrados"
              status={agentsState.status}
              value={String(totalAgents)}
              caption={`${agentsWithPhone} com telefonia conectada`}
              tooltip="Total de agentes de voz cadastrados nesta organização"
              onClick={() => navigate('/dashboard/agents')}
            />
            <RealStatCard
              title="Chamadas Registradas"
              status={callsState.status}
              value={String(totalCalls)}
              caption={totalCalls >= 100 ? 'Últimas 100 registradas' : 'Total no histórico'}
              tooltip="Total de chamadas registradas para esta organização"
            />
            <RealStatCard
              title="Chamadas Hoje"
              status={callsState.status}
              value={String(callsToday)}
              caption={today.toLocaleDateString('pt-BR')}
              tooltip="Chamadas registradas com timestamp de hoje"
            />
            <RealStatCard
              title="Duração Média"
              status={callsState.status}
              value={avgDuration ?? '—'}
              caption={avgDuration ? `${parsedDurations.length} chamadas com duração válida` : 'Sem dados suficientes'}
              tooltip="Média calculada a partir das durações registradas"
            />
            <RealStatCard
              title="Taxa de Conclusão"
              status={callsState.status}
              value={completionRate !== null ? `${completionRate.toFixed(0)}%` : '—'}
              caption={completionRate !== null ? `${completedCalls} de ${totalCalls} concluídas` : 'Sem chamadas registradas'}
              tooltip="Percentual de chamadas com status Concluído"
            />
            <RealStatCard
              title="Disponibilidade (SLA)"
              status={slaState.status}
              value={slaUptimePercent !== null ? `${slaUptimePercent.toFixed(2)}%` : '—'}
              caption={slaCaption}
              tooltip="Uptime aproximado da plataforma (Postgres + Redis), calculado a partir de checagens reais amostradas a cada 5 minutos — não é uma medição contínua: uma indisponibilidade mais curta que o intervalo entre amostras pode não aparecer aqui."
            />
          </div>

          {/* Honest placeholder for metrics this platform doesn't produce yet, instead of
              inventing tokens/cost/CSAT/latency numbers. SLA moved to its own real card above. */}
          <Alert
            variant="info"
            title="Telemetria de IA ainda não instrumentada"
            description="Tokens consumidos, custo estimado, latência de resposta e CSAT dependem do pipeline de Observability/Voice Runtime, que ainda não publica esses eventos para o dashboard. Assim que existir, estas métricas aparecem aqui com dado real — nunca um número de exemplo."
          />

          {/* LOWER WIDGETS GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Left Column: Recent Activity */}
            <div className="lg:col-span-2 space-y-6">
              {/* CHAMADAS RECENTES (BANCO DE DADOS) */}
              <Card className="p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
                  <div className="text-left">
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">Registro de Chamadas</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-450 mt-0.5">Últimas interações de voz registradas no banco de dados.</p>
                  </div>
                  <button onClick={fetchCalls} className="p-1 px-2.5 border rounded-lg text-xs font-semibold hover:bg-slate-50 flex items-center gap-1.5 dark:hover:bg-slate-800 dark:border-slate-700">
                    <RefreshCw className="h-3 w-3" /> Atualizar
                  </button>
                </div>
                {callsState.status === 'loading' && (
                  <div className="space-y-2 py-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                )}
                {callsState.status === 'error' && (
                  <EmptyState
                    icon={<AlertTriangle className="h-8 w-8" />}
                    title="Não foi possível carregar as chamadas"
                    description="Verifique sua conexão e tente novamente."
                    action={<Button size="sm" variant="outline" onClick={fetchCalls}>Tentar novamente</Button>}
                  />
                )}
                {callsState.status === 'ready' && callsState.calls.length === 0 && (
                  <EmptyState
                    icon={<Phone className="h-8 w-8" />}
                    title="Nenhuma chamada registrada ainda"
                    description="Assim que uma chamada real acontecer, ela aparece aqui."
                  />
                )}
                {callsState.status === 'ready' && callsState.calls.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-650 dark:text-slate-450">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                          <th className="py-2">ID</th>
                          <th className="py-2">Contato</th>
                          <th className="py-2">Duração</th>
                          <th className="py-2">Agente</th>
                          <th className="py-2">Status</th>
                          <th className="py-2 text-right">Quando</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold">
                        {callsState.calls.slice(0, 5).map((call) => (
                          <tr key={call.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                            <td className="py-2.5 font-mono text-[10px] text-slate-400">#{call.id}</td>
                            <td className="py-2.5 font-bold text-slate-800 dark:text-slate-200">{call.contactName}</td>
                            <td className="py-2.5 font-mono">{call.duration}</td>
                            <td className="py-2.5">{call.agent}</td>
                            <td className="py-2.5">
                              <Badge variant={call.status === 'Concluído' ? 'success' : 'danger'}>
                                {call.status}
                              </Badge>
                            </td>
                            <td className="py-2.5 text-right text-slate-400 text-[10px]">{call.time}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {/* AGENTES */}
              <Card className="p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
                  <div className="text-left">
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">Seus Agentes</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-450 mt-0.5">Agentes de voz cadastrados nesta organização.</p>
                  </div>
                  <button onClick={() => navigate('/dashboard/agents')} className="p-1 px-2.5 border rounded-lg text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 dark:border-slate-700">
                    Ver todos
                  </button>
                </div>
                {agentsState.status === 'loading' && (
                  <div className="space-y-2 py-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                )}
                {agentsState.status === 'error' && (
                  <EmptyState
                    icon={<AlertTriangle className="h-8 w-8" />}
                    title="Não foi possível carregar os agentes"
                    description="Verifique sua conexão e tente novamente."
                    action={<Button size="sm" variant="outline" onClick={fetchAgents}>Tentar novamente</Button>}
                  />
                )}
                {agentsState.status === 'ready' && agentsState.agents.length === 0 && (
                  <EmptyState
                    icon={<Users className="h-8 w-8" />}
                    title="Nenhum agente criado ainda"
                    description="Crie seu primeiro agente de voz para começar a qualificar leads."
                    action={<Button size="sm" variant="primary" onClick={() => navigate('/dashboard/agents/new')}>Criar Agente</Button>}
                  />
                )}
                {agentsState.status === 'ready' && agentsState.agents.length > 0 && (
                  <div className="space-y-2">
                    {agentsState.agents.slice(0, 5).map((agent) => (
                      <div key={agent.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-brand/10 text-brand rounded-lg"><Users className="h-4 w-4" /></div>
                          <div className="text-left">
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{agent.name}</p>
                            <p className="text-[10px] text-slate-500">{agent.model}</p>
                          </div>
                        </div>
                        <Badge variant={agent.phoneNumber ? 'success' : 'secondary'}>
                          {agent.phoneNumber ? 'Telefonia conectada' : 'Sem telefonia'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Right Column: Health & Alerts */}
            <div className="space-y-6">
              <Card className="p-6 space-y-4">
                <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                  <Activity className="h-5 w-5 text-brand" />
                  <h4 className="font-bold text-sm uppercase tracking-wider">Status da Plataforma</h4>
                </div>
                {readyState.status === 'loading' && <Skeleton className="h-20 w-full" />}
                {readyState.status !== 'loading' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-3">
                        <Database className="h-4 w-4 text-slate-400" />
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Banco de Dados</p>
                      </div>
                      <Badge variant={readyState.checks?.database === 'ok' ? 'success' : 'danger'}>
                        {readyState.checks?.database === 'ok' ? 'Operacional' : 'Indisponível'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-3">
                        <Server className="h-4 w-4 text-slate-400" />
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Redis</p>
                      </div>
                      <Badge variant={readyState.checks?.redis === 'ok' ? 'success' : 'danger'}>
                        {readyState.checks?.redis === 'ok' ? 'Operacional' : 'Indisponível'}
                      </Badge>
                    </div>
                  </div>
                )}
              </Card>

              {/* ALERTA E PENDÊNCIAS — computed from real data, not hardcoded copy. */}
              <Card className="p-6 space-y-4">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <ShieldAlert className="h-5 w-5" />
                  <h4 className="font-bold text-sm uppercase tracking-wider">Alertas & Pendências</h4>
                </div>
                <div className="space-y-3">
                  {agentsState.status === 'ready' && agentsState.agents.length === 0 && (
                    <PendingAlert
                      title="Nenhum agente criado"
                      description="Crie seu primeiro agente de voz para começar a atender leads."
                      actionLabel="Criar agente"
                      onAction={() => navigate('/dashboard/agents/new')}
                    />
                  )}
                  {agentsState.status === 'ready' && agentsState.agents.length > 0 && agentsWithPhone === 0 && (
                    <PendingAlert
                      title="Nenhum número de telefonia conectado"
                      description="Conecte um número de voz SIP para receber ligações reais de leads."
                      actionLabel="Vincular"
                      onAction={() => navigate('/dashboard/telephony')}
                    />
                  )}
                  {checklist && !checklist.knowledgeAdded && (
                    <PendingAlert
                      title="Base de conhecimento vazia"
                      description="Adicione documentos de referência para melhorar a qualificação de leads."
                      actionLabel="Adicionar"
                      onAction={() => navigate('/dashboard/knowledge')}
                      tone="amber"
                    />
                  )}
                  {agentsState.status === 'ready' && agentsState.agents.length > 0 && agentsWithPhone > 0 && checklist?.knowledgeAdded && (
                    <p className="text-xs text-slate-400 py-4 text-center">Nenhuma pendência identificada.</p>
                  )}
                </div>
              </Card>
            </div>

          </div>
        </div>
      )}

      {/* TAB 2: UX AUDIT REPORT (documentation of past UX work on this page — not a live metric) */}
      {activeTab === 'audit' && (
        <Card className="p-8 space-y-8 animate-fade-in text-left">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-750 pb-4">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">UX Audit Report — Birth Hub 360</h2>
              <p className="text-sm text-slate-500">Mapeamento da jornada do usuário e otimização de fluxos de onboarding.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm uppercase tracking-wider flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                Fricções & Gargalos Identificados
              </h3>
              <div className="space-y-3 font-medium text-xs leading-relaxed text-slate-650 dark:text-slate-300">
                <div className="p-3 bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">Cadastro & Primeiros Passos</p>
                  <p className="mt-1 text-slate-500">O usuário caía em uma tela vazia sem instruções de "qual ação tomar". O Onboarding Wizard de 4 fases elimina essa ambiguidade.</p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">Painel executivo com dados de exemplo</p>
                  <p className="mt-1 text-slate-500">A Visão Geral exibia KPIs de negócio (tokens, custo, CSAT, SLA, latência) fixos no código, sem fonte de dado real — corrigido nesta revisão: só métricas reais (agentes, chamadas) aparecem como número; o restante mostra estado vazio explícito até existir telemetria real.</p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">Sessão do usuário não identificada</p>
                  <p className="mt-1 text-slate-500">O shell (barra lateral) lia um cookie que o servidor nunca definia, mostrando sempre um usuário de exemplo fixo. Corrigido: a sessão real vem de GET /api/auth/me.</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm uppercase tracking-wider flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                Soluções Aplicadas
              </h3>
              <div className="space-y-3 font-medium text-xs leading-relaxed text-slate-650 dark:text-slate-300">
                <div className="p-3 bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">Onboarding Direcionado</p>
                  <p className="mt-1 text-slate-500">Wizard reativo exibe a porcentagem real de finalização do checklist, persistida no servidor.</p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">Estados explícitos de loading/erro/vazio</p>
                  <p className="mt-1 text-slate-500">Toda seção com dado remoto mostra esqueleto de carregamento, mensagem de erro com retry, ou estado vazio — nunca um número inventado no lugar do dado ainda não carregado.</p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">Sessão e navegação coerentes</p>
                  <p className="mt-1 text-slate-500">Expiração de sessão em qualquer chamada autenticada redireciona para o Login em vez de deixar a tela travada com dado obsoleto.</p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* TAB 3: PRODUCT ANALYTICS — honest placeholder; no funnel/usability-telemetry backend
          exists yet, so this used to show fabricated conversion percentages. */}
      {activeTab === 'analytics' && (
        <div className="space-y-6 animate-fade-in text-left">
          <EmptyState
            icon={<Code className="h-10 w-10" />}
            title="Analytics de produto ainda não instrumentado"
            description="Funil de ativação e telemetria de usabilidade (tempo de criação de agente, cliques por sessão, taxa de erro) dependem de um pipeline de eventos de produto que ainda não existe nesta plataforma. Quando existir, aparece aqui com dado real."
          />
        </div>
      )}

      {/* ACTIVE MODAL CONTAINER FOR QUICK ACTIONS */}
      <Modal
        isOpen={activeActionModal !== null}
        onClose={() => setActiveActionModal(null)}
        title={
          activeActionModal === 'agent' ? 'Criar Novo Agente de Voz' :
          activeActionModal === 'telephony' ? 'Vincular Número de Telefonia (SIP)' :
          activeActionModal === 'knowledge' ? 'Importar Base de Conhecimento' :
          'Executar Teste de Chamada'
        }
        footer={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setActiveActionModal(null)}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() => handleExecuteQuickAction(activeActionModal || '')}
            >
              Continuar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            Você será redirecionado para a tela correspondente para concluir esta ação.
          </p>
        </div>
      </Modal>

      <ToastContainer toasts={toasts} />
    </div>
  );
}

// Subcomponent: a KPI card driven by real fetch status — never renders a placeholder number as
// if it were live data. Shows a skeleton while loading, an inline retry affordance on error, and
// the real computed value (or an explicit "—" + caption) once ready.
interface RealStatCardProps {
  title: string;
  status: FetchStatus;
  value: string;
  caption: string;
  tooltip: string;
  onClick?: () => void;
}

function RealStatCard({ title, status, value, caption, tooltip, onClick }: RealStatCardProps) {
  return (
    <Tooltip text={tooltip}>
      <Card
        className={`p-4 hoverable space-y-2 relative overflow-hidden flex flex-col justify-between h-full group ${onClick ? 'cursor-pointer' : ''}`}
        onClick={onClick}
      >
        <div className="space-y-1 text-left">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{title}</p>
          {status === 'loading' ? (
            <Skeleton className="h-7 w-16" />
          ) : status === 'error' ? (
            <p className="text-sm font-bold text-red-500 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Erro</p>
          ) : (
            <p className="text-xl font-bold text-slate-900 dark:text-white tracking-tight font-sans">{value}</p>
          )}
        </div>
        <span className="text-[10px] font-semibold text-slate-400">{status === 'ready' ? caption : status === 'error' ? 'Tentar novamente ao atualizar a página' : ' '}</span>
      </Card>
    </Tooltip>
  );
}

// Subcomponent: an actionable pending item, computed from real state (not hardcoded copy).
function PendingAlert({ title, description, actionLabel, onAction, tone = 'red' }: {
  title: string; description: string; actionLabel: string; onAction: () => void; tone?: 'red' | 'amber';
}) {
  const toneClasses = tone === 'red'
    ? 'bg-red-50/60 dark:bg-red-950/20 border-red-100 dark:border-red-900/30 text-red-800 dark:text-red-300'
    : 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30 text-amber-800 dark:text-amber-300';
  return (
    <div className={`p-3 border rounded-lg text-left ${toneClasses}`}>
      <div className="flex justify-between items-start">
        <p className="text-xs font-bold">{title}</p>
        <button onClick={onAction} className="text-[10px] font-bold text-brand hover:underline shrink-0 ml-2">
          {actionLabel}
        </button>
      </div>
      <p className="text-[10px] text-slate-500 mt-1">{description}</p>
    </div>
  );
}

// Subcomponent: Checklist Item
interface ChecklistItemProps {
  label: string;
  checked: boolean;
  onChange: () => void;
  onClick: () => void;
}

function ChecklistItem({ label, checked, onChange, onClick }: ChecklistItemProps) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition-colors">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="h-3.5 w-3.5 text-brand rounded border-slate-300 focus:ring-brand accent-brand cursor-pointer"
        />
        <button
          onClick={onClick}
          className={`font-semibold hover:text-brand transition-colors text-left ${checked ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}
        >
          {label}
        </button>
      </div>
      <button onClick={onClick} className="text-[10px] font-bold text-slate-400 hover:text-brand transition-colors">
        Ir
      </button>
    </div>
  );
}
