import { useSessionStore } from '../../store/useSessionStore';
import React, { useState, useEffect, useRef, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Home, Users, BookOpen, BarChart3, Mic, CreditCard, Code, Building2, Settings, Sun, Moon, Laptop, Command, X } from 'lucide-react';
import { useTheme } from './ThemeContext';
import { getAccessibleTextOnBrand, getAccessibleBrandForeground, colors } from './tokens';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  category: 'Navegação' | 'Ações rápidas' | 'Temas' | 'Agentes';
  action: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [savedAgents, setSavedAgents] = useState<{ name: string }[]>([]);
  const paletteId = useId();
  const listboxId = `${paletteId}-listbox`;

  // `--brand-color` is tenant-controlled (Organization branding), so `bg-brand text-white` on the
  // selected-item chip and `text-brand` on light tint backgrounds can fail WCAG contrast for a
  // light tenant color the same way it can for Button/Badge (see tokens.ts).
  const brandColor = useSessionStore((state) => state.brandColor);
  const accessibleBrandText = getAccessibleTextOnBrand(brandColor);
  const brandTextOnLight = getAccessibleBrandForeground(brandColor, colors.light.surface);
  const brandTextOnDark = getAccessibleBrandForeground(brandColor, colors.dark.surface);

  // Load saved agents for quick navigation
  useEffect(() => {
    if (isOpen) {
      fetch('/api/settings')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.settings && data.settings.savedAgents) {
            setSavedAgents(data.settings.savedAgents);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  // Handle outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen, onClose]);

  // Focus input when opened, and restore focus to whatever triggered the palette when it closes
  // (otherwise closing it silently drops keyboard focus back to <body>).
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      setSelectedIndex(0);
      setQuery('');
      return undefined;
    }
    previousFocusRef.current?.focus();
    previousFocusRef.current = null;
    return undefined;
  }, [isOpen]);


  const items: CommandItem[] = [
    // Navigation
    { id: 'nav-overview', title: 'Visão Geral', subtitle: 'Ir para o painel principal', icon: <Home className="h-4 w-4" />, category: 'Navegação', action: () => { navigate('/dashboard'); onClose(); } },
    { id: 'nav-agents', title: 'Criar Novo Agente', subtitle: 'Ir para o construtor de agentes de voz', icon: <Users className="h-4 w-4" />, category: 'Navegação', action: () => { navigate('/dashboard/agents/new'); onClose(); } },
    { id: 'nav-playground', title: 'Playground do Agente', subtitle: 'Testar chat e voz em tempo real', icon: <BookOpen className="h-4 w-4" />, category: 'Navegação', action: () => { navigate('/dashboard/playground'); onClose(); } },
    { id: 'nav-results', title: 'Resultados & Métricas', subtitle: 'Ver relatórios detalhados', icon: <BarChart3 className="h-4 w-4" />, category: 'Navegação', action: () => { navigate('/dashboard/results'); onClose(); } },
    { id: 'nav-analytics', title: 'Analytics', subtitle: 'Volume de chamadas dos últimos 30 dias', icon: <BarChart3 className="h-4 w-4" />, category: 'Navegação', action: () => { navigate('/dashboard/analytics'); onClose(); } },
    { id: 'nav-telephony', title: 'Telefonia & Números', subtitle: 'Gerenciar números e áudio de espera', icon: <Mic className="h-4 w-4" />, category: 'Navegação', action: () => { navigate('/dashboard/telephony'); onClose(); } },
    { id: 'nav-billing', title: 'Faturamento', subtitle: 'Plano de créditos e faturas', icon: <CreditCard className="h-4 w-4" />, category: 'Navegação', action: () => { navigate('/dashboard/billing'); onClose(); } },
    { id: 'nav-developers', title: 'Developers & Webhooks', subtitle: 'Chaves de API e logs de entrega', icon: <Code className="h-4 w-4" />, category: 'Navegação', action: () => { navigate('/dashboard/developers'); onClose(); } },
    { id: 'nav-organization', title: 'Organização', subtitle: 'Branding, logo, cores e membros', icon: <Building2 className="h-4 w-4" />, category: 'Navegação', action: () => { navigate('/dashboard/organization'); onClose(); } },
    { id: 'nav-preferences', title: 'Preferências do Sistema', subtitle: 'Idiomas, fuso horário e notificações', icon: <Settings className="h-4 w-4" />, category: 'Navegação', action: () => { navigate('/dashboard/preferences'); onClose(); } },
    { id: 'nav-docs', title: 'Documentação do Design System', subtitle: 'Design tokens e componentes UI', icon: <BookOpen className="h-4 w-4" />, category: 'Navegação', action: () => { navigate('/dashboard/docs'); onClose(); } },
    { id: 'nav-admin', title: 'Configurações Globais (Admin)', subtitle: 'Definições do sistema corporativo', icon: <Settings className="h-4 w-4" />, category: 'Navegação', action: () => { navigate('/dashboard/admin'); onClose(); } },
    
    // Quick Actions
    { id: 'action-new-agent', title: 'Novo Agente de Voz', subtitle: 'Abrir criador direto', icon: <Users className="h-4 w-4" />, category: 'Ações rápidas', action: () => { navigate('/dashboard/agents/new'); onClose(); } },
    { id: 'action-test-webhook', title: 'Testar Webhook', subtitle: 'Simular envio de evento de voz', icon: <Code className="h-4 w-4" />, category: 'Ações rápidas', action: () => { navigate('/dashboard/developers'); onClose(); } },
    { id: 'action-reset-onboarding', title: 'Limpar Cache de Onboarding', subtitle: 'Resetar progresso do checklist para testar', icon: <Settings className="h-4 w-4" />, category: 'Ações rápidas', action: () => { fetch('/api/onboarding', { method: 'DELETE' }).finally(() => { window.location.reload(); onClose(); }); } },
    { id: 'action-simulate-error', title: 'Simular Erro de Servidor API', subtitle: 'Dispara um alerta de falha de conexão simulada', icon: <Settings className="h-4 w-4" />, category: 'Ações rápidas', action: () => { alert('Erro 500: Conexão interrompida com o gateway SIP Twilio. Tentando reconectar...'); onClose(); } },
    
    // Themes
    { id: 'theme-brand-atlas', title: 'Cor da Marca: Laranja Atlas', subtitle: 'Definir cor principal para #ff5618', icon: <Settings className="h-4 w-4" />, category: 'Temas', action: () => { useSessionStore.getState().setBrandColor('#ff5618'); onClose(); } },
    { id: 'theme-brand-blue', title: 'Cor da Marca: Azul Royal', subtitle: 'Definir cor principal para #2563eb', icon: <Settings className="h-4 w-4" />, category: 'Temas', action: () => { useSessionStore.getState().setBrandColor('#2563eb'); onClose(); } },
    { id: 'theme-brand-purple', title: 'Cor da Marca: Roxo Imperial', subtitle: 'Definir cor principal para #7c3aed', icon: <Settings className="h-4 w-4" />, category: 'Temas', action: () => { useSessionStore.getState().setBrandColor('#7c3aed'); onClose(); } },
    { id: 'theme-brand-emerald', title: 'Cor da Marca: Verde Esmeralda', subtitle: 'Definir cor principal para #059669', icon: <Settings className="h-4 w-4" />, category: 'Temas', action: () => { useSessionStore.getState().setBrandColor('#059669'); onClose(); } },
    { id: 'theme-brand-rose', title: 'Cor da Marca: Rosa Coral', subtitle: 'Definir cor principal para #f43f5e', icon: <Settings className="h-4 w-4" />, category: 'Temas', action: () => { useSessionStore.getState().setBrandColor('#f43f5e'); onClose(); } },
    { id: 'theme-light', title: 'Tema Claro', subtitle: 'Alterar interface para visual claro', icon: <Sun className="h-4 w-4" />, category: 'Temas', action: () => { setTheme('light'); onClose(); } },
    { id: 'theme-dark', title: 'Tema Escuro', subtitle: 'Alterar interface para visual escuro', icon: <Moon className="h-4 w-4" />, category: 'Temas', action: () => { setTheme('dark'); onClose(); } },
    { id: 'theme-system', title: 'Tema do Sistema', subtitle: 'Sincronizar com as configurações do seu SO', icon: <Laptop className="h-4 w-4" />, category: 'Temas', action: () => { setTheme('system'); onClose(); } },
  ];

  // Add agents to items dynamically
  savedAgents.forEach((agent) => {
    items.push({
      id: `agent-${agent.name}`,
      title: `Carregar: ${agent.name}`,
      subtitle: `Configuração do agente de voz`,
      icon: <Users className="h-4 w-4" />,
      category: 'Agentes',
      action: () => {
        navigate('/dashboard/agents/new');
        // Let component listen via event
        window.dispatchEvent(new CustomEvent('load-saved-agent', { detail: agent.name }));
        onClose();
      }
    });
  });

  const filtered = items.filter(item => 
    item.title.toLowerCase().includes(query.toLowerCase()) || 
    item.subtitle?.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase())
  );

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].action();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab' && containerRef.current) {
        // Keep Tab inside the dialog (input <-> close button) instead of leaking focus to the
        // page behind the backdrop.
        const focusable = containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex, onClose]);

  if (!isOpen) return null;

  // Group items by category for premium visual styling
  const categories: { [key: string]: CommandItem[] } = {};
  filtered.forEach(item => {
    if (!categories[item.category]) {
      categories[item.category] = [];
    }
    categories[item.category].push(item);
  });

  // Flat array of filtered items index tracker
  let flatIndex = 0;
  const activeOptionId = filtered[selectedIndex] ? `${paletteId}-option-${filtered[selectedIndex].id}` : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 backdrop-blur-xs pt-[10vh] px-4 animate-fade-in">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-xl w-full overflow-hidden flex flex-col max-h-[500px]"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <Search aria-hidden="true" className="h-5 w-5 text-slate-400 dark:text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={filtered.length > 0}
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            aria-label="Buscar comando, página ou agente"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full text-sm bg-transparent outline-none border-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 placeholder:dark:text-slate-500"
            placeholder="Digite um comando, página ou nome de agente..."
          />
          <div className="flex items-center gap-1">
            <kbd aria-hidden="true" className="px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded">ESC</kbd>
            <button onClick={onClose} aria-label="Fechar paleta de comandos" className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-600">
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div id={listboxId} role="listbox" aria-label="Resultados" className="flex-1 overflow-y-auto p-2 space-y-4">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500 flex flex-col items-center gap-2">
              <Command aria-hidden="true" className="h-8 w-8 opacity-40 animate-pulse" />
              <span className="text-sm font-semibold">Nenhum resultado encontrado</span>
            </div>
          ) : (
            Object.keys(categories).map(categoryName => (
              <div key={categoryName} role="group" aria-label={categoryName} className="space-y-1">
                <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-3 py-1">
                  {categoryName}
                </h4>
                {categories[categoryName].map(item => {
                  const currentFlatIndex = flatIndex;
                  flatIndex++;
                  const isSelected = currentFlatIndex === selectedIndex;
                  return (
                    <div
                      key={item.id}
                      id={`${paletteId}-option-${item.id}`}
                      role="option"
                      aria-selected={isSelected}
                      onClick={item.action}
                      onMouseEnter={() => setSelectedIndex(currentFlatIndex)}
                      className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-slate-100 dark:bg-slate-700/60 text-slate-900 dark:text-white'
                          : 'text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-700/30'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="p-1.5 rounded-md"
                          style={isSelected ? { backgroundColor: 'var(--brand-color, #ff5618)', color: accessibleBrandText } : undefined}
                        >
                          <span className={isSelected ? '' : 'text-slate-500 dark:text-slate-400'} aria-hidden="true">
                            {item.icon}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{item.title}</p>
                          {item.subtitle && <p className="text-xs text-slate-400 dark:text-slate-500">{item.subtitle}</p>}
                        </div>
                      </div>
                      {isSelected && (
                        <span
                          className="text-[10px] font-mono font-bold bg-brand-50 dark:bg-brand-900/30 px-1.5 py-0.5 rounded text-[var(--enter-fg-light)] dark:text-[var(--enter-fg-dark)]"
                          style={{ '--enter-fg-light': brandTextOnLight, '--enter-fg-dark': brandTextOnDark } as React.CSSProperties}
                        >
                          ENTER
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
        
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-400 dark:text-slate-500 flex items-center justify-between font-mono">
          <span>Use as setas ↑ ↓ para navegar, ENTER para selecionar</span>
          <span className="flex items-center gap-1"><Command className="h-3 w-3" />K</span>
        </div>
      </div>
    </div>
  );
}
