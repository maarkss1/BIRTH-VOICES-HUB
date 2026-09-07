import { create } from 'zustand';
import { StudioNode, StudioEdge, NodeType, ValidationIssue, WorkflowVersionSummary } from '../lib/studio/types';
import { validationEngine } from '../lib/studio/ValidationEngine';
import { addEdge, Connection } from '@xyflow/react';
import { logger } from '../lib/logger';

export type NodeLifecycleState = 
  | 'Created'
  | 'Initialized'
  | 'Configured'
  | 'Validated'
  | 'Ready'
  | 'Executing'
  | 'Completed'
  | 'Failed'
  | 'Retry'
  | 'Archived';

export interface NodeRegistryItem {
  type: string;
  label: string;
  category: string;
  description: string;
  iconName: string;
  colorClass: string;
  inputs: number;
  outputs: number;
  version: string;
  compatibilities: string[];
  dependencies: string[];
  defaultConfig: Record<string, unknown>;
  documentation: {
    goal: string;
    inputsDesc: string[];
    outputsDesc: string[];
    bestPractices: string[];
    examples: string[];
  };
}

export interface SimulationLog {
  timestamp: string;
  nodeId?: string;
  nodeLabel?: string;
  type: 'info' | 'success' | 'warn' | 'error' | 'event';
  message: string;
  payload?: unknown;
}

export interface StudioState {
  past: { nodes: StudioNode[]; edges: StudioEdge[] }[];
  future: { nodes: StudioNode[]; edges: StudioEdge[] }[];
  clipboard: { nodes: StudioNode[]; edges: StudioEdge[] } | null;
  undo: () => void;
  redo: () => void;
  copySelection: () => void;
  pasteSelection: () => void;
  autoAlignNodes: () => void;
  deleteSelection: () => void;
  saveSnapshot: () => void;
  nodes: StudioNode[];
  edges: StudioEdge[];
  selectedNodeId: string | null;
  favorites: string[]; // Node types or UUIDs
  templates: { id: string; name: string; nodes: StudioNode[]; edges: StudioEdge[] }[];
  searchQuery: string;
  activeCategory: string; // "all" or specific
  nodeLifecycles: Record<string, NodeLifecycleState>;
  
  // Debug & Simulation Mode
  isDebugging: boolean;
  activeSimulationNodeId: string | null;
  simulationStepIndex: number;
  simulationLogs: SimulationLog[];
  simulationVariables: Record<string, unknown>;
  isSimulationPaused: boolean;
  simulationSpeedMs: number; // default 1500ms
  
  // Actions
  setNodes: (nodes: StudioNode[] | ((nds: StudioNode[]) => StudioNode[])) => void;
  setEdges: (edges: StudioEdge[] | ((eds: StudioEdge[]) => StudioEdge[])) => void;
  setSelectedNodeId: (id: string | null) => void;
  addNodeFromRegistry: (type: string, position?: { x: number; y: number }) => void;
  deleteNode: (id: string) => void;
  updateNodeConfig: (id: string, key: string, value: unknown) => void;
  updateNodeMetadata: (id: string, updates: { label?: string; description?: string }) => void;
  toggleFavorite: (type: string) => void;
  saveAsTemplate: (name: string) => void;
  setSearchQuery: (q: string) => void;
  setActiveCategory: (cat: string) => void;
  setNodeLifecycle: (id: string, state: NodeLifecycleState) => void;
  
  // Connections
  connectNodes: (connection: Connection) => void;
  updateEdgeData: (edgeId: string, updates: Partial<StudioEdge['data']>) => void;
  
  // Simulation Controls
  startSimulation: () => void;
  stopSimulation: () => void;
  pauseSimulation: () => void;
  resumeSimulation: () => void;
  stepSimulationForward: () => void;
  stepSimulationBackward: () => void;
  addSimulationLog: (log: Omit<SimulationLog, 'timestamp'>) => void;
  clearSimulationLogs: () => void;
  updateSimulationVariable: (key: string, value: unknown) => void;
  deleteSimulationVariable: (key: string) => void;
  
  // AI Refactor / Optimize / Generation
  applyAiRefactor: (mode: 'simplify' | 'reduceCost' | 'reduceLatency' | 'moreHuman') => Promise<void>;
  generateWorkflowFromPrompt: (prompt: string) => Promise<void>;
  loadWorkflowFromServer: () => Promise<void>;
  saveWorkflowToServer: () => Promise<void>;

  // Publish / activation gate. `publishWorkflowToServer` is the only store action that can make
  // the backend flip Workflow.status to 'active' (via POST /api/workflow/publish), and the
  // backend re-validates independently — this client-side check only avoids a pointless round
  // trip and gives immediate feedback, it is never trusted as the actual gate.
  publishState: 'idle' | 'publishing' | 'success' | 'error';
  publishIssues: ValidationIssue[];
  publishWorkflowToServer: () => Promise<void>;

  // Identity of the persisted Workflow row this session is editing. Populated from whichever
  // server round-trip resolves it first (load/save/publish/rollback) — GET/POST /workflow are
  // scoped by tenant alone, but the version-history/rollback endpoints below are scoped by
  // `:id`, so we need to know it client-side before we can call them.
  workflowId: string | null;

  // "Histórico de Publicações" panel (components/studio/panels/VersionHistoryPanel.tsx) + its
  // rollback flow. `workflowVersions` always comes straight from `GET /workflow/:id/versions`
  // for the current `workflowId` — never fabricated, never carried over from a previous
  // workflow/tenant (AGENTS.md §14/§15): `openVersionHistory`/`fetchWorkflowVersions` always
  // re-fetch against the current `workflowId` and `closeVersionHistory` never leaves stale data
  // silently displayed as if it were still current.
  isVersionHistoryOpen: boolean;
  workflowVersions: WorkflowVersionSummary[];
  versionHistoryState: 'idle' | 'loading' | 'error';
  versionHistoryError: string | null;
  openVersionHistory: () => void;
  closeVersionHistory: () => void;
  fetchWorkflowVersions: () => Promise<void>;

  // Rollback is a destructive production action (replaces the currently active published
  // content) — `VersionHistoryPanel` requires an explicit confirmation step before calling this,
  // and a 422 (ValidationFailedError) here carries the same `issues[]` shape as
  // `publishWorkflowToServer`'s rejection path, surfaced with the same `ValidationIssuesList`.
  rollbackState: 'idle' | 'rolling-back' | 'success' | 'error';
  rollbackIssues: ValidationIssue[];
  rollbackError: string | null;
  rollbackTargetVersion: number | null;
  rollbackWorkflowToVersion: (version: number) => Promise<void>;
}

