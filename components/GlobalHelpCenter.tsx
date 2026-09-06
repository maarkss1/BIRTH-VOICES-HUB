import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Sparkles, X, Send, ArrowRight,
  Lightbulb, ShieldCheck
} from 'lucide-react';
import { Card, Button, Spinner } from './design-system';
import { getAccessibleTextOnBrand } from './design-system/tokens';
import { useSessionStore } from '../store/useSessionStore';
import { logger } from '../lib/logger';

interface Message {
  id: string;
  sender: 'user' | 'catarina';
  text: string;
}

export function GlobalHelpCenter() {
  const location = useLocation();
  // `--brand-color` is tenant-controlled, so a hardcoded `text-white` on `bg-brand` (chat bubble,
  // send button) can fail WCAG contrast for a light tenant color — see design-system/tokens.ts.
  const brandColor = useSessionStore((state) => state.brandColor);
  const accessibleBrandText = getAccessibleTextOnBrand(brandColor);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'docs' | 'shortcuts'>('chat');
  
  // Chat state
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', sender: 'catarina', text: 'Olá! Sou a Catarina, sua assistente de IA para prospecção e qualificação por voz. Como posso ajudar você no setup hoje?' }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Context-aware tip generator based on current page route
  const getContextualTip = () => {
    const path = location.pathname;
    if (path.includes('agents')) {
      return {
        title: 'Criando sua Catarina',
        tip: 'Mantenha os prompts da IA curtos e divididos por tópicos (Ex: Saudações, Qualificação de Orçamento). Agentes com prompts curtos respondem com latência menor (<250ms).'
      };
    }
    if (path.includes('telephony')) {
      return {
        title: 'Dica de Telefonia SIP',
        tip: 'Certifique-se de configurar o webhook de status do Twilio para registrar tentativas de chamadas com falha em seus relatórios de resultados.'
      };
    }
    if (path.includes('playground')) {
      return {
        title: 'Otimização de Testes',
        tip: 'Use fones de ouvido durante os testes de voz reativa para evitar eco acústico nas transcrições do Deepgram.'
      };
    }
    if (path.includes('organization')) {
      return {
        title: 'Branding e Cores',
        tip: 'Definir as cores e o logotipo da sua organização personaliza o visual das páginas de atendimento compartilhadas (White-label).'
      };
    }
    if (path.includes('billing')) {
      return {
        title: 'Faturamento Inteligente',
        tip: 'Ative a recarga automática de créditos de IA de voz para que sua assistente Catarina nunca fique offline durante picos de prospecção.'
      };
    }
    return {
      title: 'Visão Geral do Painel',
      tip: 'Utilize o atalho Ctrl+K de qualquer lugar para pesquisar por agentes de voz, documentos de suporte ou alternar o tema do sistema instantaneamente.'
    };
  };

  const currentTip = getContextualTip();

  // Handle send message with REAL server-side Gemini API call
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg: Message = { id: Date.now().toString(), sender: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      // Direct integration with our real server-side Express API route!
      const prompt = `Você é a Catarina, assistente virtual inteligente da plataforma Birth Hub 360.
      Seu foco é ajudar desenvolvedores e gestores comerciais a configurar agentes de voz com inteligência artificial para prospecção de leads.
      Responda de forma curta, prestativa e técnica no idioma Português (Brasil).`;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          currentMessages: [...messages, userMsg].map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            text: m.text
          }))
        })
      });

      if (!response.ok) {
        throw new Error('Falha de comunicação com o servidor.');
      }

      const data = await response.json();
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        sender: 'catarina',
        text: data.text || 'Desculpe, tive um problema para processar essa instrução.'
      }]);
    } catch (error) {
      logger.error('Failed to get response from Catarina help chat', { error });
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        sender: 'catarina',
        text: 'Não consegui me conectar ao servidor do Gemini. Verifique se o servidor Express está rodando com a GEMINI_API_KEY configurada!'
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 select-none">
      {/* Floating Sparkly Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-3 rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-all border border-slate-850 dark:border-slate-100 cursor-pointer"
        style={{ backgroundColor: 'var(--brand-color)', color: accessibleBrandText }}
      >
        <Sparkles className="h-5 w-5 animate-bounce" />
        {isOpen ? (
          <span className="text-xs font-bold pr-2">Fechar Catarina</span>
        ) : (
          <span className="text-xs font-bold pr-2">Ajuda Catarina AI</span>
        )}
      </button>

      {/* Slide up widget container */}
      {isOpen && (
        <Card className="absolute bottom-16 right-0 w-[380px] h-[520px] shadow-3xl border border-slate-200 dark:border-slate-800 flex flex-col p-4 animate-slide-up bg-white dark:bg-slate-850 text-left">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-750 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-brand-50 dark:bg-brand-950/40 text-brand rounded-lg shrink-0">
                <Sparkles className="h-4.5 w-4.5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-950 dark:text-white">Catarina AI Co-Pilot</h3>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Conectada via Gemini 2.5
                </span>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-750 rounded text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-100 dark:border-slate-750 text-center">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-2 text-xs font-bold border-b-2 transition-all ${activeTab === 'chat' ? 'border-brand text-brand' : 'border-transparent text-slate-400'}`}
            >
              Conversar
            </button>
            <button
              onClick={() => setActiveTab('docs')}
              className={`flex-1 py-2 text-xs font-bold border-b-2 transition-all ${activeTab === 'docs' ? 'border-brand text-brand' : 'border-transparent text-slate-400'}`}
            >
              Tutoriais & FAQs
            </button>
            <button
              onClick={() => setActiveTab('shortcuts')}
              className={`flex-1 py-2 text-xs font-bold border-b-2 transition-all ${activeTab === 'shortcuts' ? 'border-brand text-brand' : 'border-transparent text-slate-400'}`}
            >
              Atalhos
            </button>
          </div>

          {/* Chat Panel */}
          {activeTab === 'chat' && (
            <div className="flex-1 flex flex-col min-h-0 pt-3">
              {/* Context-aware contextual AI helper */}
              <div className="p-2.5 bg-brand-50/40 dark:bg-brand-950/10 border border-brand-100/40 dark:border-brand-900/10 rounded-lg text-left mb-3">
                <div className="flex items-center gap-1.5 text-brand font-bold text-[10px] uppercase">
                  <Lightbulb className="h-3.5 w-3.5" />
                  <span>{currentTip.title}</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{currentTip.tip}</p>
              </div>

              {/* Messages container */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 mb-3 pr-1 min-h-0">
                {messages.map(m => (
                  <div key={m.id} className={`flex gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {m.sender === 'catarina' && (
                      <div className="w-6.5 h-6.5 rounded-full bg-brand-100 text-brand flex items-center justify-center text-[10px] font-bold shrink-0">
                        CT
                      </div>
                    )}
                    <div
                      className={`p-2.5 rounded-xl max-w-[80%] text-xs font-medium leading-relaxed ${
                        m.sender === 'user'
                          ? 'bg-brand'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-850 dark:text-slate-150'
                      }`}
                      style={m.sender === 'user' ? { color: accessibleBrandText } : undefined}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
                
                {isTyping && (
                  <div className="flex gap-2.5 justify-start">
                    <div className="w-6.5 h-6.5 rounded-full bg-brand-100 text-brand flex items-center justify-center text-[10px] font-bold shrink-0">
                      CT
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs flex items-center gap-1">
                      <Spinner size="sm" />
                      Catarina está pensando...
                    </div>
                  </div>
                )}
              </div>

              {/* Input Form */}
              <form onSubmit={handleSend} className="flex gap-2 border-t border-slate-100 dark:border-slate-750 pt-2 shrink-0">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Escreva sua dúvida técnica..."
                  aria-label="Escreva sua dúvida técnica"
                  className="flex-1 px-3.5 py-2 border rounded-full text-xs bg-white text-slate-900 border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700"
                />
                <button
                  type="submit"
                  aria-label="Enviar mensagem"
                  className="p-2 rounded-full hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  style={{ backgroundColor: 'var(--brand-color)', color: accessibleBrandText }}
                >
                  <Send aria-hidden="true" className="h-4 w-4" />
                </button>
              </form>
            </div>
          )}

          {/* Docs & FAQs Panel */}
          {activeTab === 'docs' && (
            <div className="flex-1 overflow-y-auto pt-3 space-y-3.5 pr-1 text-left min-h-0">
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">Tópicos Frequentes</h4>
              
              <div className="space-y-2.5 text-xs font-medium text-slate-650 dark:text-slate-300">
                <div className="p-2.5 bg-slate-50 dark:bg-slate-900/35 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="font-bold text-slate-900 dark:text-white">Como simular uma chamada de voz?</p>
                  <p className="mt-1 text-slate-500 leading-relaxed text-[11px]">Navegue até o "Playground", certifique-se de que o webhook esteja sincronizado, clique em "Testar Voz" e use o formulário de diálogo reativo.</p>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-900/35 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="font-bold text-slate-900 dark:text-white">Como habilitar White-label?</p>
                  <p className="mt-1 text-slate-500 leading-relaxed text-[11px]">Em "Organização", insira o subdomínio da sua empresa, as cores da sua marca e faça o upload da logo corporativa.</p>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-900/35 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="font-bold text-slate-900 dark:text-white">Qual a precisão da qualificação de leads?</p>
                  <p className="mt-1 text-slate-500 leading-relaxed text-[11px]">A Catarina realiza qualificação e classificação de prioridade, sempre com revisão humana disponível. Ela segue rigorosamente as diretrizes de compliance definidas pela sua empresa.</p>
                </div>
              </div>

              <Button 
                size="sm" 
                variant="outline" 
                className="w-full mt-2" 
                onClick={() => { window.location.hash = '#/dashboard/docs'; }}
              >
                Abrir Documentação Completa
                <ArrowRight className="h-3.5 w-3.5 ml-2" />
              </Button>
            </div>
          )}

          {/* Shortcuts Panel */}
          {activeTab === 'shortcuts' && (
            <div className="flex-1 overflow-y-auto pt-3 space-y-4 pr-1 text-left min-h-0">
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">Atalhos do Sistema</h4>
              
              <div className="space-y-2 font-mono text-xs text-slate-600 dark:text-slate-300">
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-850 pb-2">
                  <span>Command Palette</span>
                  <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-250 dark:border-slate-700 rounded text-[10px]">Ctrl + K</kbd>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-850 pb-2">
                  <span>Navegar para Home</span>
                  <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-250 dark:border-slate-700 rounded text-[10px]">G + H</kbd>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-850 pb-2">
                  <span>Criar Novo Agente</span>
                  <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-250 dark:border-slate-700 rounded text-[10px]">C + A</kbd>
                </div>
                <div className="flex justify-between items-center pb-2">
                  <span>Fechar Diálogos (Esc)</span>
                  <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-250 dark:border-slate-700 rounded text-[10px]">ESC</kbd>
                </div>
              </div>

              <div className="p-3 bg-indigo-50/50 dark:bg-slate-800 border border-indigo-150 rounded-lg text-xs leading-normal">
                <div className="flex items-center gap-1 text-brand font-bold mb-1">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Acessibilidade</span>
                </div>
                Configure mais preferências de alto contraste e redução de movimentos na aba de configurações.
              </div>
            </div>
          )}

        </Card>
      )}
    </div>
  );
}
