import React, { useState } from 'react';
import {
  Component, ChevronDown, ChevronRight,
  Database, Mic, Headphones, Play, Square, MessageSquare, GitBranch,
  Wrench, BrainCircuit, HelpCircle, Split, BookOpen, Search,
  FolderOpen
} from 'lucide-react';
import { StudioNode } from '../../../lib/studio/types';
import { useStudioStore, nodeRegistry } from '../../../store/useStudioStore';

interface LayersPanelProps {
  nodes: StudioNode[];
}

export function LayersPanel({ nodes }: LayersPanelProps) {
  const [activeTab, setActiveTab] = useState<'layers' | 'assets' | 'templates' | 'favorites'>('assets');
  const [expandedLayers, setExpandedLayers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const {
    addNodeFromRegistry,
    favorites,
    toggleFavorite,
    templates,
    setSelectedNodeId,
    setNodes,
    setEdges,
    nodeLifecycles
  } = useStudioStore();

  const getIconForType = (type: string) => {
    switch (type) {
      case 'start': return <Play className="w-3.5 h-3.5 text-green-500 shrink-0" />;
      case 'voice': return <Mic className="w-3.5 h-3.5 text-pink-500 shrink-0" />;
      case 'llm': return <BrainCircuit className="w-3.5 h-3.5 text-purple-500 shrink-0" />;
      case 'prompt': return <MessageSquare className="w-3.5 h-3.5 text-indigo-500 shrink-0" />;
      case 'question': return <HelpCircle className="w-3.5 h-3.5 text-teal-500 shrink-0" />;
      case 'condition': return <GitBranch className="w-3.5 h-3.5 text-orange-500 shrink-0" />;
      case 'switch': return <Split className="w-3.5 h-3.5 text-yellow-500 shrink-0" />;
      case 'knowledge': return <BookOpen className="w-3.5 h-3.5 text-cyan-500 shrink-0" />;
      case 'tool': return <Wrench className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
      case 'memory': return <Database className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
      case 'human_handoff': return <Headphones className="w-3.5 h-3.5 text-rose-500 shrink-0" />;
      case 'end': return <Square className="w-3.5 h-3.5 text-slate-700 shrink-0" />;
      default: return <Component className="w-3.5 h-3.5 text-gray-500 shrink-0" />;
    }
  };

  // Filter registered nodes based on search and category filters
  const filteredRegistry = Object.values(nodeRegistry).filter((node) => {
    const matchesSearch = 
      node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.category.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = categoryFilter === 'all' || node.category.toLowerCase() === categoryFilter.toLowerCase();
    
    return matchesSearch && matchesCategory;
  });

  const categories = Array.from(new Set(Object.values(nodeRegistry).map(n => n.category)));

  const handleLoadTemplate = (tpl: typeof templates[number]) => {
    setNodes(JSON.parse(JSON.stringify(tpl.nodes)));
    setEdges(JSON.parse(JSON.stringify(tpl.edges)));
  };

  return (
    <div className="w-64 bg-[#0B0D14]/80 backdrop-blur-xl border-r border-white/5 flex flex-col h-full shrink-0 shadow-[4px_0_15px_-3px_rgba(0,0,0,0.2)] select-none">
      {/* Search Header for quick lookup */}
      <div className="p-2 border-b border-white/5 bg-transparent shrink-0 space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Pesquisar nós ou tags..."
            aria-label="Pesquisar nós ou tags"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-8 pr-2.5 py-2 bg-white/5 border border-white/10 rounded-lg outline-none focus:bg-white/10 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder-gray-500 text-gray-200"
          />
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-white/5 bg-transparent shrink-0 text-center">
        <button 
          onClick={() => setActiveTab('assets')}
          className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-colors ${
            activeTab === 'assets' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          Node Specs
        </button>
        <button 
          onClick={() => setActiveTab('favorites')}
          className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-colors ${
            activeTab === 'favorites' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          Favs
        </button>
        <button 
          onClick={() => setActiveTab('templates')}
          className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-colors ${
            activeTab === 'templates' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          Templates
        </button>
        <button 
          onClick={() => setActiveTab('layers')}
          className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-colors ${
            activeTab === 'layers' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          Layers
        </button>
      </div>

      {/* Content Scroller */}
      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        
        {activeTab === 'assets' && (
          <div className="space-y-3">
            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1.5 scrollbar-none shrink-0 border-b border-white/5 mb-2">
              <button 
                onClick={() => setCategoryFilter('all')}
                className={`px-2 py-0.5 rounded text-[9px] font-semibold transition-all shrink-0 uppercase tracking-wide border ${
                  categoryFilter === 'all' 
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.2)]' 
                    : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2 py-0.5 rounded text-[9px] font-semibold transition-all shrink-0 uppercase tracking-wide border ${
                    categoryFilter === cat 
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.2)]' 
                      : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* List of Spec Nodes */}
            <div className="space-y-1.5">
              {filteredRegistry.map((item) => {
                const isItemFav = favorites.includes(item.type);
                return (
                  <div
                    key={item.type}
                    role="button"
                    tabIndex={0}
                    aria-label={`Adicionar nó ${item.label} ao canvas`}
                    onClick={() => addNodeFromRegistry(item.type)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        addNodeFromRegistry(item.type);
                      }
                    }}
                    className="p-2.5 bg-white/5 border border-white/10 hover:border-indigo-500/50 rounded-xl cursor-pointer flex items-start gap-2.5 transition-all group hover:bg-white/10 hover:shadow-[0_0_15px_rgba(99,102,241,0.1)] focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/50 focus-visible:border-indigo-500/50"
                  >
                    <div className="p-1.5 rounded-lg bg-black/20 group-hover:bg-indigo-500/20 text-gray-400 group-hover:text-indigo-400 transition-colors border border-white/5 group-hover:border-indigo-500/30">
                      {getIconForType(item.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-200 group-hover:text-indigo-300 truncate pr-1 transition-colors">
                          {item.label}
                        </span>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(item.type);
                          }}
                          className={`text-xs hover:scale-110 transition-transform ${isItemFav ? 'text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]' : 'text-gray-600 hover:text-gray-400'}`}
                        >
                          ★
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-0.5 font-semibold uppercase tracking-wider">
                        v{item.version} • {item.category}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </div>
                );
              })}
              {filteredRegistry.length === 0 && (
                <div className="text-center py-8 text-xs text-gray-500 italic">
                  Nenhum nó registrado corresponde à busca.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'favorites' && (
          <div className="space-y-2">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-1">Seus Nós Favoritados</h3>
            <div className="space-y-1.5">
              {favorites.map((favType) => {
                const item = nodeRegistry[favType];
                if (!item) return null;
                return (
                  <div
                    key={favType}
                    role="button"
                    tabIndex={0}
                    aria-label={`Adicionar nó favorito ${item.label} ao canvas`}
                    onClick={() => addNodeFromRegistry(favType)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        addNodeFromRegistry(favType);
                      }
                    }}
                    className="p-2 bg-amber-500/10 border border-amber-500/20 hover:border-amber-400/50 rounded-lg flex items-center justify-between cursor-pointer group transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/60"
                  >
                    <div className="flex items-center gap-2">
                      {getIconForType(favType)}
                      <span className="text-xs font-semibold text-amber-100 group-hover:text-amber-300 truncate max-w-[140px] transition-colors">
                        {item.label}
                      </span>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(favType);
                      }}
                      className="text-xs text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]"
                    >
                      ★
                    </button>
                  </div>
                );
              })}
              {favorites.length === 0 && (
                <div className="text-center py-8 text-xs text-gray-500 italic">
                  Estrela um nó no menu de especificações para adicioná-lo aqui.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="space-y-2">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-1">Workflows de Sucesso</h3>
            <div className="space-y-1.5">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleLoadTemplate(tpl)}
                  aria-label={`Carregar workflow de exemplo ${tpl.name}`}
                  className="w-full text-left p-2.5 bg-white/5 border border-white/10 hover:border-indigo-500/50 rounded-lg cursor-pointer transition-all hover:bg-white/10 hover:shadow-[0_0_15px_rgba(99,102,241,0.1)] group focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/50"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-200 group-hover:text-indigo-300 truncate transition-colors">
                      {tpl.name}
                    </span>
                    <FolderOpen className="w-3.5 h-3.5 text-gray-500 group-hover:text-indigo-400 transition-colors" />
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono mt-1 font-semibold uppercase">
                    {tpl.nodes.length} Nodes • {tpl.edges.length} Edges
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'layers' && (
          <div className="space-y-1">
            <div 
              className="flex items-center gap-1 px-1 py-1.5 cursor-pointer hover:bg-white/5 rounded text-gray-300 transition-colors"
              onClick={() => setExpandedLayers(!expandedLayers)}
            >
              {expandedLayers ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span className="text-xs font-bold text-gray-200">Main Flow Active Canvas</span>
            </div>
            
            {expandedLayers && (
              <div className="pl-4 space-y-0.5">
                {nodes.map(node => {
                  const state = nodeLifecycles[node.id] || 'Ready';
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => setSelectedNodeId(node.id)}
                      aria-label={`Selecionar nó ${node.data.label} e abrir no inspetor`}
                      className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-indigo-500/10 cursor-pointer group transition-colors text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/50"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {getIconForType(node.type || '')}
                        <span className="text-xs font-medium text-gray-400 group-hover:text-indigo-300 truncate transition-colors">
                          {node.data.label}
                        </span>
                      </div>
                      <span className="text-[8px] font-mono font-semibold text-gray-500 group-hover:text-indigo-400 uppercase shrink-0 transition-colors">
                        {state}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