// Global node registry
export const nodeRegistry: Record<string, NodeRegistryItem> = {
  start: {
    type: 'start',
    label: 'Inbound Call Trigger',
    category: 'Start',
    description: 'Triggers when a phone call is received or initiated.',
    iconName: 'Play',
    colorClass: 'bg-green-500 text-green-600',
    inputs: 0,
    outputs: 1,
    version: '1.0.4',
    compatibilities: ['voice', 'llm', 'prompt'],
    dependencies: ['voice-runtime-v1'],
    defaultConfig: { channel: 'Telefone', language: 'pt-BR', timezone: 'America/Sao_Paulo', provider: 'Twilio', persona: 'Recepção Comercial', model: 'Gemini 3.1 Pro' },
    documentation: {
      goal: 'Initializes the runtime context, phone connection, and starts the customer call session.',
      inputsDesc: [],
      outputsDesc: ['Call session data containing metadata (ANI, DNIS, caller location).'],
      bestPractices: ['Ensure a Voice Configuration is connected immediately downstream to load proper voice output configurations.', 'Define a default fallback error message in the config.'],
      examples: ['Starts the call with 10k allocated session variables.']
    }
  },
  voice: {
    type: 'voice',
    label: 'Voice Setup',
    category: 'Voice',
    description: 'Configure active voice parameters, speech rate, and speech synthesis engine.',
    iconName: 'Mic',
    colorClass: 'bg-pink-500 text-pink-600',
    inputs: 1,
    outputs: 1,
    version: '1.1.0',
    compatibilities: ['prompt', 'question', 'start'],
    dependencies: ['elevenlabs-api'],
    defaultConfig: { provider: 'ElevenLabs', voiceId: 'Rachel_pt_BR', stability: 0.75, clarity: 0.85, speechRate: 1.0 },
    documentation: {
      goal: 'Sets up TTS (Text to Speech) parameters to output responses naturally.',
      inputsDesc: ['Call trigger data.'],
      outputsDesc: ['Active voice environment parameters.'],
      bestPractices: ['Use ElevenLabs Rachel voice for high-empathy scenarios.', 'Keep stability below 0.85 for micro-emotional variations.'],
      examples: ['Sets Voice to "Rachel" with ElevenLabs Portuguese-BR translation.']
    }
  },
  llm: {
    type: 'llm',
    label: 'Gemini 3.1 Pro',
    category: 'AI',
    description: 'Mount Google Gemini Pro LLM configuration with parameters.',
    iconName: 'BrainCircuit',
    colorClass: 'bg-purple-500 text-purple-600',
    inputs: 1,
    outputs: 1,
    version: '1.0.1',
    compatibilities: ['prompt', 'question', 'condition'],
    dependencies: ['gemini-api-v2'],
    defaultConfig: { provider: 'Gemini', model: 'gemini-2.5-pro', temperature: 0.2, topP: 0.9, maxTokens: 1024, safetySettings: 'Strict' },
    documentation: {
      goal: 'Binds model logic and generation parameters to the runtime prompt.',
      inputsDesc: ['System properties.'],
      outputsDesc: ['A model session instance bound to execution.'],
      bestPractices: ['Keep temperature low (0.1 - 0.3) for structured or factual tasks like appointment booking or lead qualification.', 'Enable high safety parameters for child-facing bots.'],
      examples: ['Sets Gemini 2.5 Pro with temperature 0.2 and 1024 max tokens.']
    }
  },
  prompt: {
    type: 'prompt',
    label: 'Atendimento Inicial',
    category: 'Prompt',
    description: 'Executes generative agent instructions, system prompts, or blocks.',
    iconName: 'MessageSquare',
    colorClass: 'bg-indigo-500 text-indigo-600',
    inputs: 1,
    outputs: 1,
    version: '1.2.0',
    compatibilities: ['condition', 'switch', 'question', 'human_handoff', 'end'],
    dependencies: ['gemini-api'],
    defaultConfig: { promptText: 'Você é um assistente virtual acolhedor da Birth Voices Hub. Agende compromissos e tire dúvidas dos contatos de forma simpática.', streaming: 'Enabled', thinking: 'DeepThinking (v2)', fallbackText: 'Desculpe, tive um problema técnico. Pode repetir?' },
    documentation: {
      goal: 'Injects contextual prompts and compiles model system prompts with reactive variables.',
      inputsDesc: ['Incoming customer intent, voice settings, and model configs.'],
      outputsDesc: ['A generated audio/text string response.'],
      bestPractices: ['Structure prompts in Markdown for readability.', 'Always include a fallback text block to prevent silence.'],
      examples: ['Prompt instructing assistants to answer FAQs strictly based on the company knowledge base.']
    }
  },
  question: {
    type: 'question',
    label: 'Coleta Informação',
    category: 'Conversation',
    description: 'Speaks a question to the user, records input, validates response, or triggers retries.',
    iconName: 'HelpCircle',
    colorClass: 'bg-teal-500 text-teal-600',
    inputs: 1,
    outputs: 2, // Out-0: Sucesso, Out-1: Erro/Falha
    version: '1.0.5',
    compatibilities: ['condition', 'prompt', 'memory', 'tool'],
    dependencies: ['stt-runtime-v1'],
    defaultConfig: { questionText: 'Por favor, me informe o seu nome completo.', maxRetryCount: 3, speechTimeoutMs: 5000, validationRegex: '^[A-Za-z ]{5,50}$', variableToSave: 'customer_name', fallbackPrompt: 'Não entendi. Poderia dizer seu nome novamente?' },
    documentation: {
      goal: 'Asks for, listens to, captures, and validates structured slot values from caller speech.',
      inputsDesc: ['Call session context.'],
      outputsDesc: ['Slot value verified successfully (Out 0) or fallback limit exceeded (Out 1).'],
      bestPractices: ['Configure explicit validation regexes to filter out noise.', 'Always keep the speech timeout under 6000ms.'],
      examples: ['Capture telephone numbers or document values through speech synthesis inputs.']
    }
  },
  condition: {
    type: 'condition',
    label: 'Filtro Intenção',
    category: 'Decision',
    description: 'Branch the flow on conditional checks of variables or natural language intents.',
    iconName: 'GitBranch',
    colorClass: 'bg-orange-500 text-orange-600',
    inputs: 1,
    outputs: 2,
    version: '1.0.0',
    compatibilities: ['prompt', 'tool', 'human_handoff', 'knowledge'],
    dependencies: [],
    defaultConfig: { variable: 'intent', operator: 'equals', value: 'Suporte', naturalLanguageCheck: 'false', matchConfidenceThreshold: 0.8 },
    documentation: {
      goal: 'Branches execution routes based on exact variable matching or intent scores.',
      inputsDesc: ['Execution variables.'],
      outputsDesc: ['Output branch matching check (Out 0) or fallback branch (Out 1).'],
      bestPractices: ['Always connect a default fallback branch to prevent frozen flow status.', 'Use Intent variables populated by LLM prompt nodes.'],
      examples: ['Branches the flow to Human Handoff if "intent == Suporte".']
    }
  },
  switch: {
    type: 'switch',
    label: 'Switch Menu',
    category: 'Logic',
    description: 'Evaluate multi-path switch routing checks matching multiple values or categories.',
    iconName: 'Split',
    colorClass: 'bg-yellow-500 text-yellow-600',
    inputs: 1,
    outputs: 3,
    version: '1.0.0',
    compatibilities: ['prompt', 'tool', 'human_handoff', 'knowledge', 'end'],
    dependencies: [],
    defaultConfig: { variableToCheck: 'userIntent', path0: 'Agendamento', path1: 'Suporte', path2: 'Financeiro' },
    documentation: {
      goal: 'Route workflows across multiple channels depending on slot category tags.',
      inputsDesc: ['Context payload.'],
      outputsDesc: ['Branch 0, Branch 1, Branch 2 matching conditions.'],
      bestPractices: ['Map each path option directly to customer service department queues.'],
      examples: ['Routes caller directly to different queues based on selected telephone menu options.']
    }
  },
  knowledge: {
    type: 'knowledge',
    label: 'Notion FAQs',
    category: 'Knowledge',
    description: 'Search document repositories, web links, or structured FAQ knowledge bases using vector RAG.',
    iconName: 'BookOpen',
    colorClass: 'bg-cyan-500 text-cyan-600',
    inputs: 1,
    outputs: 1,
    version: '1.0.2',
    compatibilities: ['prompt', 'condition', 'end'],
    dependencies: ['vector-db-notion'],
    defaultConfig: { database: 'Notion FAQs', ragTopK: 3, minScoreThreshold: 0.72, searchStrategy: 'Embeddings + Semantic Match', autoChunkSize: 512 },
    documentation: {
      goal: 'Queries indexed FAQs and embeds context directly into current generation systems.',
      inputsDesc: ['User question or prompt keywords.'],
      outputsDesc: ['Text chunks with references containing validated facts.'],
      bestPractices: ['Format source files with clear heading titles.', 'Upload small factual PDF articles instead of generic books.'],
      examples: ['Queries commercial FAQ files on Notion to answer lead questions.']
    }
  },
  tool: {
    type: 'tool',
    label: 'REST API Integration',
    category: 'Integration',
    description: 'Perform HTTP REST webhooks, CRM queries, or SQL commands synchronously.',
    iconName: 'Wrench',
    colorClass: 'bg-blue-500 text-blue-600',
    inputs: 1,
    outputs: 1,
    version: '2.0.0',
    compatibilities: ['condition', 'prompt', 'end'],
    dependencies: ['node-fetch-middleware'],
    defaultConfig: { method: 'POST', endpoint: 'https://api.atlasgr.com.br/v1/leads', headers: '{"Authorization": "Bearer token_secret"}', bodyPayload: '{"name": "{{customer_name}}", "date": "{{meeting_date}}"}', timeoutMs: 4000, retryLimit: 2 },
    documentation: {
      goal: 'Fires REST webhooks or fetches enterprise CRM databases in active sessions.',
      inputsDesc: ['Active flow parameters.'],
      outputsDesc: ['API response parsed into global state.'],
      bestPractices: ['Do not send sensitive API keys in public headers.', 'Always check payload schemas prior to publishing.'],
      examples: ['Book a commercial meeting slot by communicating with external backends.']
    }
  },
  memory: {
    type: 'memory',
    label: 'State Manager',
    category: 'Memory',
    description: 'Write, pull, reset, or update execution session variables in memory database.',
    iconName: 'Database',
    colorClass: 'bg-emerald-500 text-emerald-600',
    inputs: 1,
    outputs: 1,
    version: '1.0.0',
    compatibilities: ['prompt', 'tool', 'end'],
    dependencies: [],
    defaultConfig: { operation: 'Set Variable', variableName: 'hasCompletedSurvey', variableValue: 'true', scope: 'Session' },
    documentation: {
      goal: 'Saves or updates custom session identifiers inside the client persistence storage.',
      inputsDesc: ['Context state.'],
      outputsDesc: ['State updated successfully.'],
      bestPractices: ['Prefix variable names with domain descriptors (e.g., user_last_appointment_id).'],
      examples: ['Set customer survey feedback variables in runtime database memory.']
    }
  },
  human_handoff: {
    type: 'human_handoff',
    label: 'Suporte Técnico',
    category: 'Human',
    description: 'Transfers call immediately to a live customer service operator, updating call queues.',
    iconName: 'Headphones',
    colorClass: 'bg-rose-500 text-rose-600',
    inputs: 1,
    outputs: 0,
    version: '1.0.0',
    compatibilities: [],
    dependencies: ['sip-trunk-router'],
    defaultConfig: { department: 'Suporte Técnico', fallbackNumber: '+5511999999999', ringTimeoutSec: 30, recordCall: 'true', transferMessage: 'Aguarde um momento enquanto encaminho sua ligação.' },
    documentation: {
      goal: 'Bridge live telecommunications voice streams over directly to human customer support teams.',
      inputsDesc: ['Session identifier.'],
      outputsDesc: [],
      bestPractices: ['Ensure department configurations match valid PBX lines.', 'Always record calls for analytics quality control checks.'],
      examples: ['Routing active customer support queries directly to tech support agents.']
    }
  },
  end: {
    type: 'end',
    label: 'Finalizar Conversa',
    category: 'Control',
    description: 'Closes call socket gracefully, saves transcripts, runs final dashboard summaries.',
    iconName: 'Square',
    colorClass: 'bg-slate-700 text-slate-800',
    inputs: 1,
    outputs: 0,
    version: '1.0.0',
    compatibilities: [],
    dependencies: ['voice-runtime-v1'],
    defaultConfig: { saveTranscript: 'true', exportToWebhook: 'false', postCallSurvey: 'Disabled' },
    documentation: {
      goal: 'Teardown the active customer connection socket gracefully and compute conversational KPIs.',
      inputsDesc: ['Flow state.'],
      outputsDesc: [],
      bestPractices: ['Always export logs to webhooks if building analytics reports.', 'Enable transcripts for compliance audits.'],
      examples: ['Saves conversation summary and closes customer connection successfully.']
    }
  }
};

