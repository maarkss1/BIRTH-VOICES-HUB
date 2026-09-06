import React, { useId, useState } from 'react';
import {
  Settings2, Code, Activity, Variable, Plus,
  BookOpen, Link, Trash2, ShieldAlert
} from 'lucide-react';
import { StudioNode } from '../../../lib/studio/types';
import { useStudioStore, nodeRegistry } from '../../../store/useStudioStore';
import { motion, AnimatePresence } from 'motion/react';

interface InspectorPanelProps {
  selectedNode: StudioNode | null;
}

export function InspectorPanel({ selectedNode }: InspectorPanelProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'config' | 'variables' | 'connections' | 'analytics' | 'documentation'>('general');
  const [newVarName, setNewVarName] = useState('');
  const [newVarVal, setNewVarVal] = useState('');
  const [showAddVar, setShowAddVar] = useState(false);
  const labelId = useId();
  const descriptionId = useId();
  const newVarNameId = useId();
  const newVarValId = useId();

  const {
    edges,
    nodeLifecycles,
    updateNodeMetadata,
    updateNodeConfig,
    toggleFavorite,
    favorites,
    updateSimulationVariable,
    simulationVariables,
    deleteNode
  } = useStudioStore();

  if (!selectedNode) {
    return (
      <div className="w-80 bg-[#131520]/80 backdrop-blur-xl border-l border-white/5 flex flex-col h-full shrink-0">
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-gray-500">
          <Settings2 className="w-8 h-8 mb-3 opacity-20" />
          <p className="text-sm font-medium text-gray-400">Selecione um Nó para inspecionar</p>
          <p className="text-xs mt-1">Configure parâmetros, variáveis e visualize telemetria em tempo real.</p>
        </div>
      </div>
    );
  }

  const { id, type, data } = selectedNode;
  const regItem = nodeRegistry[type];
  const lifecycle = nodeLifecycles[id] || 'Ready';
  const isFav = favorites.includes(type);

  // Filter incoming and outgoing connections for this specific node
  const incomingEdges = edges.filter(e => e.target === id);
  const outgoingEdges = edges.filter(e => e.source === id);

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateNodeMetadata(id, { label: e.target.value });
  };

  const handleDescChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNodeMetadata(id, { description: e.target.value });
  };

  const handleConfigChange = (key: string, value: string) => {
    updateNodeConfig(id, key, value);
  };

  const handleAddVariable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVarName.trim()) return;
    updateSimulationVariable(newVarName.trim(), newVarVal);
    setNewVarName('');
    setNewVarVal('');
    setShowAddVar(false);
  };

  return (
    <div className="w-80 bg-[#131520]/80 backdrop-blur-xl border-l border-white/5 flex flex-col h-full shrink-0 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.2)]">
      {/* Header */}
      <div className="p-4 border-b border-white/5 bg-transparent shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-[10px] font-bold text-indigo-400 uppercase tracking-wider border border-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.1)]">
            {regItem?.category || data.category || 'Node'}
          </span>
          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => toggleFavorite(type)}
              className={`p-1 rounded hover:bg-white/10 ${isFav ? 'text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]' : 'text-gray-500 hover:text-gray-400'}`}
              title={isFav ? "Remover dos Favoritos" : "Favoritar Nó"}
            >
              ★
            </button>
            <span className="text-[9px] text-gray-400 font-mono bg-white/5 px-1.5 py-0.5 rounded border border-white/10">{id}</span>
          </div>
        </div>
        <h2 className="text-base font-bold text-gray-200 truncate">{data.label}</h2>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
          <span className="text-[10px] text-gray-400 font-mono">STATE: <span className="text-gray-300">{lifecycle}</span></span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-white/5 bg-transparent shrink-0 overflow-x-auto scrollbar-none">
        {(['general', 'config', 'variables', 'connections', 'analytics', 'documentation'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 pt-2.5 px-3 border-b-2 text-[11px] font-bold uppercase tracking-wide transition-colors whitespace-nowrap shrink-0 ${
              activeTab === tab 
                ? 'border-indigo-500 text-indigo-400' 
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab === 'config' ? 'Setup' : tab}
          </button>
        ))}
      </div>

      {/* Tab Panel Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <AnimatePresence mode="wait">
          {activeTab === 'general' && (
            <motion.div 
              key="general" 
              initial={{ opacity: 0, y: 5 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0 }} 
              className="space-y-5"
            >
              {/* Identity Properties */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-gray-300 flex items-center gap-1.5 uppercase tracking-wider">
                  <Settings2 className="w-3.5 h-3.5 text-indigo-400" /> General Properties
                </h3>
                
                <div className="space-y-3">
                  <div>
                    <label htmlFor={labelId} className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Node Title</label>
                    <input
                      id={labelId}
                      type="text"
                      value={data.label}
                      onChange={handleLabelChange}
                      className="w-full text-sm px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all text-gray-200 placeholder-gray-600"
                    />
                  </div>
                  <div>
                    <label htmlFor={descriptionId} className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Developer Notes / Description</label>
                    <textarea
                      id={descriptionId}
                      value={typeof data.description === 'string' ? data.description : ''}
                      onChange={handleDescChange}
                      className="w-full text-sm px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 outline-none resize-none h-24 transition-all text-gray-200 placeholder-gray-600"
                      placeholder="Ex: Este prompt acolhe o cliente e valida o telefone inicial..."
                    />
                  </div>
                </div>
              </div>

              <hr className="border-white/10" />

              {/* Node Versioning & Registry Specifications */}
              {regItem && (
                <div className="space-y-2 text-xs text-gray-400 bg-white/5 p-3 rounded-lg border border-white/10">
                  <div className="font-bold text-gray-300">SPECIFICATION REGISTRY</div>
                  <div className="flex justify-between">
                    <span>Engine Type:</span>
                    <span className="font-mono font-medium text-gray-300">{type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Active Version:</span>
                    <span className="font-mono font-medium text-indigo-400">v{regItem.version}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Inputs / Outputs:</span>
                    <span className="font-mono font-medium text-gray-300">{regItem.inputs} In / {regItem.outputs} Out</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Dependency Match:</span>
                    <span className="text-[10px] bg-indigo-500/10 text-indigo-300 px-1 rounded font-semibold border border-indigo-500/20">{regItem.dependencies[0] || 'none'}</span>
                  </div>
                </div>
              )}

              <hr className="border-white/10" />

              {/* Delete Action button */}
              <button 
                onClick={() => deleteNode(id)}
                className="w-full py-2 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]"
              >
                <Trash2 className="w-3.5 h-3.5" /> Deletar Nó do Canvas
              </button>
            </motion.div>
          )}

          {activeTab === 'config' && (
            <motion.div 
              key="config" 
              initial={{ opacity: 0, y: 5 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0 }} 
              className="space-y-5"
            >
              <h3 className="text-xs font-bold text-gray-300 flex items-center gap-1.5 uppercase tracking-wider">
                <Code className="w-3.5 h-3.5 text-indigo-400" /> Setup Configuration
              </h3>

              {!data.config || Object.keys(data.config).length === 0 ? (
                <div className="p-4 bg-white/5 border border-white/10 rounded-lg text-center text-xs text-gray-500 italic">
                  Este nó não necessita de configurações adicionais.
                </div>
              ) : (
                <div className="space-y-4 p-3.5 bg-white/5 border border-white/10 rounded-xl">
                  {Object.entries(data.config).map(([key, value]) => {
                    const configFieldId = `config-${id}-${key}`;
                    return (
                      <div key={key} className="space-y-1">
                        <label htmlFor={configFieldId} className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </label>
                        {typeof value === 'string' && value.length > 50 ? (
                          <textarea
                            id={configFieldId}
                            value={String(value)}
                            onChange={e => handleConfigChange(key, e.target.value)}
                            className="w-full text-xs p-2 bg-black/20 border border-white/10 rounded focus:bg-white/10 focus:border-indigo-500/50 outline-none transition-all h-28 font-sans text-gray-200 placeholder-gray-600"
                          />
                        ) : (
                          <input
                            id={configFieldId}
                            type="text"
                            value={String(value)}
                            onChange={e => handleConfigChange(key, e.target.value)}
                            className="w-full text-xs px-2.5 py-1.5 bg-black/20 border border-white/10 rounded focus:bg-white/10 focus:border-indigo-500/50 outline-none transition-all font-sans text-gray-200 placeholder-gray-600"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'variables' && (
            <motion.div 
              key="variables" 
              initial={{ opacity: 0, y: 5 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0 }} 
              className="space-y-5"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-300 flex items-center gap-1.5 uppercase tracking-wider">
                  <Variable className="w-3.5 h-3.5 text-indigo-400" /> Bound State Variables
                </h3>
                <button 
                  onClick={() => setShowAddVar(!showAddVar)}
                  className="text-[10px] font-bold text-indigo-400 hover:bg-indigo-500/20 px-1.5 py-0.5 rounded flex items-center gap-0.5 border border-transparent hover:border-indigo-500/30 transition-colors"
                >
                  <Plus className="w-3 h-3" /> ADD
                </button>
              </div>

              {showAddVar && (
                <form onSubmit={handleAddVariable} className="p-3 bg-white/5 border border-indigo-500/30 rounded-lg space-y-2">
                  <div>
                    <label htmlFor={newVarNameId} className="block text-[9px] font-bold text-indigo-400 uppercase">Variable Name</label>
                    <input
                      id={newVarNameId}
                      type="text"
                      placeholder="user_cpf"
                      value={newVarName}
                      onChange={e => setNewVarName(e.target.value)}
                      className="w-full text-xs p-1.5 bg-black/20 border border-white/10 rounded mt-0.5 focus:bg-white/10 outline-none text-gray-200"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor={newVarValId} className="block text-[9px] font-bold text-indigo-400 uppercase">Value</label>
                    <input
                      id={newVarValId}
                      type="text"
                      placeholder="12345678909"
                      value={newVarVal}
                      onChange={e => setNewVarVal(e.target.value)}
                      className="w-full text-xs p-1.5 bg-black/20 border border-white/10 rounded mt-0.5 focus:bg-white/10 outline-none text-gray-200"
                    />
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <button type="button" onClick={() => setShowAddVar(false)} className="text-[10px] text-gray-400 hover:text-gray-200">Cancel</button>
                    <button type="submit" className="text-[10px] bg-indigo-600/90 text-white px-2.5 py-1 rounded shadow-[0_0_10px_rgba(99,102,241,0.3)] border border-indigo-500/50 hover:bg-indigo-500 transition-colors">Create</button>
                  </div>
                </form>
              )}

              <div className="space-y-2">
                {Object.entries(simulationVariables).map(([k, v]) => (
                  <div key={k} className="p-2.5 bg-white/5 border border-white/10 rounded-lg flex items-center justify-between hover:border-white/20 hover:bg-white/10 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 bg-indigo-500/20 rounded flex items-center justify-center text-indigo-400 font-mono text-[10px] font-bold border border-indigo-500/30">V</div>
                      <div>
                        <div className="text-xs font-bold text-gray-200">{k}</div>
                        <div className="text-[10px] text-gray-400 font-mono">Value: {String(v)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'connections' && (
            <motion.div 
              key="connections" 
              initial={{ opacity: 0, y: 5 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0 }} 
              className="space-y-5"
            >
              {/* Incoming Connections */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-gray-300 flex items-center gap-1.5 uppercase tracking-wider">
                  <Link className="w-3.5 h-3.5 text-blue-400" /> Incoming Ports (Inputs)
                </h3>

                {incomingEdges.length === 0 ? (
                  <div className="text-xs italic text-gray-500 p-2 bg-white/5 rounded border border-white/10 border-dashed">
                    Nenhum nó conectado na entrada.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {incomingEdges.map(edge => (
                      <div key={edge.id} className="p-2.5 bg-white/5 border border-white/10 rounded-lg text-xs flex justify-between items-center transition-colors hover:bg-white/10">
                        <span className="font-semibold text-gray-300">From Node: {edge.source}</span>
                        {edge.data?.description && (
                          <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 rounded border border-blue-500/30">{edge.data.description}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <hr className="border-white/10" />

              {/* Outgoing Connections */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-gray-300 flex items-center gap-1.5 uppercase tracking-wider">
                  <Link className="w-3.5 h-3.5 text-purple-400" /> Outgoing Ports (Outputs)
                </h3>

                {outgoingEdges.length === 0 ? (
                  <div className="text-xs italic text-gray-500 p-2 bg-white/5 rounded border border-white/10 border-dashed">
                    Nenhum nó conectado na saída.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {outgoingEdges.map(edge => (
                      <div key={edge.id} className="p-2.5 bg-white/5 border border-white/10 rounded-lg text-xs space-y-1.5 transition-colors hover:bg-white/10">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-gray-300">To Node: {edge.target}</span>
                          {edge.sourceHandle && (
                            <span className="text-[9px] font-mono bg-white/10 text-gray-400 px-1 rounded border border-white/10">{edge.sourceHandle}</span>
                          )}
                        </div>
                        {edge.data?.condition && (
                          <div className="text-[10px] font-mono text-indigo-400 font-medium">
                            IF: {edge.data.condition}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'analytics' && (
            <motion.div 
              key="analytics" 
              initial={{ opacity: 0, y: 5 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0 }} 
              className="space-y-5"
            >
              <h3 className="text-xs font-bold text-gray-300 flex items-center gap-1.5 uppercase tracking-wider">
                <Activity className="w-3.5 h-3.5 text-indigo-400" /> Telemetry & Health
              </h3>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/5 p-3 border border-white/10 rounded-lg">
                  <div className="text-[9px] font-bold text-gray-500 uppercase">Invocations</div>
                  <div className="text-lg font-bold text-gray-200 font-mono mt-0.5">
                    {(data.metrics?.invocations || 0).toLocaleString()}
                  </div>
                </div>
                <div className="bg-white/5 p-3 border border-white/10 rounded-lg">
                  <div className="text-[9px] font-bold text-gray-500 uppercase">Avg Latency</div>
                  <div className="text-lg font-bold text-gray-200 font-mono mt-0.5">
                    {data.metrics?.latencyMs || 0}ms
                  </div>
                </div>
                <div className="bg-white/5 p-3 border border-white/10 rounded-lg col-span-2">
                  <div className="text-[9px] font-bold text-gray-500 uppercase">Error Rate</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-lg font-bold text-green-400 font-mono">
                      {((data.metrics?.errorRate || 0) * 100).toFixed(1)}%
                    </span>
                    <span className="text-[9px] font-semibold text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]">
                      Healthy
                    </span>
                  </div>
                </div>
              </div>

              {/* Validation Status card */}
              <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-2">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">COMPILER STATUS</div>
                {data.validation?.isValid !== false ? (
                  <div className="flex items-center gap-2 text-xs font-semibold text-green-400 bg-green-500/10 p-2 border border-green-500/20 rounded-lg shadow-[0_0_10px_rgba(34,197,94,0.1)]">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full shadow-[0_0_5px_rgba(34,197,94,0.5)]" /> No errors found
                  </div>
                ) : (
                  <div className="p-2 border border-red-500/20 bg-red-500/10 rounded-lg space-y-1 shadow-[0_0_10px_rgba(239,68,68,0.1)]">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-red-400">
                      <ShieldAlert className="w-3.5 h-3.5" /> Compiler Error
                    </div>
                    {data.validation.errors.map((err, idx) => (
                      <p key={idx} className="text-[10px] text-red-300 font-medium">{err}</p>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'documentation' && (
            <motion.div 
              key="documentation" 
              initial={{ opacity: 0, y: 5 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0 }} 
              className="space-y-4"
            >
              <h3 className="text-xs font-bold text-gray-300 flex items-center gap-1.5 uppercase tracking-wider">
                <BookOpen className="w-3.5 h-3.5 text-indigo-400" /> Auto-Documentation
              </h3>

              {regItem?.documentation ? (
                <div className="space-y-4 text-xs text-gray-300">
                  <div>
                    <div className="font-bold text-indigo-400 uppercase text-[10px]">Objective & Goal</div>
                    <p className="mt-1 leading-relaxed bg-white/5 p-2.5 rounded-lg border border-white/10 text-gray-400">{regItem.documentation.goal}</p>
                  </div>

                  <div>
                    <div className="font-bold text-indigo-400 uppercase text-[10px]">Outputs Desc</div>
                    <ul className="mt-1 list-disc list-inside space-y-1 pl-1.5 text-gray-400">
                      {regItem.documentation.outputsDesc.map((desc, i) => (
                        <li key={i}>{desc}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div className="font-bold text-indigo-400 uppercase text-[10px]">Best Practices</div>
                    <ul className="mt-1 list-disc list-inside space-y-1 pl-1.5 text-gray-400">
                      {regItem.documentation.bestPractices.map((bp, i) => (
                        <li key={i}>{bp}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div className="font-bold text-indigo-400 uppercase text-[10px]">Examples</div>
                    <ul className="mt-1 list-disc list-inside space-y-1 pl-1.5 text-gray-400">
                      {regItem.documentation.examples.map((ex, i) => (
                        <li key={i}>{ex}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-500 italic">Nenhuma documentação registrada para este nó.</div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
