import React, { useState } from 'react';
import {
  Play, Pause, Square, AlertCircle, List,
  Terminal, BarChart2, Sparkles, Variable, Plus, Trash2, FastForward
} from 'lucide-react';
import { useStudioStore } from '../../../store/useStudioStore';
import { validationEngine } from '../../../lib/studio/ValidationEngine';
import { motion, AnimatePresence } from 'motion/react';
import { ValidationIssuesList } from './ValidationIssuesList';

export function BottomDrawer() {
  const [activeTab, setActiveTab] = useState<'runtime' | 'errors' | 'events' | 'analytics' | 'catarina'>('runtime');
  const [newVarName, setNewVarName] = useState('');
  const [newVarVal, setNewVarVal] = useState('');
  const [showAddVar, setShowAddVar] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  const {
    nodes,
    edges,
    isDebugging,
    simulationLogs,
    simulationVariables,
    isSimulationPaused,
    simulationSpeedMs,
    startSimulation,
    stopSimulation,
    pauseSimulation,
    resumeSimulation,
    stepSimulationForward,
    updateSimulationVariable,
    deleteSimulationVariable,
    applyAiRefactor,
    generateWorkflowFromPrompt
  } = useStudioStore();

  const valResult = validationEngine.validate(nodes, edges);
  const { issues, healthScore } = valResult;

  const handleAddVariable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVarName.trim()) return;
    updateSimulationVariable(newVarName.trim(), newVarVal);
    setNewVarName('');
    setNewVarVal('');
    setShowAddVar(false);
  };

  const handleAiRefactor = async (mode: 'simplify' | 'reduceCost' | 'reduceLatency' | 'moreHuman') => {
    setIsAiLoading(true);
    await applyAiRefactor(mode);
    setIsAiLoading(false);
  };

  const handleAiGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    setIsAiLoading(true);
    await generateWorkflowFromPrompt(aiPrompt);
    setAiPrompt('');
    setIsAiLoading(false);
  };

  return (
    <div className="h-72 bg-[#131520]/80 backdrop-blur-xl border-t border-white/5 flex flex-col shrink-0 z-20 shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.2)]">
      {/* Tabs Header */}
      <div className="h-10 border-b border-white/5 bg-transparent flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-1 h-full">
          <button 
            onClick={() => setActiveTab('runtime')}
            className={`px-3 h-full flex items-center gap-1.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'runtime' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <Play className="w-3.5 h-3.5" /> Runtime Simulator
            {isDebugging && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
            )}
          </button>

          <button 
            onClick={() => setActiveTab('errors')}
            className={`px-3 h-full flex items-center gap-1.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'errors' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 text-red-500" /> Errors & Validation
            {issues.length > 0 && (
              <span className="bg-red-500/10 text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-red-500/20">
                {issues.length}
              </span>
            )}
          </button>

          <button 
            onClick={() => setActiveTab('events')}
            className={`px-3 h-full flex items-center gap-1.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'events' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <List className="w-3.5 h-3.5 text-blue-500" /> Event Bus Log
          </button>

          <button 
            onClick={() => setActiveTab('analytics')}
            className={`px-3 h-full flex items-center gap-1.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'analytics' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5 text-emerald-500" /> Live Analytics
          </button>

          <button 
            onClick={() => setActiveTab('catarina')}
            className={`px-3 h-full flex items-center gap-1.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'catarina' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-500" /> Catarina AI Studio
          </button>
        </div>

        {/* Diagnostic Quick Tag */}
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-bold text-gray-500 font-mono">
            ENGINE: ACTIVE_VOICE_v1
          </div>
          <div className="h-3 w-px bg-white/10" />
          {issues.filter(i => i.type === 'error').length === 0 ? (
            <div className="text-[10px] font-semibold text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20 shadow-[0_0_5px_rgba(34,197,94,0.2)]">
              COMPILER OK
            </div>
          ) : (
            <div className="text-[10px] font-semibold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20 shadow-[0_0_5px_rgba(239,68,68,0.2)]">
              COMPILER ERROR ({issues.filter(i => i.type === 'error').length})
            </div>
          )}
        </div>
      </div>

      {/* Tabs Content */}
      <div className="flex-1 min-h-0 bg-transparent flex overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === 'runtime' && (
            <motion.div 
              key="runtime" 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="flex-1 flex min-h-0"
            >
              {/* Simulator Controls & Variables */}
              <div className="w-80 border-r border-white/5 p-4 flex flex-col min-h-0 bg-black/10">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Debugger Playback</span>
                  <span className="text-[10px] font-mono text-gray-500">Speed: {simulationSpeedMs}ms</span>
                </div>

                {/* Interactive Controls Buttons */}
                <div className="flex items-center gap-2 mb-4">
                  {!isDebugging ? (
                    <button 
                      onClick={startSimulation}
                      className="flex-1 py-2 px-3 bg-indigo-600/90 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(99,102,241,0.3)] border border-indigo-500/50 transition-all"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" /> Play Flow
                    </button>
                  ) : (
                    <>
                      {isSimulationPaused ? (
                        <button 
                          onClick={resumeSimulation}
                          className="flex-1 py-2 px-3 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.3)] border border-emerald-500/50 transition-all"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" /> Resume
                        </button>
                      ) : (
                        <button 
                          onClick={pauseSimulation}
                          className="flex-1 py-2 px-3 bg-amber-600/90 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(245,158,11,0.3)] border border-amber-500/50 transition-all"
                        >
                          <Pause className="w-3.5 h-3.5" /> Pause
                        </button>
                      )}
                      
                      <button 
                        onClick={stepSimulationForward}
                        title="Step Forward (Next Node)"
                        className="p-2 bg-white/10 hover:bg-white/20 text-gray-300 rounded-lg text-xs font-semibold transition-all border border-white/5"
                      >
                        <FastForward className="w-3.5 h-3.5" />
                      </button>

                      <button 
                        onClick={stopSimulation}
                        className="py-2 px-3 bg-red-600/90 hover:bg-red-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(239,68,68,0.3)] border border-red-500/50 transition-all"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" /> Stop
                      </button>
                    </>
                  )}
                </div>

                {/* Session Variables Head */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-300 flex items-center gap-1">
                    <Variable className="w-3.5 h-3.5 text-indigo-400" /> Telemetry Variables
                  </span>
                  <button 
                    onClick={() => setShowAddVar(!showAddVar)}
                    className="text-[10px] font-bold text-indigo-400 hover:bg-indigo-500/20 px-1.5 py-0.5 rounded flex items-center gap-0.5 transition-colors border border-transparent hover:border-indigo-500/30"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>

                {/* Variable Form */}
                {showAddVar && (
                  <form onSubmit={handleAddVariable} className="p-2 bg-white/5 border border-white/10 rounded-lg mb-2 space-y-2">
                    <div className="flex gap-1">
                      <input
                        type="text"
                        placeholder="key"
                        aria-label="Nome da variável de telemetria"
                        value={newVarName}
                        onChange={e => setNewVarName(e.target.value)}
                        className="w-1/2 text-xs p-1 bg-black/20 border border-white/10 rounded outline-none focus:bg-white/10 focus:border-indigo-500/50 text-gray-200 placeholder-gray-600"
                        required
                      />
                      <input
                        type="text"
                        placeholder="value"
                        aria-label="Valor da variável de telemetria"
                        value={newVarVal}
                        onChange={e => setNewVarVal(e.target.value)}
                        className="w-1/2 text-xs p-1 bg-black/20 border border-white/10 rounded outline-none focus:bg-white/10 focus:border-indigo-500/50 text-gray-200 placeholder-gray-600"
                      />
                    </div>
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => setShowAddVar(false)} className="text-[10px] text-gray-500 hover:text-gray-300">Cancel</button>
                      <button type="submit" className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded shadow-[0_0_10px_rgba(99,102,241,0.3)]">Save</button>
                    </div>
                  </form>
                )}

                {/* Variables List */}
                <div className="flex-1 overflow-y-auto space-y-1">
                  {Object.entries(simulationVariables).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between px-2 py-1 bg-white/5 border border-white/10 rounded text-xs font-mono group hover:border-white/20 hover:bg-white/10 transition-colors">
                      <span className="text-indigo-400 font-semibold truncate max-w-[120px]" title={k}>{k}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-300 font-medium truncate max-w-[110px]" title={String(v)}>{String(v)}</span>
                        <button 
                          onClick={() => deleteSimulationVariable(k)} 
                          className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Monospace Execution Logs */}
              <div className="flex-1 bg-[#090a0f] p-4 font-mono text-xs overflow-y-auto space-y-1 text-slate-300 select-text">
                <div className="text-slate-500 border-b border-white/5 pb-2 mb-2 flex items-center justify-between">
                  <span>CONSOLE STREAM LOGS (v1.0.4)</span>
                  <span className="text-[10px] text-indigo-400">STATE: {isDebugging ? 'RUNNING' : 'IDLE'}</span>
                </div>
                <div className="text-slate-600 text-[10px] italic -mt-1 mb-1">
                  {"// Simulação local (mock): percorre os nós/arestas reais deste fluxo no navegador, mas não invoca o Voice Runtime em produção nem provedores de LLM/TTS reais."}
                </div>
                {simulationLogs.length === 0 && (
                  <div className="text-slate-600 italic py-8 text-center">
                    {"// No logs captured. Click 'Play Flow' to execute step-by-step simulator."}
                  </div>
                )}
                {simulationLogs.map((log, idx) => {
                  let color = 'text-slate-400';
                  if (log.type === 'success') color = 'text-green-400';
                  if (log.type === 'warn') color = 'text-amber-400';
                  if (log.type === 'error') color = 'text-red-400';
                  if (log.type === 'event') color = 'text-indigo-400';

                  return (
                    <div key={idx} className="flex items-start gap-2 hover:bg-white/5 py-0.5 px-1 rounded transition-colors">
                      <span className="text-slate-600 shrink-0 select-none">[{log.timestamp}]</span>
                      {log.nodeLabel && (
                        <span className="text-purple-400 font-bold shrink-0 select-none">[{log.nodeLabel}]</span>
                      )}
                      <span className={color}>{log.message}</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {activeTab === 'errors' && (
            <motion.div 
              key="errors" 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="flex-1 p-4 overflow-y-auto space-y-2 bg-transparent"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2">
                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-gray-500" /> Compiler Validation Engine
                </span>
                <span className="text-xs text-gray-500">Live background compile updates continuously</span>
              </div>

              <ValidationIssuesList issues={issues} />
            </motion.div>
          )}

          {activeTab === 'events' && (
            <motion.div 
              key="events" 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="flex-1 bg-[#090a0f] p-4 font-mono text-xs overflow-y-auto space-y-1.5 text-slate-300 select-text"
            >
              <div className="text-slate-500 border-b border-white/5 pb-2 mb-2">
                EVENT-DRIVEN STREAM LOGS (Birth Voice Engine Bus)
              </div>
              <div className="flex items-start gap-2 hover:bg-white/5 py-1 px-1.5 rounded text-indigo-300 transition-colors">
                <span>[08:12:01]</span>
                <span>EVENT_EMITTED</span>
                <span>telephony.session.init {JSON.stringify({ ani: "+5511999998888", dnis: "0800-999-888" })}</span>
              </div>
              <div className="flex items-start gap-2 hover:bg-white/5 py-1 px-1.5 rounded text-green-300 transition-colors">
                <span>[08:12:02]</span>
                <span>EVENT_EMITTED</span>
                <span>voice.provider.loaded {JSON.stringify({ voiceId: "Rachel", latencyMs: 240 })}</span>
              </div>
              <div className="flex items-start gap-2 hover:bg-white/5 py-1 px-1.5 rounded text-blue-300 transition-colors">
                <span>[08:12:03]</span>
                <span>EVENT_EMITTED</span>
                <span>prompt.generation.chunk_stream {JSON.stringify({ tokens: 140, provider: "Gemini" })}</span>
              </div>
              <div className="flex items-start gap-2 hover:bg-white/5 py-1 px-1.5 rounded text-amber-300 transition-colors">
                <span>[08:12:04]</span>
                <span>EVENT_EMITTED</span>
                <span>decision.match_score.intent {JSON.stringify({ value: "Suporte", score: 0.94 })}</span>
              </div>
            </motion.div>
          )}

          {activeTab === 'analytics' && (
            <motion.div 
              key="analytics" 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="flex-1 p-4 overflow-y-auto grid grid-cols-2 md:grid-cols-4 gap-3 bg-transparent"
            >
              {/* Dynamic Health Scores */}
              <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Complexity / Legibilidade</div>
                <div className="text-2xl font-bold text-gray-200 font-mono mt-1">{healthScore.complexity}%</div>
                <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-indigo-500 h-full shadow-[0_0_8px_rgba(99,102,241,0.5)]" style={{ width: `${healthScore.complexity}%` }} />
                </div>
              </div>

              <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Estimated Cost / 10k calls</div>
                <div className="text-2xl font-bold text-gray-200 font-mono mt-1">${(healthScore.estimatedCost * 10000).toFixed(2)}</div>
                <div className="text-[10px] text-gray-500 mt-1 font-mono">Avg: ${healthScore.estimatedCost} USD per call</div>
              </div>

              <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Avg Latency (STT + LLM + TTS)</div>
                <div className="text-2xl font-bold text-gray-200 font-mono mt-1">{healthScore.latency}ms</div>
                <div className="text-[10px] text-green-400 font-semibold mt-1">Excellent (under 1200ms)</div>
              </div>

              <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Risk Assessment Score</div>
                <div className="text-2xl font-bold text-red-400 font-mono mt-1">{healthScore.risk}%</div>
                <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-red-500 h-full shadow-[0_0_8px_rgba(239,68,68,0.5)]" style={{ width: `${healthScore.risk}%` }} />
                </div>
              </div>

              <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Node Reusability Index</div>
                <div className="text-xl font-bold text-gray-300 font-mono mt-1">{healthScore.reusability}/100</div>
              </div>

              <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Path Coverage Score</div>
                <div className="text-xl font-bold text-gray-300 font-mono mt-1">{healthScore.coverage}/100</div>
              </div>

              <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Scalability Rating</div>
                <div className="text-xl font-bold text-gray-300 font-mono mt-1">{healthScore.scalability}/100</div>
              </div>

              <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Overall Quality Index</div>
                <div className="text-xl font-bold text-indigo-400 font-mono mt-1">{healthScore.quality}/100</div>
              </div>
            </motion.div>
          )}

          {activeTab === 'catarina' && (
            <motion.div 
              key="catarina" 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="flex-1 p-4 flex min-h-0 bg-indigo-500/5"
            >
              {/* Refactoring operations */}
              <div className="w-72 border-r border-white/5 pr-4 flex flex-col gap-2 shrink-0">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Refatoração e Otimização AI</span>
                <p className="text-[11px] text-gray-400 mb-1">
                  Selecione uma otimização com Catarina para reorganizar e calibrar os parâmetros dos nós automaticamente.
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  <button 
                    disabled={isAiLoading}
                    onClick={() => handleAiRefactor('simplify')}
                    className="py-1.5 px-2.5 bg-white/5 border border-white/10 hover:border-indigo-500/50 hover:bg-white/10 text-left rounded-md text-xs font-medium text-gray-300 flex items-center justify-between transition-all"
                  >
                    <span>Simplificar Estrutura</span>
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  </button>
                  <button 
                    disabled={isAiLoading}
                    onClick={() => handleAiRefactor('reduceCost')}
                    className="py-1.5 px-2.5 bg-white/5 border border-white/10 hover:border-indigo-500/50 hover:bg-white/10 text-left rounded-md text-xs font-medium text-gray-300 flex items-center justify-between transition-all"
                  >
                    <span>Reduzir Custos (Flash Engines)</span>
                    <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  </button>
                  <button 
                    disabled={isAiLoading}
                    onClick={() => handleAiRefactor('reduceLatency')}
                    className="py-1.5 px-2.5 bg-white/5 border border-white/10 hover:border-indigo-500/50 hover:bg-white/10 text-left rounded-md text-xs font-medium text-gray-300 flex items-center justify-between transition-all"
                  >
                    <span>Diminuir Latência Geral</span>
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  </button>
                  <button 
                    disabled={isAiLoading}
                    onClick={() => handleAiRefactor('moreHuman')}
                    className="py-1.5 px-2.5 bg-white/5 border border-white/10 hover:border-indigo-500/50 hover:bg-white/10 text-left rounded-md text-xs font-medium text-gray-300 flex items-center justify-between transition-all"
                  >
                    <span>Tornar mais Humano e Empático</span>
                    <Sparkles className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                  </button>
                </div>
              </div>

              {/* Chat Prompter for AI Node Generator */}
              <div className="flex-1 pl-4 flex flex-col min-h-0">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Catarina AI Workflow Generator
                </span>
                <p className="text-[11px] text-gray-400 mb-3">
                  Escreva um prompt em linguagem natural para gerar uma arquitetura completa de Voice Agent.
                </p>

                <form onSubmit={handleAiGenerate} className="flex-1 flex flex-col min-h-0 justify-between">
                  <div className="flex-1 min-h-0 bg-black/20 border border-white/10 rounded-lg p-2 flex flex-col">
                    <textarea
                      placeholder="Ex: Crie um fluxo completo para qualificação de leads com confirmação de CPF via voz e busca de FAQs..."
                      aria-label="Prompt em linguagem natural para gerar workflow via IA"
                      value={aiPrompt}
                      onChange={e => setAiPrompt(e.target.value)}
                      disabled={isAiLoading}
                      className="w-full flex-1 text-xs resize-none outline-none text-gray-200 bg-transparent placeholder-gray-600"
                    />
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    <div className="flex gap-1.5">
                      <span
                        onClick={() => setAiPrompt('Crie um assistente para qualificar leads e agendar reuniões comerciais.')}
                        className="text-[10px] text-indigo-300 bg-indigo-500/20 hover:bg-indigo-500/30 px-2 py-1 rounded cursor-pointer font-medium border border-indigo-500/30 transition-colors"
                      >
                        Qualificar leads
                      </span>
                      <span 
                        onClick={() => setAiPrompt('Gere um fluxo de suporte técnico para provedor de internet.')}
                        className="text-[10px] text-indigo-300 bg-indigo-500/20 hover:bg-indigo-500/30 px-2 py-1 rounded cursor-pointer font-medium border border-indigo-500/30 transition-colors"
                      >
                        Roteamento Suporte
                      </span>
                    </div>
                    
                    <button 
                      type="submit"
                      disabled={isAiLoading || !aiPrompt.trim()}
                      className="py-1.5 px-4 bg-indigo-600/90 hover:bg-indigo-500 disabled:bg-white/10 disabled:text-gray-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-[0_0_15px_rgba(99,102,241,0.3)] transition-all shrink-0 border border-indigo-500/50"
                    >
                      {isAiLoading ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          Gerando...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 fill-current" /> Gerar Workflow
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