const initialNodes: StudioNode[] = [
  {
    id: 'start-1',
    type: 'start',
    position: { x: 50, y: 300 },
    data: { label: 'Inbound Call', category: 'Trigger', config: nodeRegistry.start.defaultConfig, metrics: { invocations: 1248, errorRate: 0, latencyMs: 12 } }
  },
  {
    id: 'voice-1',
    type: 'voice',
    position: { x: 380, y: 150 },
    data: { label: 'Voice Setup', category: 'Config', config: nodeRegistry.voice.defaultConfig, metrics: { invocations: 1248, errorRate: 0, latencyMs: 8 } }
  },
  {
    id: 'llm-1',
    type: 'llm',
    position: { x: 380, y: 450 },
    data: { label: 'Gemini 3.1 Pro', category: 'LLM', config: nodeRegistry.llm.defaultConfig, metrics: { invocations: 1248, errorRate: 0.02, latencyMs: 145 } }
  },
  {
    id: 'prompt-1',
    type: 'prompt',
    position: { x: 720, y: 300 },
    data: { label: 'Atendimento Inicial', category: 'Prompt', config: nodeRegistry.prompt.defaultConfig, metrics: { invocations: 1220, errorRate: 0.05, latencyMs: 420 } }
  },
  {
    id: 'condition-1',
    type: 'condition',
    position: { x: 1060, y: 300 },
    data: { label: 'Verifica Intenção', category: 'Logic', config: nodeRegistry.condition.defaultConfig, metrics: { invocations: 1180, errorRate: 0.01, latencyMs: 25 } }
  },
  {
    id: 'handoff-1',
    type: 'human_handoff',
    position: { x: 1420, y: 120 },
    data: { label: 'Transferir Suporte', category: 'Action', config: nodeRegistry.human_handoff.defaultConfig, metrics: { invocations: 450, errorRate: 0.08, latencyMs: 120 } }
  },
  {
    id: 'knowledge-1',
    type: 'knowledge',
    position: { x: 1420, y: 480 },
    data: { label: 'Buscar Documentos', category: 'Knowledge', config: nodeRegistry.knowledge.defaultConfig, metrics: { invocations: 730, errorRate: 0.04, latencyMs: 310 } }
  },
  {
    id: 'end-1',
    type: 'end',
    position: { x: 1780, y: 480 },
    data: { label: 'Finalizar', category: 'Trigger', config: nodeRegistry.end.defaultConfig, metrics: { invocations: 700, errorRate: 0, latencyMs: 10 } }
  }
];

