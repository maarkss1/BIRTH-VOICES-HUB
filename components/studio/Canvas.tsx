import { useCallback, useEffect, useState, lazy, Suspense } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  Connection,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  BackgroundVariant,
  ReactFlowProvider,
  SelectionMode,
  useOnSelectionChange,
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { validationEngine } from '../../lib/studio/ValidationEngine';
import { useStudioStore } from '../../store/useStudioStore';
import { StudioNode, StudioEdge } from '../../lib/studio/types';
import { 
  StartNode, EndNode, PromptNode, ConditionNode, ToolNode, LlmNode, VoiceNode, 
  QuestionNode, SwitchNode, MemoryNode, KnowledgeNode, HumanHandoffNode 
} from './nodes';
import { StudioEdge as CustomStudioEdge } from './edges/StudioEdge';
import { TopBar } from './panels/TopBar';
import { LayersPanel } from './panels/LayersPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { BottomDrawer } from './panels/BottomDrawer';
const TestSimulatorModal = lazy(() =>
  import('./panels/TestSimulatorModal').then((m) => ({ default: m.TestSimulatorModal }))
);

const nodeTypes = {
  start: StartNode,
  end: EndNode,
  prompt: PromptNode,
  condition: ConditionNode,
  tool: ToolNode,
  llm: LlmNode,
  voice: VoiceNode,
  question: QuestionNode,
  switch: SwitchNode,
  memory: MemoryNode,
  knowledge: KnowledgeNode,
  human_handoff: HumanHandoffNode,
};

const edgeTypes = {
  studioEdge: CustomStudioEdge,
};

function CanvasInner() {
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  
  const {
    nodes,
    edges,
    selectedNodeId,
    setSelectedNodeId,
    setNodes,
    setEdges,
    connectNodes,
    nodeLifecycles,
    loadWorkflowFromServer,
    saveWorkflowToServer,
    publishWorkflowToServer,
    publishState,
    publishIssues,
    openVersionHistory
  } = useStudioStore();

  useEffect(() => {
    // loadWorkflowFromServer();
  }, [loadWorkflowFromServer]);

  useEffect(() => {
    // Only save if there are actual nodes
    if (nodes.length > 0) {
      const timer = setTimeout(() => {
        saveWorkflowToServer();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [nodes, edges, saveWorkflowToServer]);

  useEffect(() => {
    // Auto-dismiss the publish result banner; the outcome is still visible afterwards via the
    // Errors & Validation tab (BottomDrawer) and the persistent simulation log, so nothing is
    // silently lost — this just keeps a stale "published" toast from sitting on screen forever.
    if (publishState === 'success' || publishState === 'error') {
      const timer = setTimeout(() => useStudioStore.setState({ publishState: 'idle' }), 5000);
      return () => clearTimeout(timer);
    }
  }, [publishState]);

  const { zoomIn, zoomOut, fitView } = useReactFlow();

  useOnSelectionChange({
    onChange: ({ nodes: selectedNodes }) => {
      setSelectedNodeId(selectedNodes.length > 0 ? selectedNodes[0].id : null);
    },
  });

  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;

  const result = validationEngine.validate(nodes, edges);
  const health = result.healthScore;
  const issues = result.issues;

  const renderedNodes = nodes.map(n => {
    const nodeIssues = issues.filter(i => i.nodeId === n.id);
    const lifecycle = nodeLifecycles[n.id] || 'Ready';
    return {
      ...n,
      data: {
        ...n.data,
        lifecycleState: lifecycle,
        validation: {
          isValid: nodeIssues.filter(i => i.type === 'error').length === 0,
          errors: nodeIssues.filter(i => i.type === 'error').map(i => i.message),
          warnings: nodeIssues.filter(i => i.type === 'warning').map(i => i.message),
        }
      }
    };
  });

  const onNodesChange = useCallback(
    (changes: NodeChange<StudioNode>[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<StudioEdge>[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges],
  );

  const onConnect = useCallback(
    (params: Connection) => connectNodes(params),
    [connectNodes],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#0B0D14]">
      <TopBar
        health={health}
        issues={issues}
        onZoomIn={() => zoomIn({ duration: 300 })}
        onZoomOut={() => zoomOut({ duration: 300 })}
        onFitView={() => fitView({ duration: 500, padding: 0.2 })}
        onSimulate={() => setIsSimulatorOpen(true)}
        onPublish={() => publishWorkflowToServer()}
        onOpenVersionHistory={openVersionHistory}
        publishState={publishState}
        publishIssues={publishIssues}
      />
      
      {isSimulatorOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0D14]/80">
              <div className="flex items-center gap-3 text-sm text-gray-300">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-white" />
                Loading simulator...
              </div>
            </div>
          }
        >
          <TestSimulatorModal onClose={() => setIsSimulatorOpen(false)} />
        </Suspense>
      )}
      
      <div className="flex-1 flex min-h-0 relative">
        <LayersPanel nodes={nodes} />
        
        <div className="flex-1 relative bg-[#0B0D14] overflow-hidden">
          <ReactFlow
            nodes={renderedNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            minZoom={0.1}
            maxZoom={2}
            snapToGrid={true}
            snapGrid={[20, 20]}
            elevateNodesOnSelect={true}
            selectionMode={SelectionMode.Partial}
            panOnScroll={true}
            zoomOnPinch={true}
            panOnDrag={[1, 2]} // Space + drag also works by default
            selectionOnDrag={true}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(255, 255, 255, 0.08)" />
            <Controls className="!bg-[#1A1D2D]/80 !border-white/10 !shadow-lg rounded-lg overflow-hidden backdrop-blur-xl [&_button]:!bg-transparent [&_button]:!border-white/5 [&_button]:!text-gray-300 hover:[&_button]:!bg-white/10" />
            <MiniMap 
              className="!bg-[#1A1D2D]/80 !border-white/10 !shadow-lg rounded-lg overflow-hidden backdrop-blur-xl" 
              maskColor="rgba(11, 13, 20, 0.8)" 
              nodeColor="#6366f1" 
              style={{ backgroundColor: 'transparent' }}
            />
          </ReactFlow>
        </div>

        <InspectorPanel selectedNode={selectedNode} />
      </div>

      <BottomDrawer />
    </div>
  );
}

export function VisualCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
