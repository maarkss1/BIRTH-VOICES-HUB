// `import type` (not a plain runtime import) is deliberate: this module is imported both from
// the browser bundle (components/studio/**) and, for server-side publish-gate validation, from
// the Express backend (src/services/workflowService.ts). A runtime import of `@xyflow/react`
// here would drag a browser-oriented React component library into the Node.js server bundle.
// Erasing it at compile time keeps this file (and ValidationEngine.ts, which only imports types
// from here) safe to import from either environment.
import type { Node, Edge } from '@xyflow/react';

export type NodeType =
  | 'start'
  | 'end'
  | 'prompt'
  | 'question'
  | 'condition'
  | 'switch'
  | 'memory'
  | 'knowledge'
  | 'tool'
  | 'human_handoff'
  | 'voice'
  | 'llm';

export interface StudioNodeData extends Record<string, unknown> {
  label: string;
  category: string;
  icon?: string;
  color?: string;
  // Node config is a dynamic key/value bag whose shape depends on the node's
  // registry entry (see nodeRegistry.defaultConfig in store/useStudioStore.ts,
  // itself typed as Record<string, unknown>) and is edited field-by-field via
  // InspectorPanel; there is no single fixed schema across node types.
  config?: Record<string, unknown>;
  lifecycleState?: string;
  validation?: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
  metrics?: {
    invocations: number;
    errorRate: number;
    latencyMs: number;
  };
}

export type StudioNode = Node<StudioNodeData, NodeType>;

export interface StudioEdgeData extends Record<string, unknown> {
  condition?: string;
  priority?: number;
  weight?: number;
  description?: string;
  category?: string;
  event?: string;
  isFallback?: boolean;
}

export type StudioEdge = Edge<StudioEdgeData>;

export interface FlowHealthScore {
  score: number;
  complexity: number; // 0-100
  performance: number; // 0-100
  estimatedCost: number; // USD per 10k runs
  latency: number; // ms
  risk: number; // 0-100
  reusability: number; // 0-100
  coverage: number; // 0-100
  scalability: number; // 0-100
  quality: number; // 0-100
}

export interface ValidationIssue {
  id: string;
  nodeId?: string;
  edgeId?: string;
  type: 'error' | 'warning' | 'suggestion' | 'best_practice';
  message: string;
}

/**
 * Client-side shape of one entry returned by `GET /workflow/:id/versions` — the "Histórico de
 * Publicações" panel's list item (`components/studio/panels/VersionHistoryPanel.tsx`). Mirrors
 * the subset of `PublishedWorkflowVersion` (src/services/workflowService.ts) the Studio actually
 * renders; `nodes`/`edges`/`metadata` also come back on the wire but are not needed client-side —
 * rollback re-fetches the full active workflow via its own response instead of the archive entry.
 */
export interface WorkflowVersionSummary {
  version: number;
  publishedAt: string; // ISO 8601
  publishedBy: string | null;
}

export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  healthScore: FlowHealthScore;
}