const initialEdges: StudioEdge[] = [
  { id: 'e1-v1', source: 'start-1', target: 'voice-1', type: 'studioEdge', data: { category: 'Config', description: 'Carrega Voz' } },
  { id: 'e1-l1', source: 'start-1', target: 'llm-1', type: 'studioEdge', data: { category: 'Config', description: 'Carrega LLM' } },
  { id: 'ev1-p1', source: 'voice-1', target: 'prompt-1', type: 'studioEdge', data: { category: 'Pipeline', description: 'Voz Ativa' } },
  { id: 'el1-p1', source: 'llm-1', target: 'prompt-1', type: 'studioEdge', data: { category: 'Pipeline', description: 'LLM Ativo' } },
  { id: 'e-p1-c1', source: 'prompt-1', target: 'condition-1', type: 'studioEdge', data: { category: 'Flow', description: 'Resultado' } },
  { id: 'e-c1-h1', source: 'condition-1', target: 'handoff-1', sourceHandle: 'out-0', type: 'studioEdge', data: { condition: 'Intent == Suporte', category: 'Branch', description: 'Caso Suporte' } },
  { id: 'e-c1-k1', source: 'condition-1', target: 'knowledge-1', sourceHandle: 'out-1', type: 'studioEdge', data: { condition: 'Intent == Dúvida', isFallback: true, category: 'Branch', description: 'Caso Geral / Fallback' } },
  { id: 'e-k1-e1', source: 'knowledge-1', target: 'end-1', type: 'studioEdge', data: { category: 'Flow', description: 'Concluído' } },
];

let simulationInterval: ReturnType<typeof setInterval> | null = null;

export const useStudioStore = create<StudioState>((set, get) => ({
  past: [],
  future: [],
  clipboard: null,

  saveSnapshot: () => {
    const { nodes, edges, past } = get();
    // avoid saving identical snapshots
    if (past.length > 0) {
       const last = past[past.length - 1];
       if (JSON.stringify(last.nodes) === JSON.stringify(nodes) && JSON.stringify(last.edges) === JSON.stringify(edges)) return;
    }
    set({
      past: [...past, { nodes: structuredClone(nodes), edges: structuredClone(edges) }],
      future: []
    });
  },

  undo: () => {
    const { past, future, nodes, edges } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    set({
      past: newPast,
      future: [{ nodes, edges }, ...future],
      nodes: previous.nodes,
      edges: previous.edges
    });
  },

  redo: () => {
    const { past, future, nodes, edges } = get();
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);
    set({
      past: [...past, { nodes, edges }],
      future: newFuture,
      nodes: next.nodes,
      edges: next.edges
    });
  },

  copySelection: () => {
    const { nodes, edges } = get();
    const selectedNodes = nodes.filter(n => n.selected);
    const selectedNodeIds = new Set(selectedNodes.map(n => n.id));
    const selectedEdges = edges.filter(e => selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target));
    set({ clipboard: { nodes: selectedNodes, edges: selectedEdges } });
  },

  autoAlignNodes: () => {
    const { nodes, saveSnapshot } = get();
    saveSnapshot();
    const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y);
    let currentY = 50;
    const aligned = sorted.map(n => {
       const res = { ...n, position: { x: 300, y: currentY } };
       currentY += 150;
       return res;
    });
    set({ nodes: aligned });
  },

  deleteSelection: () => {
    const { nodes, edges, saveSnapshot } = get();
    const selectedNodes = nodes.filter(n => n.selected).map(n => n.id);
    if (selectedNodes.length === 0) return;

    saveSnapshot();
    set({
       nodes: nodes.filter(n => !n.selected),
       edges: edges.filter(e => !selectedNodes.includes(e.source) && !selectedNodes.includes(e.target))
    });
  },

  pasteSelection: () => {
    const { clipboard, nodes, edges, saveSnapshot } = get();
    if (!clipboard || clipboard.nodes.length === 0) return;
    saveSnapshot();

    const idMapping: Record<string, string> = {};
    const newNodes = clipboard.nodes.map(n => {
      const newId = crypto.randomUUID();
      idMapping[n.id] = newId;
      return {
        ...n,
        id: newId,
        selected: true,
        position: { x: n.position.x + 50, y: n.position.y + 50 }
      };
    });

    const newEdges = clipboard.edges.map(e => ({
      ...e,
      id: crypto.randomUUID(),
      source: idMapping[e.source],
      target: idMapping[e.target]
    }));

    set({
      nodes: [...nodes.map(n => ({...n, selected: false})), ...newNodes],
      edges: [...edges.map(e => ({...e, selected: false})), ...newEdges]
    });
  },

  nodes: initialNodes,
  edges: initialEdges,
  selectedNodeId: null,
  favorites: ['prompt', 'llm', 'knowledge'],
  templates: [
    {
      id: 'temp-1',
      name: 'Recepção e Qualificação Padrão',
      nodes: initialNodes.slice(0, 5),
      edges: initialEdges.slice(0, 4)
    }
  ],
  searchQuery: '',
  activeCategory: 'all',
  nodeLifecycles: {
    'start-1': 'Ready',
    'voice-1': 'Ready',
    'llm-1': 'Ready',
    'prompt-1': 'Ready',
    'condition-1': 'Ready',
    'handoff-1': 'Ready',
    'knowledge-1': 'Ready',
    'end-1': 'Ready',
  },
  
  // Debug / Simulation state
  isDebugging: false,
  activeSimulationNodeId: null,
  simulationStepIndex: -1,
  simulationLogs: [],
  simulationVariables: {
    customer_name: 'Marcelo Silva',
    hasCompletedSurvey: 'false',
    intent: 'Suporte',
    confidenceScore: 0.94,
    caller_phone: '+5511999998888',
    channel: 'Telefone'
  },
  isSimulationPaused: false,
  simulationSpeedMs: 1500,

  publishState: 'idle',
  publishIssues: [],

  workflowId: null,

  isVersionHistoryOpen: false,
  workflowVersions: [],
  versionHistoryState: 'idle',
  versionHistoryError: null,

  rollbackState: 'idle',
  rollbackIssues: [],
  rollbackError: null,
  rollbackTargetVersion: null,

  // Node State mutators
  setNodes: (nodes) => set((state) => ({
    nodes: typeof nodes === 'function' ? nodes(state.nodes) : nodes
  })),
  setEdges: (edges) => set((state) => ({
    edges: typeof edges === 'function' ? edges(state.edges) : edges
  })),
  
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  
  addNodeFromRegistry: (type, position) => {
    const regItem = nodeRegistry[type];
    if (!regItem) return;
    
    const newId = `${type}-${Date.now()}`;
    const newNode: StudioNode = {
      id: newId,
      type: type as NodeType,
      position: position || { x: 400 + (get().nodes.length * 25) % 200, y: 300 + (get().nodes.length * 25) % 200 },
      data: {
        label: `${regItem.label} ${get().nodes.filter(n => n.type === type).length + 1}`,
        category: regItem.category,
        config: { ...regItem.defaultConfig },
        metrics: {
          invocations: 0,
          errorRate: 0,
          latencyMs: 15
        }
      }
    };
    
    set((state) => ({
      nodes: [...state.nodes, newNode],
      nodeLifecycles: { ...state.nodeLifecycles, [newId]: 'Ready' }
    }));
  },
  
  deleteNode: (id) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      activeSimulationNodeId: state.activeSimulationNodeId === id ? null : state.activeSimulationNodeId
    }));
  },
  
  updateNodeConfig: (id, key, value) => {
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id === id) {
          return {
            ...n,
            data: {
              ...n.data,
              config: {
                ...n.data.config,
                [key]: value
              }
            }
          };
        }
        return n;
      })
    }));
  },
  
  updateNodeMetadata: (id, updates) => {
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id === id) {
          return {
            ...n,
            data: {
              ...n.data,
              label: updates.label !== undefined ? updates.label : n.data.label,
              description: updates.description !== undefined ? updates.description : n.data.description
            }
          };
        }
        return n;
      })
    }));
  },
  
  toggleFavorite: (type) => {
    set((state) => {
      const isFav = state.favorites.includes(type);
      return {
        favorites: isFav ? state.favorites.filter(t => t !== type) : [...state.favorites, type]
      };
    });
  },
  
  saveAsTemplate: (name) => {
    const { nodes, edges } = get();
    const newTemp = {
      id: `temp-${Date.now()}`,
      name,
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges))
    };
    set((state) => ({
      templates: [...state.templates, newTemp]
    }));
  },
  
  setSearchQuery: (q) => set({ searchQuery: q }),
  setActiveCategory: (cat) => set({ activeCategory: cat }),
  
  setNodeLifecycle: (id, state) => {
    set((stateObj) => ({
      nodeLifecycles: { ...stateObj.nodeLifecycles, [id]: state }
    }));
  },
  
  connectNodes: (connection) => {
    set((state) => {
      const sourceNode = state.nodes.find(n => n.id === connection.source);
      const targetNode = state.nodes.find(n => n.id === connection.target);
      
      const edgeData: StudioEdge['data'] = {
        category: 'Flow',
        description: `Conecta ${sourceNode?.data.label} a ${targetNode?.data.label}`,
        condition: '',
        priority: 1,
        weight: 1,
        event: 'next'
      };
      
      if (sourceNode?.type === 'condition') {
        const branchIndex = connection.sourceHandle === 'out-0' ? 0 : 1;
        edgeData.condition = branchIndex === 0 ? 'Variable == Value' : 'Fallback';
        edgeData.isFallback = branchIndex === 1;
        edgeData.category = 'Branch';
      } else if (sourceNode?.type === 'switch') {
        const handleId = connection.sourceHandle || 'out-0';
        const index = parseInt(handleId.split('-')[1]) || 0;
        const variable = sourceNode.data.config?.variableToCheck || 'userIntent';
        const value = sourceNode.data.config?.[`path${index}`] || `Caminho ${index}`;
        edgeData.condition = `${variable} == ${value}`;
        edgeData.category = 'Switch Branch';
      }
      
      const newEdge: StudioEdge = {
        id: `e-${connection.source}-${connection.target}-${Date.now()}`,
        source: connection.source || '',
        target: connection.target || '',
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        type: 'studioEdge',
        data: edgeData
      };
      
      return {
        edges: addEdge(newEdge, state.edges) as StudioEdge[]
      };
    });
  },
  
  updateEdgeData: (edgeId, updates) => {
    set((state) => ({
      edges: state.edges.map(e => {
        if (e.id === edgeId) {
          return {
            ...e,
            data: {
              ...e.data,
              ...updates
            }
          };
        }
        return e;
      })
    }));
  },
  
  // Simulation Controls & Execution Loop
  addSimulationLog: (log) => {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    set((state) => ({
      simulationLogs: [{ ...log, timestamp }, ...state.simulationLogs].slice(0, 100)
    }));
  },
  
  clearSimulationLogs: () => set({ simulationLogs: [] }),
  updateSimulationVariable: (key, value) => set((state) => ({
    simulationVariables: { ...state.simulationVariables, [key]: value }
  })),
  deleteSimulationVariable: (key) => set((state) => {
    const newVars = { ...state.simulationVariables };
    delete newVars[key];
    return { simulationVariables: newVars };
  }),
  
  startSimulation: () => {
    if (simulationInterval) clearInterval(simulationInterval);

    // IMPORTANT: this is a local, client-only walk of the current nodes/edges graph — it never
    // calls the real Voice Runtime (lib/voice-runtime, owned by Agente 04), which today doesn't
    // even consume Workflow.nodes/edges yet (see handoff 07-para-04). It exists to let an author
    // preview branching/config without a real call, and it must never claim success for a node
    // that ValidationEngine would flag as broken — see the per-step check in runStep() below.
    const { nodes: startNodes } = get();
    const startNode = startNodes.find(n => n.type === 'start');

    if (!startNode) {
      get().addSimulationLog({
        type: 'error',
        message: 'Não é possível simular: nenhum nó Start encontrado no fluxo. Adicione um nó Start e conecte-o ao restante do fluxo.'
      });
      return;
    }

    set({
      isDebugging: true,
      simulationStepIndex: 0,
      activeSimulationNodeId: startNode.id,
      isSimulationPaused: false,
      simulationLogs: []
    });

    get().addSimulationLog({
      nodeId: startNode.id,
      nodeLabel: startNode.data.label,
      type: 'info',
      message: 'Iniciando simulação local (mock) — não é uma chamada real de voz nem invoca o Voice Runtime em produção.'
    });

    get().setNodeLifecycle(startNode.id, 'Executing');

    const runStep = () => {
      const { activeSimulationNodeId, nodes, edges, isSimulationPaused, simulationVariables } = get();
      if (isSimulationPaused) return;
      if (!activeSimulationNodeId) return;

      const currentNode = nodes.find(n => n.id === activeSimulationNodeId);
      if (!currentNode) {
        get().addSimulationLog({
          type: 'error',
          message: `Simulação interrompida: nó "${activeSimulationNodeId}" não existe mais no fluxo (foi removido durante a simulação?).`
        });
        get().stopSimulation();
        return;
      }

      // Never claim success for a node ValidationEngine would reject at publish time (e.g. an
      // empty prompt, a Tool node with no endpoint, an LLM node with no provider). Simulating
      // past a broken node would be exactly the kind of "fingir sucesso" the runtime contract
      // forbids — surface the real error and halt instead.
      const { issues: liveIssues } = validationEngine.validate(nodes, edges);
      const blockingIssues = liveIssues.filter(i => i.nodeId === currentNode.id && i.type === 'error');
      if (blockingIssues.length > 0) {
        get().setNodeLifecycle(currentNode.id, 'Failed');
        get().addSimulationLog({
          nodeId: currentNode.id,
          nodeLabel: currentNode.data.label,
          type: 'error',
          message: `Falha em ${currentNode.data.label}: ${blockingIssues.map(i => i.message).join(' ')}`
        });
        get().stopSimulation();
        return;
      }

      // Node execution completed
      get().setNodeLifecycle(currentNode.id, 'Completed');
      get().addSimulationLog({
        nodeId: currentNode.id,
        nodeLabel: currentNode.data.label,
        type: 'success',
        message: `Node ${currentNode.data.label} executado com sucesso (simulação local). Latência estimada: ${currentNode.data.metrics?.latencyMs || 15}ms`
      });

      // Determine next node
      let nextNodeId: string | null = null;
      let matchingEdge: StudioEdge | null = null;
      
      const outgoingEdges = edges.filter(e => e.source === currentNode.id);
      
      if (outgoingEdges.length === 1) {
        matchingEdge = outgoingEdges[0];
        nextNodeId = matchingEdge.target;
      } else if (outgoingEdges.length > 1) {
        // Evaluate conditions
        if (currentNode.type === 'condition') {
          const checkVar = typeof currentNode.data.config?.variable === 'string' ? currentNode.data.config.variable : 'intent';
          const valToCheck = simulationVariables[checkVar] || '';
          const checkVal = currentNode.data.config?.value || '';
          
          if (valToCheck === checkVal) {
            // Out-0 branch (Success branch)
            matchingEdge = outgoingEdges.find(e => e.sourceHandle === 'out-0') || outgoingEdges[0];
          } else {
            // Out-1 branch (Fallback branch)
            matchingEdge = outgoingEdges.find(e => e.sourceHandle === 'out-1') || outgoingEdges[1] || outgoingEdges[0];
          }
          nextNodeId = matchingEdge.target;
        } else {
          // Default first edge
          matchingEdge = outgoingEdges[0];
          nextNodeId = matchingEdge.target;
        }
      }
      
      if (nextNodeId) {
        const nextNode = nodes.find(n => n.id === nextNodeId);
        if (nextNode) {
          get().addSimulationLog({
            nodeId: nextNodeId,
            nodeLabel: nextNode.data.label,
            type: 'event',
            message: `Ativando próximo Node: ${nextNode.data.label} via canal de decisão "${matchingEdge?.data?.description || 'Next Link'}"`
          });
          get().setNodeLifecycle(nextNodeId, 'Executing');
          set({ activeSimulationNodeId: nextNodeId, simulationStepIndex: get().simulationStepIndex + 1 });
          
          // Specific logs based on node types
          if (nextNode.type === 'voice') {
            get().addSimulationLog({
              nodeId: nextNodeId,
              nodeLabel: nextNode.data.label,
              type: 'info',
              message: `Voice setup: provider="${nextNode.data.config?.provider}", voice="${nextNode.data.config?.voiceId || 'Rachel'}"`
            });
          } else if (nextNode.type === 'llm') {
            get().addSimulationLog({
              nodeId: nextNodeId,
              nodeLabel: nextNode.data.label,
              type: 'info',
              message: `Mounting LLM Provider config: model="${nextNode.data.config?.model || 'gemini-2.5-pro'}", temperature=${nextNode.data.config?.temperature || 0.2}`
            });
          } else if (nextNode.type === 'prompt') {
            get().addSimulationLog({
              nodeId: nextNodeId,
              nodeLabel: nextNode.data.label,
              type: 'info',
              message: `Fired system instruction compilation: Text length=${typeof nextNode.data.config?.promptText === 'string' ? nextNode.data.config.promptText.length : 0} characters. DeepThinking: active.`
            });
          } else if (nextNode.type === 'human_handoff') {
            get().addSimulationLog({
              nodeId: nextNodeId,
              nodeLabel: nextNode.data.label,
              type: 'warn',
              message: `Transferindo chamada telefônica para o departamento "${nextNode.data.config?.department}"`
            });
            get().addSimulationLog({
              nodeId: nextNodeId,
              nodeLabel: nextNode.data.label,
              type: 'success',
              message: `Canal telefônico roteado para suporte ao vivo.`
            });
            get().stopSimulation();
          } else if (nextNode.type === 'knowledge') {
            get().addSimulationLog({
              nodeId: nextNodeId,
              nodeLabel: nextNode.data.label,
              type: 'info',
              message: `Executing vector search RAG query against database "${nextNode.data.config?.database || 'Notion FAQs'}"`
            });
            get().addSimulationLog({
              nodeId: nextNodeId,
              nodeLabel: nextNode.data.label,
              type: 'success',
              message: `Knowledge source search complete. Returned 3 chunks. Match score: 0.91`
            });
          } else if (nextNode.type === 'end') {
            get().addSimulationLog({
              nodeId: nextNodeId,
              nodeLabel: nextNode.data.label,
              type: 'success',
              message: 'Conexão encerrada de forma limpa. Transcrição salva na plataforma.'
            });
            get().stopSimulation();
          }
        } else {
          get().stopSimulation();
        }
      } else {
        // No outgoing connections, end of execution
        get().addSimulationLog({
          nodeId: currentNode.id,
          nodeLabel: currentNode.data.label,
          type: 'info',
          message: 'Fim do grafo de execução visual.'
        });
        get().stopSimulation();
      }
    };
    
    simulationInterval = setInterval(runStep, get().simulationSpeedMs);
  },
  
  stopSimulation: () => {
    if (simulationInterval) {
      clearInterval(simulationInterval);
      simulationInterval = null;
    }
    
    const lifecycles = { ...get().nodeLifecycles };
    Object.keys(lifecycles).forEach(k => {
      lifecycles[k] = 'Ready';
    });
    
    set({
      isDebugging: false,
      activeSimulationNodeId: null,
      simulationStepIndex: -1,
      isSimulationPaused: false,
      nodeLifecycles: lifecycles
    });
    
    get().addSimulationLog({
      type: 'info',
      message: 'Debugger / Simulation session terminated.'
    });
  },
  
  pauseSimulation: () => {
    set({ isSimulationPaused: true });
    get().addSimulationLog({ type: 'warn', message: 'Sessão de simulação pausada.' });
  },
  
  resumeSimulation: () => {
    set({ isSimulationPaused: false });
    get().addSimulationLog({ type: 'info', message: 'Sessão de simulação retomada.' });
  },
  
  stepSimulationForward: () => {
    // Single manual tick forward
    const { activeSimulationNodeId, nodes, edges, simulationVariables } = get();
    if (!activeSimulationNodeId) return;
    
    const currentNode = nodes.find(n => n.id === activeSimulationNodeId);
    if (!currentNode) return;

    // Same rule as the automatic playback loop in startSimulation: don't advance past a node
    // that ValidationEngine flags as an error, and don't silently mark it "Completed".
    const { issues: liveIssues } = validationEngine.validate(nodes, edges);
    const blockingIssues = liveIssues.filter(i => i.nodeId === currentNode.id && i.type === 'error');
    if (blockingIssues.length > 0) {
      get().setNodeLifecycle(currentNode.id, 'Failed');
      get().addSimulationLog({
        nodeId: currentNode.id,
        nodeLabel: currentNode.data.label,
        type: 'error',
        message: `Falha em ${currentNode.data.label}: ${blockingIssues.map(i => i.message).join(' ')}`
      });
      get().stopSimulation();
      return;
    }

    get().setNodeLifecycle(currentNode.id, 'Completed');

    let nextNodeId: string | null = null;
    const outgoingEdges = edges.filter(e => e.source === currentNode.id);
    
    if (outgoingEdges.length === 1) {
      nextNodeId = outgoingEdges[0].target;
    } else if (outgoingEdges.length > 1) {
      if (currentNode.type === 'condition') {
        const checkVar = typeof currentNode.data.config?.variable === 'string' ? currentNode.data.config.variable : 'intent';
        const valToCheck = simulationVariables[checkVar] || '';
        const checkVal = currentNode.data.config?.value || '';
        
        if (valToCheck === checkVal) {
          nextNodeId = outgoingEdges.find(e => e.sourceHandle === 'out-0')?.target || outgoingEdges[0].target;
        } else {
          nextNodeId = outgoingEdges.find(e => e.sourceHandle === 'out-1')?.target || outgoingEdges[1].target || outgoingEdges[0].target;
        }
      } else {
        nextNodeId = outgoingEdges[0].target;
      }
    }
    
    if (nextNodeId) {
      const nextNode = nodes.find(n => n.id === nextNodeId);
      if (nextNode) {
        get().setNodeLifecycle(nextNodeId, 'Executing');
        set({ activeSimulationNodeId: nextNodeId, simulationStepIndex: get().simulationStepIndex + 1 });
        get().addSimulationLog({
          nodeId: nextNodeId,
          nodeLabel: nextNode.data.label,
          type: 'event',
          message: `Manual step forward: Ativando node ${nextNode.data.label}`
        });
      }
    } else {
      get().stopSimulation();
    }
  },
  
  stepSimulationBackward: () => {
    // For simplicity, reset or log manual step back
    get().addSimulationLog({
      type: 'warn',
      message: 'Retrocesso de passo manual acionado.'
    });
  },
  
  // AI Flow Refactoring and Generation
  applyAiRefactor: async (mode) => {
    get().addSimulationLog({
      type: 'event',
      message: `Enviando fluxo ativo para a Catarina AI para refatoração real (modo: ${mode})...`
    });
    
    try {
      const response = await fetch('/api/ai/refactor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, nodes: get().nodes })
      });

      if (!response.ok) {
        throw new Error(`Erro na API: ${response.statusText}`);
      }

      const data = await response.json();
      if (data && data.nodes) {
        set({ nodes: data.nodes });
        get().addSimulationLog({
          type: 'success',
          message: `Catarina AI completou a refatoração do grafo de execução visual usando IA real!`
        });
      }
    } catch (err: unknown) {
      logger.error('Error applying AI refactor to workflow', { err });
      const errMessage = err instanceof Error ? err.message : String(err);
      get().addSimulationLog({
        type: 'error',
        message: `Falha na refatoração real da Catarina AI: ${errMessage}. Revertendo para simulação offline local...`
      });

      // Fallback local logic to guarantee the user's workflow never breaks
      set((state) => {
        const updatedNodes = state.nodes.map(n => {
          if (n.type === 'prompt') {
            return {
              ...n,
              data: {
                ...n.data,
                label: mode === 'moreHuman' ? 'Atendimento Altamente Humanizado' : 'Atendimento Otimizado AI',
                config: {
                  ...n.data.config,
                  promptText: mode === 'moreHuman' 
                    ? 'Você é um assistente virtual empático, natural, que respira e usa pausas de voz para soar humano.' 
                    : 'Responda de forma extremamente curta e concisa para economizar latência de áudio.'
                }
              }
            };
          }
          if (n.type === 'llm') {
            return {
              ...n,
              data: {
                ...n.data,
                config: {
                  ...n.data.config,
                  model: mode === 'reduceCost' ? 'gemini-2.5-flash' : 'gemini-2.5-pro',
                  temperature: mode === 'simplify' ? 0.1 : 0.45
                }
              }
            };
          }
          return n;
        });
        return { nodes: updatedNodes };
      });
    }
  },
  
  generateWorkflowFromPrompt: async (prompt) => {
    get().addSimulationLog({
      type: 'event',
      message: `Catarina AI está processando o prompt natural com Gemini real: "${prompt}"...`
    });
    
    try {
      const response = await fetch('/api/ai/generate-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      if (!response.ok) {
        throw new Error(`Erro na API: ${response.statusText}`);
      }

      const data = await response.json();
      if (data && data.nodes && data.edges) {
        const lifecycles: Record<string, NodeLifecycleState> = {};
        data.nodes.forEach((n: { id: string }) => {
          lifecycles[n.id] = 'Ready';
        });

        set({
          nodes: data.nodes,
          edges: data.edges,
          nodeLifecycles: lifecycles,
          selectedNodeId: null,
          activeSimulationNodeId: null
        });

        get().addSimulationLog({
          type: 'success',
          message: `Catarina AI (Gemini Real) gerou um grafo completo contendo ${data.nodes.length} nodes e ${data.edges.length} conexões com sucesso!`
        });
      }
    } catch (err: unknown) {
      logger.error('Error generating workflow from prompt', { err });
      const errMessage = err instanceof Error ? err.message : String(err);
      get().addSimulationLog({
        type: 'error',
        message: `Falha na geração real de fluxo: ${errMessage}.`
      });
    }
  },
  loadWorkflowFromServer: async () => {
    try {
      const res = await fetch('/api/workflow');
      if (res.ok) {
        const data = await res.json();
        if (data.workflow) {
          const lifecycles: Record<string, NodeLifecycleState> = {};
          data.workflow.nodes.forEach((n: { id: string }) => {
            lifecycles[n.id] = 'Ready';
          });
          set({
            nodes: data.workflow.nodes,
            edges: data.workflow.edges,
            nodeLifecycles: lifecycles,
            workflowId: data.workflow.id ?? null
          });
          get().addSimulationLog({
            type: 'success',
            message: 'Fluxo carregado com sucesso do banco de dados do servidor!'
          });
        }
      }
    } catch (err) {
      logger.error('Error loading workflow from server', { err });
    }
  },
  saveWorkflowToServer: async () => {
    try {
      const { nodes, edges } = get();
      const res = await fetch('/api/workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ nodes, edges, name: "Voice Agent Flow" })
      });
      const data = await res.json().catch(() => ({}));
      if (data.workflow?.id) {
        set({ workflowId: data.workflow.id });
      }
      get().addSimulationLog({
        type: 'info',
        message: 'Progresso do Canvas salvo de forma segura e persistente no banco de dados.'
      });
    } catch (err) {
      logger.error('Error saving workflow to server', { err });
    }
  },

  publishWorkflowToServer: async () => {
    const { nodes, edges } = get();

    // Fast local pre-check so an obviously-broken flow doesn't even round-trip: purely a UX
    // shortcut, NOT the enforcement point. The server independently re-runs ValidationEngine
    // against the persisted row and is the only thing allowed to set status: 'active'.
    const localResult = validationEngine.validate(nodes, edges);
    if (!localResult.isValid) {
      set({ publishState: 'error', publishIssues: localResult.issues });
      get().addSimulationLog({
        type: 'error',
        message: `Publicação bloqueada: ${localResult.issues.filter(i => i.type === 'error').length} erro(s) de validação precisam ser corrigidos antes de ativar este fluxo.`
      });
      return;
    }

    set({ publishState: 'publishing' });
    try {
      const res = await fetch('/api/workflow/publish', { method: 'POST' });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        set({
          publishState: 'success',
          publishIssues: [],
          workflowId: data.workflow?.id ?? get().workflowId
        });
        get().addSimulationLog({
          type: 'success',
          message: 'Fluxo validado e publicado com sucesso. Status: ativo.'
        });
        // A fresh publish archives a new version — keep an already-open history panel current
        // instead of leaving it showing a now-stale list.
        if (get().isVersionHistoryOpen) {
          get().fetchWorkflowVersions();
        }
        return;
      }

      // 422 (ValidationFailedError) carries structured issues from the server-side re-check;
      // any other non-OK status is a generic failure with no issues to display.
      const issues: ValidationIssue[] = Array.isArray(data.issues) ? data.issues : [];
      set({ publishState: 'error', publishIssues: issues });
      get().addSimulationLog({
        type: 'error',
        message: `Falha ao publicar: ${data.error || res.statusText || 'erro desconhecido no servidor'}`
      });
    } catch (err) {
      logger.error('Error publishing workflow to server', { err });
      set({ publishState: 'error', publishIssues: [] });
      get().addSimulationLog({
        type: 'error',
        message: 'Falha ao publicar: não foi possível contatar o servidor.'
      });
    }
  },

  // "Histórico de Publicações": GET /workflow/:id/versions, tenant/workflow-scoped server-side
  // (workflowRepository.findWorkflowByIdForTenant — see workflowVersioning.test.ts). Never called
  // with any id other than this session's own `workflowId`, so a version list can never mix
  // tenants or workflows (AGENTS.md §15).
  openVersionHistory: () => {
    set({ isVersionHistoryOpen: true, rollbackState: 'idle', rollbackIssues: [], rollbackError: null });
    get().fetchWorkflowVersions();
  },

  closeVersionHistory: () => {
    set({ isVersionHistoryOpen: false });
  },

  fetchWorkflowVersions: async () => {
    const { workflowId } = get();
    if (!workflowId) {
      // Nothing has round-tripped through the server yet (or nothing has ever been published) —
      // a real empty state, never a fabricated placeholder list.
      set({ workflowVersions: [], versionHistoryState: 'idle', versionHistoryError: null });
      return;
    }

    set({ versionHistoryState: 'loading', versionHistoryError: null });
    try {
      const res = await fetch(`/api/workflow/${workflowId}/versions`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        set({
          versionHistoryState: 'error',
          workflowVersions: [],
          versionHistoryError: data.error || 'Não foi possível carregar o histórico de publicações.'
        });
        return;
      }

      const versions: WorkflowVersionSummary[] = Array.isArray(data.versions) ? data.versions : [];
      set({ versionHistoryState: 'idle', workflowVersions: versions, versionHistoryError: null });
    } catch (err) {
      logger.error('Error fetching workflow version history', { err });
      set({
        versionHistoryState: 'error',
        workflowVersions: [],
        versionHistoryError: 'Não foi possível contatar o servidor.'
      });
    }
  },

  rollbackWorkflowToVersion: async (version: number) => {
    const { workflowId } = get();
    if (!workflowId) return;

    set({
      rollbackState: 'rolling-back',
      rollbackTargetVersion: version,
      rollbackIssues: [],
      rollbackError: null
    });

    try {
      const res = await fetch(`/api/workflow/${workflowId}/versions/${version}/rollback`, {
        method: 'POST'
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.workflow) {
        const lifecycles: Record<string, NodeLifecycleState> = {};
        (Array.isArray(data.workflow.nodes) ? data.workflow.nodes : []).forEach((n: { id: string }) => {
          lifecycles[n.id] = 'Ready';
        });
        set({
          nodes: data.workflow.nodes || [],
          edges: data.workflow.edges || [],
          nodeLifecycles: lifecycles,
          workflowId: data.workflow.id ?? workflowId,
          rollbackState: 'success',
          rollbackTargetVersion: null
        });
        get().addSimulationLog({
          type: 'success',
          message: `Rollback concluído: versão ${version} restaurada e publicada como v${data.workflow.version}.`
        });
        // Rollback archives the version it superseded — refresh so the list reflects it.
        await get().fetchWorkflowVersions();
        return;
      }

      // 422 (ValidationFailedError) carries the same structured `issues` shape as
      // publishWorkflowToServer's rejection path — surfaced with the same ValidationIssuesList,
      // never a silent failure on a rejected rollback.
      const issues: ValidationIssue[] = Array.isArray(data.issues) ? data.issues : [];
      set({
        rollbackState: 'error',
        rollbackIssues: issues,
        rollbackError: data.error || 'Não foi possível restaurar esta versão.',
        rollbackTargetVersion: null
      });
      get().addSimulationLog({
        type: 'error',
        message: `Falha ao restaurar versão ${version}: ${data.error || res.statusText || 'erro desconhecido no servidor'}`
      });
    } catch (err) {
      logger.error('Error rolling back workflow version', { err });
      set({
        rollbackState: 'error',
        rollbackIssues: [],
        rollbackError: 'Não foi possível contatar o servidor.',
        rollbackTargetVersion: null
      });
      get().addSimulationLog({
        type: 'error',
        message: 'Falha ao restaurar versão: não foi possível contatar o servidor.'
      });
    }
  }
}));
