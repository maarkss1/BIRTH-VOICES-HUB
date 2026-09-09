import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck, Sparkles, Database, GitMerge, BarChart3, Radio, Sliders,
  Smartphone, Lock, Globe, ArrowRight, CheckCircle, ChevronDown,
  Activity, Terminal, Code2, Layers, CreditCard, Star,
  HelpCircle, KeyRound, Building2, BadgeDollarSign, MessageSquare,
  ArrowUpRight, Check, Layers2,
  LockKeyhole, Server, UserCheck, Sun, Moon, Mic
} from 'lucide-react';
import { useTheme } from '../components/design-system/ThemeContext';
import { Card, Button, Badge, Progress, useToast, ToastContainer, AtlasLogo } from '../components/design-system';
import { getAccessibleTextOnBrand } from '../components/design-system/tokens';
import { useSessionStore } from '../store/useSessionStore';

export default function LandingPage() {
  const { theme, setTheme } = useTheme();
  const { toasts, showToast } = useToast();
  // `--brand-color` is tenant-controlled (Organization branding) and applied to the DOM by
  // `App.tsx` regardless of auth state, so it is already readable on this pre-login marketing
  // page. A hardcoded `text-white` on `bg-brand` fails WCAG contrast the moment a tenant picks a
  // light brand color — see `getAccessibleTextOnBrand`.
  const brandColor = useSessionStore((state) => state.brandColor);
  const accessibleBrandText = getAccessibleTextOnBrand(brandColor);

  // Navigation and Interactive states
  const [activeFAQ, setActiveFAQ] = useState<number | null>(null);
  const [heroTab, setHeroTab] = useState<'builder' | 'voice' | 'rag' | 'analytics'>('builder');
  const [comparativeHoverRow, setComparativeHoverRow] = useState<number | null>(null);
  const [activeUseCase, setActiveUseCase] = useState<number>(0);
  
  // Real-time voice simulation states
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [voiceVolume, setVoiceVolume] = useState([20, 45, 15, 60, 30, 80, 45, 15, 50, 95, 40, 25, 70, 35, 10]);
  const [waveformActive, setWaveformActive] = useState(false);
  const [simulatedTranscription, setSimulatedTranscription] = useState<string[]>([]);
  const [transcriptionIndex, setTranscriptionIndex] = useState(0);

  // Simulated live counter for trust bar
  const [activeAgentsCount, setActiveAgentsCount] = useState(4820);
  
  // Back to top button visibility
  const [showBackToTop, setShowBackToTop] = useState(false);

  // Interactive Live Chat Simulator within RAG / Hero
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: 'Olá! Sou a Catarina Pro, treinada para prospecção e qualificação de leads. Qual empresa ou oportunidade você gostaria de qualificar hoje?' }
  ]);
  const [isTyping, setIsTyping] = useState(false);

  // Handle active agents incremental animation
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveAgentsCount(prev => prev + ((Date.now() % 3) + 1));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Waveform animation
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (waveformActive) {
      timer = setInterval(() => {
        setVoiceVolume(prev => prev.map((_, i) => {
          const val = Math.floor(Math.abs(Math.sin(Date.now() / 200 + i)) * 85) + 15;
          return val;
        }));
      }, 120);
    }
    return () => clearInterval(timer);
  }, [waveformActive]);

  // Back to top scroll observer
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 600) {
        setShowBackToTop(true);
      } else {
        setShowBackToTop(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Transcription stream simulator for the Voice tab
  const transcriptionPhrases = [
    "[Sistema] Canal SIP conectado em 182ms. Latência atual: 45ms.",
    "[Lead] Boa tarde, vi o anúncio de vocês e queria entender melhor a solução.",
    "[IA Catarina] Entendo. Fico feliz em ajudar. Pode me contar rapidamente sobre sua empresa?",
    "[IA Catarina] Vocês já possuem orçamento previsto para esse tipo de solução este trimestre?",
    "[Lead] Sim, estamos avaliando fornecedores agora e o orçamento já foi aprovado...",
    "[Sistema] Alerta de Lead Quente gerado automaticamente.",
    "[IA Catarina] Perfeito, vou agendar uma conversa com nosso time comercial ainda esta semana.",
    "[Sistema] Transcrição concluída. Sincronizando dados com o CRM via Webhook..."
  ];

  const startVoiceSimulation = () => {
    setVoicePlaying(true);
    setWaveformActive(true);
    setSimulatedTranscription([transcriptionPhrases[0]]);
    setTranscriptionIndex(1);
    showToast("Simulando fluxo de voz reativa de ultra-baixa latência...", "info");
  };

  useEffect(() => {
    if (voicePlaying && transcriptionIndex < transcriptionPhrases.length) {
      const timer = setTimeout(() => {
        setSimulatedTranscription(prev => [...prev, transcriptionPhrases[transcriptionIndex]]);
        setTranscriptionIndex(prev => prev + 1);
      }, 2500);
      return () => clearTimeout(timer);
    } else if (transcriptionIndex >= transcriptionPhrases.length) {
      setVoicePlaying(false);
      setWaveformActive(false);
    }
  }, [voicePlaying, transcriptionIndex]);

  // Interactive FAQ items (20 questions)
  const faqData = [
    {
      q: "O que é o Birth Hub 360?",
      a: "O Birth Hub 360 é a plataforma Enterprise definitiva para a criação, orquestração e monitoramento de Agentes de Inteligência Artificial autônomos. Ele oferece canais de voz integrados, mecanismos de RAG (Busca de Conhecimento Baseada em Vetores), lógica de decisão de fluxos de trabalho comerciais/empresariais, segurança sob conformidade LGPD e integrações completas com CRMs, bancos de dados e sistemas legados."
    },
    {
      q: "A plataforma faz apenas atendimento por voz?",
      a: "Não. A voz é apenas um dos canais disponíveis. O Birth Hub 360 é um ecossistema holístico para Agentes de IA que operam de forma omnichannel (voz por conexões SIP corporativas, chat web white-label, WhatsApp, e-mail e APIs estruturadas). A inteligência central executa lógica RAG estruturada independente do canal."
    },
    {
      q: "Como funciona a latência de voz? Ela é natural?",
      a: "Utilizamos um pipeline integrado de ultra-alta velocidade que combina transcrição instantânea (Deepgram), processamento do LLM (Gemini 2.5) e síntese de áudio adaptativa (ElevenLabs/Vapi). O resultado é uma latência média ponta-a-ponta inferior a 340ms, com respostas fluidas, entonação humana e interrupções inteligentes em tempo real."
    },
    {
      q: "A plataforma está em conformidade com a LGPD?",
      a: "Sim, segurança é o nosso pilar central. A infraestrutura possui criptografia em trânsito (TLS 1.3) e em repouso (AES-256), auditorias de logs permanentes, controle de acesso baseado em funções (RBAC), e acordos de proteção de dados que garantem a segurança das informações pessoais dos seus contatos e leads."
    },
    {
      q: "O que é o RAG (Retrieval-Augmented Generation) integrado?",
      a: "É a nossa central de conhecimento que permite alimentar seus agentes com documentos PDF, manuais de produto, tabelas de preços ou FAQs corporativos. O agente consulta esses documentos em milissegundos antes de responder, garantindo que as informações fornecidas sejam 100% precisas, seguras e livres de alucinações."
    },
    {
      q: "Como o Birth Hub 360 integra com nossos sistemas atuais?",
      a: "Oferecemos uma robusta API de desenvolvedores e suporte a Webhooks bidirecionais. Ao final de cada atendimento, o agente consolida um resumo estruturado da chamada em JSON e envia diretamente para o seu CRM (HubSpot, Salesforce, Pipedrive), ERP ou banco de dados relacional."
    },
    {
      q: "Podemos testar o agente antes de colocar em produção?",
      a: "Sim, fornecemos um Playground avançado em nosso dashboard. Lá você pode testar o agente em tempo real por chat ou chamada de teste SIP gratuita, ajustar a personalidade, testar o conhecimento do RAG e depurar os payloads do webhook em tempo real."
    },
    {
      q: "Existe suporte a multi-inquilinato (multi-tenant) e organizações?",
      a: "Sim. A plataforma foi desenhada para grandes corporações, redes e franquias com múltiplas unidades de negócio. É possível gerenciar múltiplas sub-organizações, configurar marcas white-label com subdomínios, cores e logos individuais, e segmentar faturamentos e limites de uso por departamento."
    },
    {
      q: "Quais modelos de Inteligência Artificial são suportados?",
      a: "Suportamos modelos líderes de mercado através do pipeline otimizado do Birth Hub. Por padrão, nossos agentes rodam utilizando Gemini 2.5 Pro e Gemini 2.5 Flash, que oferecem o melhor equilíbrio entre conhecimento comercial estruturado, velocidade de processamento e custo por token."
    },
    {
      q: "O que é a funcionalidade de detecção de interrupção?",
      a: "É um mecanismo de voz natural avançado. Se o contato começar a falar enquanto o agente de IA estiver emitindo uma resposta, o agente silencia imediatamente de forma humana, escuta a nova instrução e reformula sua fala a partir do novo contexto."
    },
    {
      q: "Como funciona o modelo de faturamento e billing?",
      a: "Oferecemos faturamento baseado em uso (pay-as-you-go) de forma simplificada: créditos consumidos por minutos de chamadas ativas de voz e tokens de contexto. No dashboard 'Billing', você pode monitorar o consumo em tempo real, configurar recargas automáticas e obter faturas unificadas de forma transparente."
    },
    {
      q: "Vocês oferecem consultoria de design para os prompts?",
      a: "Sim. Nossos clientes corporativos do plano Enterprise recebem suporte dedicado de nossos arquitetos de IA para projetar prompts estruturados, diretrizes de qualificação de leads e conectores de webhook complexos, garantindo 100% de sucesso na ativação."
    },
    {
      q: "Qual é o SLA de disponibilidade garantido?",
      a: "Nossa infraestrutura distribuída na nuvem (Cloud Run clusters e SIP Trunks redundantes) oferece um SLA de disponibilidade de 99.98% em nossos servidores e canais de áudio, monitorados continuamente."
    },
    {
      q: "O agente pode realizar ações externas, como agendar reuniões?",
      a: "Sim. Através de integrações de Workflows e APIs, o agente pode coletar as preferências do lead em tempo real, verificar horários livres em sua agenda e disparar uma requisição para realizar o agendamento com o time comercial imediatamente durante a chamada telefônica."
    },
    {
      q: "Existe controle de sentimento integrado?",
      a: "Sim. Nossos modelos de UX Analytics analisam a entonação da voz e o léxico do contato durante a conversa, classificando a ligação em tempo real com scores de sentimento (Positivo, Neutro, Irritado, Crítico) para alertar imediatamente um supervisor humano."
    },
    {
      q: "É possível migrar números de telefone existentes para a plataforma?",
      a: "Perfeitamente. Configuramos conexões SIP Trunking e BYOC (Bring Your Own Carrier) para que você possa rotear suas linhas de telefone atuais diretamente para o motor do Birth Hub 360 sem alterar os números de contato da sua empresa."
    },
    {
      q: "Como o agente lida com situações de escalonamento crítico?",
      a: "Os agentes do Birth Hub são programados com barreiras de segurança rígidas. Se detectado um sinal de urgência extrema (como uma reclamação grave ou risco de perda do cliente), o agente interrompe o fluxo padrão e transfere instantaneamente a chamada para um atendente humano disponível."
    },
    {
      q: "Os agentes de IA podem falar outros idiomas além do português?",
      a: "Sim. Nossos modelos suportam conversas de alta fluidez em Português, Inglês e Espanhol, ajustando sotaques, dialetos regionais e jargões locais dependendo do número de telefone de origem do contato."
    },
    {
      q: "Onde os dados de gravação de chamadas são armazenados?",
      a: "Por padrão, as gravações e logs são salvos em nosso Cloud Storage seguro e criptografado. Contudo, clientes Enterprise podem optar por armazenamento próprio (S3 compatível, Google Cloud Storage ou servidores locais privados) para manter total soberania dos dados."
    },
    {
      q: "Como iniciar o uso do Birth Hub 360 hoje?",
      a: "Basta clicar em 'Acessar Plataforma' para registrar sua conta corporativa. No primeiro acesso, nosso Onboarding Wizard o guiará na criação do seu primeiro agente em menos de 5 minutos, oferecendo créditos de teste gratuitos para as primeiras chamadas."
    }
  ];

  // Simulated Chat Bot execution
  const handleSimulatedChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput;
    setChatMessages(prev => [...prev, { role: 'user', text: userText }]);
    setChatInput('');
    setIsTyping(true);

    setTimeout(() => {
      let botResponse = "Interessante. Compreendo sua dúvida. Nossos agentes consultam as bases corporativas em milissegundos para responder com precisão baseada nas diretrizes comerciais da sua empresa.";

      const textLower = userText.toLowerCase();
      if (textLower.includes('preço') || textLower.includes('orçamento')) {
        botResponse = "Nossos planos se ajustam ao volume de chamadas e leads qualificados por mês. Posso te conectar com um especialista comercial para montar uma proposta sob medida.";
      } else if (textLower.includes('latência') || textLower.includes('tempo')) {
        botResponse = "Nossa latência de áudio é de aproximadamente 320ms, permitindo diálogos dinâmicos que simulam perfeitamente a fala humana natural, sem interrupções desajeitadas.";
      } else if (textLower.includes('seguro') || textLower.includes('lgpd')) {
        botResponse = "Totalmente seguro! Todos os logs e transcrições de áudio passam por rotinas automáticas de anonimização e criptografia em trânsito e em repouso.";
      }

      setChatMessages(prev => [...prev, { role: 'assistant', text: botResponse }]);
      setIsTyping(false);
      showToast("Resposta gerada pela IA Catarina", "success");
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-brand selection:text-white relative">
      
      {/* GLOBAL BACKGROUND ELEMENTS */}
      <div className="absolute top-0 left-0 right-0 h-[800px] bg-radial-gradient from-brand/5 dark:from-brand/10 to-transparent pointer-events-none z-0" />
      <div className="absolute top-[1200px] right-0 w-[500px] h-[500px] bg-brand/5 dark:bg-brand/5 rounded-full blur-[140px] pointer-events-none z-0" />
      
      {/* STICKY HEADER */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-850 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="p-1.5 bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-100 dark:border-slate-800 transition-transform group-hover:scale-105">
              <AtlasLogo className="h-6 w-6" />
            </div>
            <div className="text-left">
              <h1 className="text-base font-extrabold leading-none tracking-tight text-slate-950 dark:text-white">Birth Hub 360</h1>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Enterprise AI Platform</span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center gap-8 text-sm font-semibold text-slate-650 dark:text-slate-350">
            <a href="#beneficios" className="hover:text-slate-950 dark:hover:text-white transition-colors">Benefícios</a>
            <a href="#modulos" className="hover:text-slate-950 dark:hover:text-white transition-colors">Módulos</a>
            <a href="#funcionamento" className="hover:text-slate-950 dark:hover:text-white transition-colors">Como Funciona</a>
            <a href="#comparativo" className="hover:text-slate-950 dark:hover:text-white transition-colors">Diferenciais</a>
            <a href="#seguranca" className="hover:text-slate-950 dark:hover:text-white transition-colors">Segurança</a>
            <a href="#faqs" className="hover:text-slate-950 dark:hover:text-white transition-colors">FAQs</a>
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-4">
            
            {/* Quick theme toggler */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 rounded-lg">
              <button 
                onClick={() => setTheme('light')}
                className={`p-1 rounded transition-colors ${theme === 'light' ? 'bg-white shadow-xs text-brand' : 'text-slate-500 hover:text-slate-300'}`}
                title="Tema Claro"
              >
                <Sun className="h-3.5 w-3.5" />
              </button>
              <button 
                onClick={() => setTheme('dark')}
                className={`p-1 rounded transition-colors ${theme === 'dark' ? 'bg-slate-950 text-white shadow-xs' : 'text-slate-500 hover:text-slate-300'}`}
                title="Tema Escuro"
              >
                <Moon className="h-3.5 w-3.5" />
              </button>
            </div>

            <Link 
              to="/login" 
              className="px-4 py-2.5 bg-slate-950 hover:bg-slate-850 dark:bg-white dark:hover:bg-slate-150 text-white dark:text-slate-950 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              style={{ backgroundColor: 'var(--brand-color)', color: 'white' }}
            >
              Acessar Plataforma
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative pt-12 lg:pt-20 pb-20 border-b border-slate-200 dark:border-slate-850 overflow-hidden text-left z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            
            {/* Hero Left: Copywriting and CTAs */}
            <div className="lg:col-span-5 space-y-6 lg:pr-6">
              
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50/60 dark:bg-brand-950/20 border border-brand-100 dark:border-brand-900/40 text-brand text-xs font-bold animate-pulse">
                <Sparkles className="h-3.5 w-3.5 text-brand" />
                <span>Plataforma Enterprise de Agentes de IA</span>
              </div>

              <h2 className="text-4xl md:text-5xl lg:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-[1.08] font-sans">
                Crie Agentes de IA Autônomos que transformam operações complexas.
              </h2>

              <p className="text-base md:text-lg text-slate-550 dark:text-slate-400 leading-relaxed font-medium">
                A plataforma corporativa completa para criar, orquestrar e monitorar agentes de voz e texto de alta velocidade. Substitua fluxos rígidos por inteligência adaptativa de classe mundial que conversa, consulta bases e executa integrações em tempo real.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Link 
                  to="/login" 
                  className="px-6 py-3.5 text-white rounded-xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer hover:opacity-90 hover:scale-[1.01]"
                  style={{ backgroundColor: 'var(--brand-color)' }}
                >
                  Iniciar Teste Gratuito
                  <ArrowRight className="h-4.5 w-4.5" />
                </Link>
                <Link 
                  to="/login" 
                  className="px-6 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-sm transition-all text-center hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer"
                >
                  Agendar Demonstração
                </Link>
              </div>

              {/* Trust bar statistics */}
              <div className="pt-6 border-t border-slate-200 dark:border-slate-800 space-y-3.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Aprovado por líderes de tecnologia e vendas</p>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-4 text-xs font-extrabold text-slate-400 dark:text-slate-500">
                  <span className="flex items-center gap-1"><Server className="h-4 w-4" /> ATLASGR</span>
                  <span className="flex items-center gap-1"><Layers className="h-4 w-4" /> NEXUS GROUP</span>
                  <span className="flex items-center gap-1"><KeyRound className="h-4 w-4" /> VELOX CORP</span>
                  <span className="flex items-center gap-1"><LockKeyhole className="h-4 w-4" /> ORBIT SALES</span>
                </div>
                <div className="flex items-center gap-2 pt-1 text-xs">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                  <span className="text-slate-500 font-semibold">
                    <strong className="text-slate-900 dark:text-slate-100 font-bold font-mono">{activeAgentsCount}</strong> agentes ativos operando transações neste momento.
                  </span>
                </div>
              </div>

            </div>

            {/* Hero Right: Stunning Interactive Preview Component */}
            <div className="lg:col-span-7 relative">
              <div className="absolute inset-0 bg-brand/5 dark:bg-brand/5 rounded-3xl blur-2xl pointer-events-none" />
              
              {/* Product Preview Card */}
              <Card className="border border-slate-250 dark:border-slate-800 shadow-2xl relative overflow-hidden bg-white dark:bg-slate-900 p-0 rounded-2xl flex flex-col h-[520px]">
                
                {/* Mockup Header tab options */}
                <div className="bg-slate-100/80 dark:bg-slate-950/80 p-3.5 border-b border-slate-200 dark:border-slate-850 flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-400 block" />
                    <span className="w-3 h-3 rounded-full bg-amber-400 block" />
                    <span className="w-3 h-3 rounded-full bg-emerald-400 block" />
                    <span className="text-xs font-bold text-slate-500 font-mono ml-2">Console v3.6.0</span>
                  </div>
                  
                  {/* Selector tabs */}
                  <div className="flex bg-slate-200/60 dark:bg-slate-900 p-1 rounded-lg border border-slate-250 dark:border-slate-800">
                    <button 
                      onClick={() => setHeroTab('builder')}
                      className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${heroTab === 'builder' ? 'bg-white dark:bg-slate-850 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'}`}
                    >
                      Agent Builder
                    </button>
                    <button 
                      onClick={() => setHeroTab('voice')}
                      className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${heroTab === 'voice' ? 'bg-white dark:bg-slate-850 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'}`}
                    >
                      Pipeline de Voz
                    </button>
                    <button 
                      onClick={() => setHeroTab('rag')}
                      className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${heroTab === 'rag' ? 'bg-white dark:bg-slate-850 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'}`}
                    >
                      Knowledge Base
                    </button>
                    <button 
                      onClick={() => setHeroTab('analytics')}
                      className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${heroTab === 'analytics' ? 'bg-white dark:bg-slate-850 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'}`}
                    >
                      Métricas Live
                    </button>
                  </div>
                </div>

                {/* Interactive Body content depending on tab */}
                <div className="flex-1 overflow-y-auto p-6 min-h-0">
                  <AnimatePresence mode="wait">
                    
                    {/* TAB 1: BUILDER */}
                    {heroTab === 'builder' && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-4 text-left"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <Badge variant="primary">Atendente Virtual</Badge>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">Catarina Prospecção de Leads</h3>
                          </div>
                          <div className="flex items-center gap-1.5 text-emerald-500 text-xs font-semibold">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            Agente publicado via SIP Trunk
                          </div>
                        </div>

                        {/* Agent prompt config simulation */}
                        <div className="space-y-3.5 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-850">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">PROMPT DE PERSONALIDADE DA IA</span>
                            <div className="text-[11px] font-mono leading-relaxed text-slate-650 dark:text-slate-350 bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                              <span className="text-brand"># CONTEXTO:</span> Você é a Catarina, especialista virtual em prospecção e qualificação de leads da ATLASGR. Seu foco é identificar sinais de fit comercial (ex: orçamento disponível, autoridade de decisão) de forma consultiva e rápida.<br/>
                              <span className="text-brand"># REGRAS:</span> Colete dados-chave do lead, registre o nível de interesse subjetivo se descrito, nunca prometa condições que não foram aprovadas. Se um lead quente for identificado, encaminhe imediatamente para o time comercial.
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">PIPELINE DE VOZ</span>
                              <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200">
                                ElevenLabs - Catarina PtBR (Voz Premium)
                              </div>
                            </div>
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">MODELO GENERATIVO</span>
                              <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200">
                                Gemini 2.5 Pro (Sales Context)
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-150 dark:border-slate-850 pt-4">
                          <span className="text-xs text-slate-400 font-semibold">Última modificação efetuada por Alexandre (Head de Vendas) há 2 horas</span>
                          <Button size="sm" variant="outline" onClick={() => setHeroTab('voice')}>Ver Pipeline em Ação →</Button>
                        </div>
                      </motion.div>
                    )}

                    {/* TAB 2: VOICE PIPELINE */}
                    {heroTab === 'voice' && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-4 text-left"
                      >
                        <div className="flex justify-between items-center bg-brand-50/50 dark:bg-brand-950/20 p-3.5 rounded-xl border border-brand-100/60 dark:border-brand-900/40">
                          <div>
                            <h4 className="text-xs font-bold text-brand">Simulador de Transcrição e Áudio</h4>
                            <p className="text-[10px] text-slate-500 mt-0.5">Clique no botão para iniciar e monitorar o fluxo de voz reativo.</p>
                          </div>
                          <Button size="sm" variant="primary" onClick={startVoiceSimulation} disabled={voicePlaying}>
                            {voicePlaying ? "Sincronizando..." : "Iniciar Simulação"}
                          </Button>
                        </div>

                        {/* Interactive Waveform container */}
                        <div className="bg-slate-50 dark:bg-slate-950 rounded-xl p-4 border border-slate-200 dark:border-slate-850 flex flex-col justify-center items-center h-28 space-y-3 relative overflow-hidden">
                          <div className="flex items-end gap-1.5 h-12">
                            {voiceVolume.map((vol, i) => (
                              <motion.div 
                                key={i}
                                className="w-1 rounded-full bg-brand"
                                style={{ height: `${vol}%`, backgroundColor: 'var(--brand-color)' }}
                                animate={{ height: waveformActive ? `${vol}%` : '15%' }}
                                transition={{ duration: 0.1 }}
                              />
                            ))}
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold">
                            {voicePlaying ? "Canal SIP Ativo - Latência 45ms" : "Simulador pronto - Clique em iniciar"}
                          </span>
                        </div>

                        {/* Live streaming transcription box */}
                        <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 text-left font-mono text-[10px] leading-relaxed h-32 overflow-y-auto space-y-1.5 scrollbar-thin">
                          {simulatedTranscription.length === 0 ? (
                            <span className="text-slate-500">[Nenhum log de atendimento ativo. Inicie a simulação acima]</span>
                          ) : (
                            simulatedTranscription.map((log, i) => (
                              <div key={i} className="text-slate-300">
                                {log.startsWith('[Lead]') && <span className="text-blue-400 font-bold">{log}</span>}
                                {log.startsWith('[IA Catarina]') && <span className="text-green-400 font-bold">{log}</span>}
                                {log.startsWith('[Sistema]') && <span className="text-amber-400 font-bold">{log}</span>}
                              </div>
                            ))
                          )}
                        </div>
                      </motion.div>
                    )}

                    {/* TAB 3: KNOWLEDGE BASE / LIVE CHAT SIM */}
                    {heroTab === 'rag' && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-4 flex flex-col h-full text-left"
                      >
                        <div className="bg-brand-50/50 dark:bg-brand-950/20 p-3.5 rounded-xl border border-brand-100/60 dark:border-brand-900/40">
                          <h4 className="text-xs font-bold text-brand-800 dark:text-brand-300">Sincronização RAG de Conhecimento Comercial</h4>
                          <p className="text-[10px] text-slate-500 mt-0.5">Insira uma pergunta para simular a pesquisa e resposta comercial inteligente.</p>
                        </div>

                        {/* Interactive chat window */}
                        <div className="flex-1 bg-slate-50 dark:bg-slate-950 rounded-xl p-3 border border-slate-250 dark:border-slate-850 overflow-y-auto space-y-3 h-48 max-h-48 scrollbar-thin">
                          {chatMessages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div
                                className={`p-2.5 rounded-xl max-w-[85%] text-[11px] leading-relaxed font-semibold ${msg.role === 'user' ? 'bg-brand' : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800'}`}
                                style={msg.role === 'user' ? { color: accessibleBrandText } : undefined}
                              >
                                {msg.text}
                              </div>
                            </div>
                          ))}
                          {isTyping && (
                            <div className="flex justify-start">
                              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 text-slate-400 text-[10px] flex items-center gap-1.5 border border-slate-200 dark:border-slate-800 font-bold">
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" />
                                Pesquisando em 42 diretrizes comerciais...
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Chat input box */}
                        <form onSubmit={handleSimulatedChatSubmit} className="flex gap-2">
                          <input 
                            type="text" 
                            placeholder="Ex: Qual o prazo de implantação? ou Como funciona o preço?"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            className="flex-1 px-3.5 py-2 border rounded-xl text-xs bg-white text-slate-900 border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand dark:bg-slate-950 dark:text-slate-100 dark:border-slate-800"
                          />
                          <Button size="sm" variant="primary" type="submit">Perguntar</Button>
                        </form>
                      </motion.div>
                    )}

                    {/* TAB 4: METRICS */}
                    {heroTab === 'analytics' && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-4 text-left"
                      >
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-850">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Tempo de Atendimento</span>
                            <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5 font-mono">03:42</p>
                            <span className="text-[9px] text-green-500 font-bold mt-1 block">-12s vs média</span>
                          </div>
                          <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-850">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">SLA de Latência</span>
                            <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5 font-mono">312ms</p>
                            <span className="text-[9px] text-green-500 font-bold mt-1 block">Excelente</span>
                          </div>
                          <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-850">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Adoção do RAG</span>
                            <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5 font-mono">98.4%</p>
                            <span className="text-[9px] text-green-500 font-bold mt-1 block">+1.2% este mês</span>
                          </div>
                          <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-850">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Pesquisa CSAT</span>
                            <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5 font-mono">96.8%</p>
                            <span className="text-[9px] text-emerald-500 font-bold mt-1 block">948 votos hoje</span>
                          </div>
                        </div>

                        {/* Graphical representation */}
                        <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-850 space-y-3">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-slate-700 dark:text-slate-200">Volumetria de Chamadas Comerciais</span>
                            <span className="font-mono text-slate-400">Tempo real — atualizado há 5s</span>
                          </div>
                          
                          <div className="w-full h-24 text-brand">
                            <svg viewBox="0 0 400 100" className="w-full h-full">
                              <defs>
                                <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
                                  <stop offset="0%" stopColor="var(--brand-color)" stopOpacity="0.3" />
                                  <stop offset="100%" stopColor="var(--brand-color)" stopOpacity="0.0" />
                                </linearGradient>
                              </defs>
                              <path 
                                d="M0,80 Q40,30 80,60 T160,20 T240,70 T320,30 T400,10" 
                                fill="none" 
                                stroke="var(--brand-color)" 
                                strokeWidth="3" 
                                strokeLinecap="round"
                              />
                              <path 
                                d="M0,80 Q40,30 80,60 T160,20 T240,70 T320,30 T400,10 L400,100 L0,100 Z" 
                                fill="url(#grad)" 
                              />
                            </svg>
                          </div>
                        </div>
                      </motion.div>
                    )}

                  </AnimatePresence>
                </div>

                {/* Footer simulation indicators */}
                <div className="bg-slate-50 dark:bg-slate-950 p-3.5 border-t border-slate-200 dark:border-slate-850 flex items-center justify-between text-xs shrink-0">
                  <div className="flex items-center gap-1.5 font-bold text-slate-400">
                    <Terminal className="h-4 w-4" />
                    <span>Real-time Audio Streams</span>
                  </div>
                  <div className="flex items-center gap-1 font-mono text-emerald-500 font-bold">
                    <Activity className="h-3.5 w-3.5 animate-bounce" />
                    <span>99.98% uptime SLA</span>
                  </div>
                </div>

              </Card>

            </div>

          </div>
        </div>
      </section>

      {/* SEÇÃO 2: BENTO GRID BENEFÍCIOS */}
      <section id="beneficios" className="py-20 bg-white dark:bg-slate-900 border-b border-slate-250 dark:border-slate-850 relative text-left">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="max-w-3xl mb-16 space-y-3">
            <Badge variant="primary">Benefícios de Nova Geração</Badge>
            <h3 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-none font-sans">
              Engenharia de precisão para operações críticas.
            </h3>
            <p className="text-base text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
              Cada milissegundo de latência reduzido, cada regra comercial respeitada. Projetado com tecnologia que supera as barreiras do atendimento legado.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Benefício 1 */}
            <Card className="p-6 space-y-4 hoverable group">
              <div className="p-3 bg-brand-50 dark:bg-brand-950/40 text-brand rounded-xl w-fit group-hover:scale-105 transition-transform">
                <Mic className="h-5 w-5" />
              </div>
              <h4 className="text-lg font-bold text-slate-900 dark:text-white">Voz Humana Adaptativa</h4>
              <p className="text-xs text-slate-550 dark:text-slate-400 leading-relaxed font-medium">
                Síntese de áudio premium com entonação regional em português brasileiro, pausas e respirações realistas. Esqueça vozes robóticas desajeitadas.
              </p>
            </Card>

            {/* Benefício 2 */}
            <Card className="p-6 space-y-4 hoverable group">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl w-fit group-hover:scale-105 transition-transform">
                <Database className="h-5 w-5" />
              </div>
              <h4 className="text-lg font-bold text-slate-900 dark:text-white">Memória Inteligente e Contexto</h4>
              <p className="text-xs text-slate-550 dark:text-slate-400 leading-relaxed font-medium">
                O agente se lembra de contatos anteriores do lead, suas preferências declaradas e histórico de interações, garantindo diálogos contínuos e inteligentes.
              </p>
            </Card>

            {/* Benefício 3 */}
            <Card className="p-6 space-y-4 hoverable group">
              <div className="p-3 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-xl w-fit group-hover:scale-105 transition-transform">
                <Layers2 className="h-5 w-5" />
              </div>
              <h4 className="text-lg font-bold text-slate-900 dark:text-white">Vector RAG em Tempo Real</h4>
              <p className="text-xs text-slate-550 dark:text-slate-400 leading-relaxed font-medium">
                Alimente o agente com PDFs, manuais e tabelas de faturamento. Ele realiza buscas semânticas instantâneas para fornecer respostas embasadas.
              </p>
            </Card>

            {/* Benefício 4 */}
            <Card className="p-6 space-y-4 hoverable group">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl w-fit group-hover:scale-105 transition-transform">
                <GitMerge className="h-5 w-5" />
              </div>
              <h4 className="text-lg font-bold text-slate-900 dark:text-white">Conectores e Workflows de API</h4>
              <p className="text-xs text-slate-550 dark:text-slate-400 leading-relaxed font-medium">
                Integre sistemas legados. O agente pode disparar requisições, agendar reuniões na agenda comercial, atualizar dados de CRM e enviar alertas via webhooks.
              </p>
            </Card>

            {/* Benefício 5 */}
            <Card className="p-6 space-y-4 hoverable group">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl w-fit group-hover:scale-105 transition-transform">
                <BarChart3 className="h-5 w-5" />
              </div>
              <h4 className="text-lg font-bold text-slate-900 dark:text-white">Analytics e Análise de Sentimento</h4>
              <p className="text-xs text-slate-550 dark:text-slate-400 leading-relaxed font-medium">
                Monitore o tom de voz do interlocutor, o cumprimento de metas de SLA, satisfação de atendimento e relatórios analíticos de funil de conversão.
              </p>
            </Card>

            {/* Benefício 6 */}
            <Card className="p-6 space-y-4 hoverable group">
              <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-xl w-fit group-hover:scale-105 transition-transform">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h4 className="text-lg font-bold text-slate-900 dark:text-white">Segurança Rígida e Conformidade LGPD</h4>
              <p className="text-xs text-slate-550 dark:text-slate-400 leading-relaxed font-medium">
                Soberania total de dados. Auditorias de segurança completas, mascaramento automático de dados sensíveis e conformidade certificada.
              </p>
            </Card>

          </div>

        </div>
      </section>

      {/* SEÇÃO 3: PLATAFORMA COMPLETA - MÓDULOS DE PRODUTO */}
      <section id="modulos" className="py-20 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-850 relative text-left">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="max-w-3xl mb-16 space-y-3">
            <Badge variant="info">Módulos do Sistema</Badge>
            <h3 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-none font-sans">
              O Ecossistema Enterprise Completo.
            </h3>
            <p className="text-base text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
              Tudo o que sua equipe precisa para modelar, operar e escalar inteligências integradas em um único painel de controle corporativo.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Módulo 1 */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-850 hover:border-brand/40 dark:hover:border-brand/40 transition-all group text-left">
              <Sliders className="h-6 w-6 text-brand mb-4 group-hover:scale-110 transition-transform" />
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">Agent Builder</h4>
              <p className="text-[11px] text-slate-450 dark:text-slate-450 mt-1.5 leading-relaxed">
                Editor visual para gerenciar o prompt da Catarina, ajustar os critérios de qualificação de leads e definir regras comportamentais.
              </p>
            </div>

            {/* Módulo 2 */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-850 hover:border-brand/40 dark:hover:border-brand/40 transition-all group text-left">
              <Radio className="h-6 w-6 text-brand mb-4 group-hover:scale-110 transition-transform" />
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">Voice AI Engine</h4>
              <p className="text-[11px] text-slate-450 dark:text-slate-450 mt-1.5 leading-relaxed">
                Pipeline proprietário de baixa latência integrando transcrição, processamento lógico e fala adaptada de alto realismo.
              </p>
            </div>

            {/* Módulo 3 */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-850 hover:border-brand/40 dark:hover:border-brand/40 transition-all group text-left">
              <Database className="h-6 w-6 text-brand mb-4 group-hover:scale-110 transition-transform" />
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">Knowledge Hub</h4>
              <p className="text-[11px] text-slate-450 dark:text-slate-450 mt-1.5 leading-relaxed">
                Motor de RAG semântico para alimentar a inteligência com tabelas de preços, catálogos e materiais comerciais, evitando alucinações.
              </p>
            </div>

            {/* Módulo 4 */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-850 hover:border-brand/40 dark:hover:border-brand/40 transition-all group text-left">
              <GitMerge className="h-6 w-6 text-brand mb-4 group-hover:scale-110 transition-transform" />
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">Workflow Builder</h4>
              <p className="text-[11px] text-slate-450 dark:text-slate-450 mt-1.5 leading-relaxed">
                Orquestre ações complexas: verificação de agendamentos, atualizações automáticas e disparo de webhooks de alerta.
              </p>
            </div>

            {/* Módulo 5 */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-850 hover:border-brand/40 dark:hover:border-brand/40 transition-all group text-left">
              <BarChart3 className="h-6 w-6 text-brand mb-4 group-hover:scale-110 transition-transform" />
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">Deep Analytics</h4>
              <p className="text-[11px] text-slate-450 dark:text-slate-450 mt-1.5 leading-relaxed">
                Métricas em tempo real de latência, CSAT, chamadas simultâneas, sentimentos do lead e logs de voz detalhados.
              </p>
            </div>

            {/* Módulo 6 */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-850 hover:border-brand/40 dark:hover:border-brand/40 transition-all group text-left">
              <Globe className="h-6 w-6 text-brand mb-4 group-hover:scale-110 transition-transform" />
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">White-Label Portal</h4>
              <p className="text-[11px] text-slate-450 dark:text-slate-450 mt-1.5 leading-relaxed">
                Personalize subdomínios, logotipos e paletas de cores corporativas das páginas de acompanhamento e controle.
              </p>
            </div>

            {/* Módulo 7 */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-850 hover:border-brand/40 dark:hover:border-brand/40 transition-all group text-left">
              <Smartphone className="h-6 w-6 text-brand mb-4 group-hover:scale-110 transition-transform" />
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">SIP Telephony Gateway</h4>
              <p className="text-[11px] text-slate-450 dark:text-slate-450 mt-1.5 leading-relaxed">
                Roteamento SIP corporativo redundante e integração com o Twilio Trunk para receber chamadas de qualquer telefone.
              </p>
            </div>

            {/* Módulo 8 */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-850 hover:border-brand/40 dark:hover:border-brand/40 transition-all group text-left">
              <Code2 className="h-6 w-6 text-brand mb-4 group-hover:scale-110 transition-transform" />
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">Developer API</h4>
              <p className="text-[11px] text-slate-450 dark:text-slate-450 mt-1.5 leading-relaxed">
                APIs robustas e webhooks em formato padronizado para sincronização transparente com sistemas legados de CRM e ERP.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* SEÇÃO 4: TIMELINE COMO FUNCIONA */}
      <section id="funcionamento" className="py-20 bg-white dark:bg-slate-900 border-b border-slate-250 dark:border-slate-850 text-left relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="max-w-3xl mb-16 space-y-3">
            <Badge variant="primary">Como Funciona</Badge>
            <h3 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-none font-sans">
              Da criação ao deploy em produção.
            </h3>
            <p className="text-base text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
              Um pipeline simplificado e poderoso para colocar seus agentes de voz inteligentes em operação corporativa ativa em minutos.
            </p>
          </div>

          <div className="relative border-l-2 border-slate-200 dark:border-slate-800 ml-4 space-y-12">
            
            {/* Passo 1 */}
            <div className="relative pl-8">
              <div className="absolute -left-2.5 top-1 h-5 w-5 rounded-full bg-brand flex items-center justify-center border-4 border-white dark:border-slate-900" style={{ backgroundColor: 'var(--brand-color)' }} />
              <div>
                <span className="text-[10px] font-bold text-brand uppercase">Passo 01</span>
                <h4 className="font-bold text-slate-900 dark:text-white text-base mt-0.5">Criar Agente de Voz</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                  Selecione o modelo gerativo base (ex: Gemini 2.5 Pro) e dê um nome ao seu assistente corporativo dentro da plataforma.
                </p>
              </div>
            </div>

            {/* Passo 2 */}
            <div className="relative pl-8">
              <div className="absolute -left-2.5 top-1 h-5 w-5 rounded-full bg-brand flex items-center justify-center border-4 border-white dark:border-slate-900" style={{ backgroundColor: 'var(--brand-color)' }} />
              <div>
                <span className="text-[10px] font-bold text-brand uppercase">Passo 02</span>
                <h4 className="font-bold text-slate-900 dark:text-white text-base mt-0.5">Definir Personalidade e Instruções</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                  Personalize o tom de voz da Catarina, forneça regras claras de qualificação de leads e barreiras éticas para garantir a excelência.
                </p>
              </div>
            </div>

            {/* Passo 3 */}
            <div className="relative pl-8">
              <div className="absolute -left-2.5 top-1 h-5 w-5 rounded-full bg-brand flex items-center justify-center border-4 border-white dark:border-slate-900" style={{ backgroundColor: 'var(--brand-color)' }} />
              <div>
                <span className="text-[10px] font-bold text-brand uppercase">Passo 03</span>
                <h4 className="font-bold text-slate-900 dark:text-white text-base mt-0.5">Importar Base de Conhecimento (RAG)</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                  Faça o upload de tabelas de preços, manuais de produto ou políticas internas da empresa para alimentar o motor semântico da IA.
                </p>
              </div>
            </div>

            {/* Passo 4 */}
            <div className="relative pl-8">
              <div className="absolute -left-2.5 top-1 h-5 w-5 rounded-full bg-brand flex items-center justify-center border-4 border-white dark:border-slate-900" style={{ backgroundColor: 'var(--brand-color)' }} />
              <div>
                <span className="text-[10px] font-bold text-brand uppercase">Passo 04</span>
                <h4 className="font-bold text-slate-900 dark:text-white text-base mt-0.5">Conectar Sistemas Externos</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                  Configure conectores de webhook e chaves de API para automatizar fluxos de agendamentos ou atualizações do CRM de faturamento.
                </p>
              </div>
            </div>

            {/* Passo 5 */}
            <div className="relative pl-8">
              <div className="absolute -left-2.5 top-1 h-5 w-5 rounded-full bg-brand flex items-center justify-center border-4 border-white dark:border-slate-900" style={{ backgroundColor: 'var(--brand-color)' }} />
              <div>
                <span className="text-[10px] font-bold text-brand uppercase">Passo 05</span>
                <h4 className="font-bold text-slate-900 dark:text-white text-base mt-0.5">Executar Teste Interativo</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                  Use o playground de áudio reativo para conversar com o agente de teste, checando a velocidade de resposta e payloads de resposta.
                </p>
              </div>
            </div>

            {/* Passo 6 */}
            <div className="relative pl-8">
              <div className="absolute -left-2.5 top-1 h-5 w-5 rounded-full bg-brand flex items-center justify-center border-4 border-white dark:border-slate-900" style={{ backgroundColor: 'var(--brand-color)' }} />
              <div>
                <span className="text-[10px] font-bold text-brand uppercase">Passo 06</span>
                <h4 className="font-bold text-slate-900 dark:text-white text-base mt-0.5">Publicar Número Telefônico SIP</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                  Vincule um número de atendimento por SIP Trunking ou integre com o Twilio para ativar o canal telefônico oficial em produção.
                </p>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* SEÇÃO 5: CASOS DE USO COM ABAS */}
      <section className="py-20 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-850 text-left relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="max-w-3xl mb-16 space-y-3">
            <Badge variant="info">Casos de Uso Multi-Indústria</Badge>
            <h3 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-none font-sans">
              Especialização precisa para cada necessidade.
            </h3>
            <p className="text-base text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
              Agentes customizados para operar verticais operacionais críticas com inteligência técnica e alta precisão de resultados.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Col: Menu */}
            <div className="lg:col-span-4 space-y-2">
              {[
                { title: "SDR e Qualificação de Leads", desc: "Qualificação ágil de contatos por voz natural e preenchimento de CRM.", icon: <UserCheck className="h-4.5 w-4.5" /> },
                { title: "Recepção e Concierge Corporativo", desc: "Classificação de solicitações, coleta de dados e encaminhamento ao setor certo.", icon: <Building2 className="h-4.5 w-4.5" /> },
                { title: "Suporte e Atendimento ao Cliente", desc: "Resolução de dúvidas frequentes consultando manuais semânticos (RAG).", icon: <MessageSquare className="h-4.5 w-4.5" /> },
                { title: "Cobrança e Faturamento", desc: "Negociação de pendências de boletos, faturas e links de transação.", icon: <CreditCard className="h-4.5 w-4.5" /> },
                { title: "Pesquisas de Satisfação e NPS", desc: "Entrevistas qualitativas por voz e classificação analítica de sentimentos.", icon: <BarChart3 className="h-4.5 w-4.5" /> }
              ].map((useCase, i) => (
                <button
                  key={i}
                  onClick={() => setActiveUseCase(i)}
                  className={`w-full p-4 rounded-xl border text-left transition-all flex items-start gap-3.5 cursor-pointer ${
                    activeUseCase === i 
                      ? 'bg-white dark:bg-slate-900 border-brand shadow-md text-slate-900 dark:text-white font-bold' 
                      : 'bg-transparent border-transparent text-slate-500 hover:bg-white/40 dark:hover:bg-slate-900/40'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg ${activeUseCase === i ? 'bg-brand' : 'bg-slate-200/60 dark:bg-slate-800 text-slate-555'}`}
                    style={activeUseCase === i ? { color: accessibleBrandText } : undefined}
                  >
                    {useCase.icon}
                  </div>
                  <div className="text-xs">
                    <p className="font-bold">{useCase.title}</p>
                    <p className="text-[10px] text-slate-450 mt-1 leading-normal font-medium">{useCase.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Right Col: Interactive Mockup Display */}
            <div className="lg:col-span-8">
              <Card className="p-8 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl space-y-6">
                
                {activeUseCase === 0 && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex items-center gap-2">
                      <Badge variant="primary">SDR Inteligente</Badge>
                      <span className="text-xs text-slate-450 font-bold">Contato instantâneo de lead em 5 segundos</span>
                    </div>
                    <h4 className="text-xl font-extrabold text-slate-950 dark:text-white">Qualificação Imediata de Leads Comerciais</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                      O agente de voz liga imediatamente para contatos que preencheram o formulário do site da sua empresa. Ele conduz um diálogo natural para entender a necessidade do cliente, qualifica o lead com base nas suas metas comerciais e agenda a reunião diretamente com o executivo de vendas.
                    </p>
                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-850 space-y-3 text-xs">
                      <p className="font-bold text-slate-400 text-[10px] uppercase">Resultados Sincronizados com HubSpot:</p>
                      <div className="grid grid-cols-2 gap-4 text-[11px] font-semibold">
                        <div className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded">
                          <p className="text-slate-400 text-[9px] uppercase">Status de Qualificação</p>
                          <p className="text-emerald-500 mt-0.5">MQL (Marketing Qualified)</p>
                        </div>
                        <div className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded">
                          <p className="text-slate-400 text-[9px] uppercase">Reunião Agendada</p>
                          <p className="text-slate-800 dark:text-slate-200 mt-0.5">Segunda-feira às 14:00 (Google Meet)</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeUseCase === 1 && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex items-center gap-2">
                      <Badge variant="success">Concierge Corporativo</Badge>
                      <span className="text-xs text-slate-450 font-bold">Redução de tempo de fila em 48%</span>
                    </div>
                    <h4 className="text-xl font-extrabold text-slate-950 dark:text-white">Recepção e Encaminhamento de Solicitações</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                      O agente atende contatos que ligam para a central da empresa com dúvidas ou solicitações. Ele identifica a necessidade, cruza os relatos com a base de conhecimento (RAG) e envia um alerta direto com a prioridade e o setor responsável no painel de controle em menos de 10 segundos.
                    </p>
                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-850 space-y-3 text-xs">
                      <p className="font-bold text-slate-400 text-[10px] uppercase">Payload Estruturado Enviado ao Sistema:</p>
                      <pre className="font-mono text-[10px] text-slate-650 dark:text-slate-350 bg-white dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-800 overflow-x-auto leading-relaxed">
{`{
  "atendimento_id": "call_rc_9482",
  "contato": "Juliana Pinheiro",
  "setor_destino": "Financeiro",
  "prioridade": "ALTA",
  "motivo": ["Segunda via de fatura", "Alteração cadastral"],
  "rag_match": "Base de Conhecimento - Cap. 4 (Faturamento)",
  "webhook_disparado": true
}`}
                      </pre>
                    </div>
                  </div>
                )}

                {activeUseCase === 2 && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex items-center gap-2">
                      <Badge variant="info">Suporte 24/7</Badge>
                      <span className="text-xs text-slate-450 font-bold">Resolução de 84% de primeiro contato</span>
                    </div>
                    <h4 className="text-xl font-extrabold text-slate-950 dark:text-white">Atendimento Omnichannel de Clientes</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                      Responda dúvidas complexas de faturamento, agendamentos, especificações de produto ou condições contratuais instantaneamente. Alimentado pelo Knowledge Hub, o agente resolve as solicitações de forma precisa, sem que o cliente precise esperar na linha.
                    </p>
                    <div className="p-3 bg-indigo-50/50 dark:bg-slate-950 border border-indigo-100 rounded-xl text-xs flex items-start gap-2.5">
                      <HelpCircle className="h-4.5 w-4.5 text-brand mt-0.5" />
                      <p className="text-slate-650 dark:text-slate-400 leading-normal">
                        <strong>Automação Completa:</strong> Reduza drasticamente os custos operacionais do seu SAC ao mesmo tempo que mantém avaliações de CSAT acima de 95% de aprovação.
                      </p>
                    </div>
                  </div>
                )}

                {activeUseCase === 3 && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex items-center gap-2">
                      <Badge variant="danger">Cobrança Amigável</Badge>
                      <span className="text-xs text-slate-450 font-bold">Recuperação de 32% em boletos em atraso</span>
                    </div>
                    <h4 className="text-xl font-extrabold text-slate-950 dark:text-white">Negociação e Recuperação de Crédito</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                      Atendimento humanizado para negociar boletos ou mensalidades em atraso. O agente oferece alternativas de parcelamento de forma empática e amigável, emite as faturas em tempo real durante o diálogo e envia os links via WhatsApp do cliente automaticamente.
                    </p>
                    <div className="p-3.5 bg-red-50/40 dark:bg-slate-950 border border-red-100 rounded-lg text-xs flex items-center gap-2.5 text-red-600 dark:text-red-400 font-bold">
                      <CreditCard className="h-5 w-5" />
                      <span>Integração nativa com Gateways de pagamento (Stripe, Asaas, PIX).</span>
                    </div>
                  </div>
                )}

                {activeUseCase === 4 && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex items-center gap-2">
                      <Badge variant="primary">Analytics NPS</Badge>
                      <span className="text-xs text-slate-450 font-bold">100% de ligações analisadas</span>
                    </div>
                    <h4 className="text-xl font-extrabold text-slate-950 dark:text-white">Pesquisas Qualitativas Automatizadas</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                      Ligue para clientes logo após a conclusão de uma compra ou atendimento para entender a experiência. O agente capta os tons de voz, as notas qualitativas, transcreve e classifica o feedback nos mínimos detalhes para subsidiar relatórios de melhorias de processos.
                    </p>
                  </div>
                )}

              </Card>
            </div>

          </div>

        </div>
      </section>

      {/* SEÇÃO 6: TABELA COMPARATIVA DE DIFERENCIAIS */}
      <section id="comparativo" className="py-20 bg-white dark:bg-slate-900 border-b border-slate-250 dark:border-slate-850 text-left relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="max-w-3xl mb-16 space-y-3">
            <Badge variant="primary">Matriz de Diferenciais</Badge>
            <h3 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-none font-sans">
              Projetado para superar limites.
            </h3>
            <p className="text-base text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
              Veja por que grandes corporações preferem a estabilidade, a segurança e a precisão comercial do Birth Hub 360 contra soluções legadas e estrangeiras.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-4.5 px-4">Recurso Corporativo</th>
                  <th className="py-4.5 px-4 text-brand" style={{ color: 'var(--brand-color)' }}>Birth Hub 360</th>
                  <th className="py-4.5 px-4">Plataformas Legadas</th>
                  <th className="py-4.5 px-4">Soluções Open Source</th>
                </tr>
              </thead>
              <tbody className="text-xs font-semibold text-slate-700 dark:text-slate-350">
                {[
                  { name: "Latência Total de Voz", birth: "Média <320ms (Ultra-Velocidade)", legacy: "De 1.5s a 3.0s (Inviável)", opensource: "Irregular (Depende de servidores)" },
                  { name: "Motor RAG com Busca Semântica", birth: "Sim (Vector DB Integrado)", legacy: "Não suportado nativamente", opensource: "Requer implementação complexa" },
                  { name: "SLA de Disponibilidade SIP", birth: "99.98% Garantido em Contrato", legacy: "99.0% sem redundância", opensource: "Sem garantias de uptime" },
                  { name: "Conformidade LGPD e SOC 2", birth: "Criptografia e Termos Dedicados", legacy: "Apenas conformidades básicas US", opensource: "Totalmente sob responsabilidade do dev" },
                  { name: "Orquestrador de Webhooks", birth: "Sim, reativo e depurável", legacy: "Conexões rígidas proprietárias", opensource: "Código customizado manual" },
                  { name: "Painel de Configuração White-Label", birth: "Completo (Domínios e Cores)", legacy: "Apenas logo da plataforma", opensource: "Inexistente" },
                  { name: "Suporte Técnico Dedicado 24/7", birth: "Sim, Gerente de Conta Dedicado", legacy: "Apenas tickets de suporte em inglês", opensource: "Comunidade Discord/GitHub" },
                  { name: "Análise Qualitativa de Sentimento", birth: "Sim, via inteligência UX integrada", legacy: "Apenas logs de texto básicos", opensource: "Inexistente" }
                ].map((row, idx) => (
                  <tr 
                    key={idx} 
                    className={`border-b border-slate-100 dark:border-slate-850/60 transition-colors ${comparativeHoverRow === idx ? 'bg-slate-50 dark:bg-slate-950/40' : ''}`}
                    onMouseEnter={() => setComparativeHoverRow(idx)}
                    onMouseLeave={() => setComparativeHoverRow(null)}
                  >
                    <td className="py-4 px-4 font-bold text-slate-900 dark:text-white">{row.name}</td>
                    <td className="py-4 px-4 text-brand font-bold flex items-center gap-1.5" style={{ color: 'var(--brand-color)' }}>
                      <CheckCircle className="h-4 w-4 shrink-0" />
                      {row.birth}
                    </td>
                    <td className="py-4 px-4 text-slate-500 font-medium">{row.legacy}</td>
                    <td className="py-4 px-4 text-slate-500 font-medium">{row.opensource}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </section>

      {/* SEÇÃO 7: GRID DE INTEGRAÇÕES */}
      <section className="py-20 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-850 text-left relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            <div className="space-y-4">
              <Badge variant="info">Hub de Integrações</Badge>
              <h3 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-none font-sans">
                Toda a sua infraestrutura conectada.
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                O Birth Hub 360 sincroniza com seus softwares corporativos e canais de comunicação favoritos. Reduza silos de dados e crie processos verdadeiramente eficientes de ponta a ponta.
              </p>
              <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl space-y-2 max-w-lg">
                <p className="font-bold text-xs text-slate-800 dark:text-slate-100">Pronto para Sincronizar em 1 Clique</p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Sem codificação complexa. Nosso sistema guia você na autenticação segura via OAuth e Webhooks para mapear variáveis em minutos.
                </p>
              </div>
            </div>

            {/* Integrations Grid overview */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 relative">
              {[
                { name: "Twilio", desc: "SIP & Telefonia" },
                { name: "Gemini", desc: "IA Generativa" },
                { name: "Deepgram", desc: "STT Ultra-rápido" },
                { name: "HubSpot", desc: "CRM e Vendas" },
                { name: "Salesforce", desc: "Enterprise CRM" },
                { name: "Slack", desc: "Alertas Corporativos" },
                { name: "Stripe", desc: "Billing & Pagamentos" },
                { name: "WhatsApp", desc: "Omnichannel Chat" },
                { name: "Webhooks", desc: "APIs Customizadas" },
                { name: "Pipedrive", desc: "CRM de Vendas" },
                { name: "n8n", desc: "Automação de Workflows" },
                { name: "Google Drive", desc: "Bases do RAG" }
              ].map((item, i) => (
                <div key={i} className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl flex flex-col items-center justify-center text-center transition-all hover:scale-105 hover:border-brand shadow-xs">
                  <span className="font-extrabold text-xs text-slate-900 dark:text-white font-sans">{item.name}</span>
                  <span className="text-[9px] text-slate-450 dark:text-slate-500 mt-1 uppercase font-bold">{item.desc}</span>
                </div>
              ))}
            </div>

          </div>

        </div>
      </section>

      {/* SEÇÃO 8: GOVERNANÇA E SEGURANÇA */}
      <section id="seguranca" className="py-20 bg-white dark:bg-slate-900 border-b border-slate-250 dark:border-slate-850 text-left relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            <div className="relative">
              <div className="absolute inset-0 bg-brand/5 dark:bg-brand/5 rounded-3xl blur-2xl pointer-events-none" />
              <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-8 space-y-6 relative overflow-hidden">
                <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div className="p-2 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-lg">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-950 dark:text-white text-sm">Escudo de Governança e Compliance</h4>
                    <span className="text-[10px] text-emerald-500 font-bold flex items-center gap-1 mt-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Auditoria de conformidade ativa
                    </span>
                  </div>
                </div>

                <div className="space-y-4 font-semibold text-xs text-slate-700 dark:text-slate-350">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle className="h-4.5 w-4.5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-slate-900 dark:text-white text-sm font-bold">Conformidade Rígida com LGPD e SOC 2</p>
                      <p className="text-[11px] text-slate-500 mt-1">Garantimos a privacidade absoluta de dados pessoais dos seus contatos e leads por meio de termos de proteção específicos e controle estrito de dados sensíveis.</p>
                    </div>
                  </div>
                  <hr className="border-slate-100 dark:border-slate-850" />
                  <div className="flex items-start gap-2.5">
                    <CheckCircle className="h-4.5 w-4.5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-slate-900 dark:text-white text-sm font-bold">Anonimização de Logs de Voz</p>
                      <p className="text-[11px] text-slate-500 mt-1">Os dados sensíveis (como números de CPF ou dados financeiros) relatados nas chamadas de voz são mascarados automaticamente antes de serem gravados nos bancos de dados.</p>
                    </div>
                  </div>
                  <hr className="border-slate-100 dark:border-slate-850" />
                  <div className="flex items-start gap-2.5">
                    <CheckCircle className="h-4.5 w-4.5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-slate-900 dark:text-white text-sm font-bold">RBAC e Controle de Organizações</p>
                      <p className="text-[11px] text-slate-500 mt-1">Defina papéis específicos de acesso (Administrador, Supervisor, Desenvolvedor) para garantir soberania e controle operacional total dos dados.</p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            <div className="space-y-6 lg:pl-6">
              <Badge variant="primary">Segurança de Classe Mundial</Badge>
              <h3 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-none font-sans">
                Governança, conformidade e auditoria de logs.
              </h3>
              <p className="text-base text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                Sua operação comercial e corporativa protegida com criptografia ponta-a-ponta. Oferecemos controle absoluto para auditorias internas e governos.
              </p>
              <div className="grid grid-cols-2 gap-4 text-xs font-bold font-mono text-slate-600 dark:text-slate-400">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-850">
                  <Lock className="h-4.5 w-4.5 text-brand mb-2" />
                  <p className="text-slate-900 dark:text-white">AES-256 & TLS 1.3</p>
                  <p className="text-[10px] text-slate-400 mt-1">Criptografia no trânsito e em repouso</p>
                </div>
                <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-850">
                  <ShieldCheck className="h-4.5 w-4.5 text-brand mb-2" />
                  <p className="text-slate-900 dark:text-white">Auditorias SOC 2</p>
                  <p className="text-[10px] text-slate-400 mt-1">Históricos de modificação permanentes</p>
                </div>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* SEÇÃO 9: ANALYTICS INTERATIVO */}
      <section className="py-20 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-850 text-left relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            <div className="lg:col-span-5 space-y-4">
              <Badge variant="info">UX Analytics Avançado</Badge>
              <h3 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-none font-sans">
                Decisões guiadas por dados qualitativos.
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                Monitore funis de atendimento em tempo real, identifique em qual frase do script ocorre gargalo na interação do lead e classifique as notas qualitativas do CSAT em gráficos interativos.
              </p>
              <div className="pt-4 flex flex-col gap-2 font-semibold text-xs text-slate-650 dark:text-slate-300">
                <div className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> Detecção analítica de interrupções de áudio</div>
                <div className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> Heatmaps de zones de fricção do script de IA</div>
                <div className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> Exportação de dados estruturados em JSON e CSV</div>
              </div>
            </div>

            {/* Interactive charts overview */}
            <div className="lg:col-span-7">
              <Card className="p-6 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl space-y-6">
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                  <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">Fricções do Funil de Ativação (Últimos 30 dias)</h4>
                  <Badge variant="primary">94.6% CSAT</Badge>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      <span>1. Chamada Atendida (SIP Handshake)</span>
                      <span>100% de conexões</span>
                    </div>
                    <Progress value={100} />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      <span>2. Identificação de Demandas Críticas</span>
                      <span>92.4% de engajamento</span>
                    </div>
                    <Progress value={92.4} />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      <span>3. Busca na Base de Conhecimento (RAG)</span>
                      <span>88.2% de precisão</span>
                    </div>
                    <Progress value={88.2} />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      <span>4. Integração com CRM & Conclusão de Chamada</span>
                      <span>82.6% concluídas de ponta a ponta</span>
                    </div>
                    <Progress value={82.6} />
                  </div>
                </div>
              </Card>
            </div>

          </div>

        </div>
      </section>

      {/* SEÇÃO 10: DEPOIMENTOS DE CLIENTES */}
      <section className="py-20 bg-white dark:bg-slate-900 border-b border-slate-250 dark:border-slate-850 text-left relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="max-w-3xl mb-16 space-y-3">
            <Badge variant="primary">Depoimentos Corporativos</Badge>
            <h3 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-none font-sans">
              O que dizem os líderes de inovação.
            </h3>
            <p className="text-base text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
              Resultados reais obtidos por times comerciais e gestores que escalaram sua prospecção com o Birth Hub 360.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            
            {/* Depoimento 1 */}
            <Card className="p-6 space-y-6 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex text-amber-500 gap-1">
                  <Star className="h-4 w-4 fill-amber-500" />
                  <Star className="h-4 w-4 fill-amber-500" />
                  <Star className="h-4 w-4 fill-amber-500" />
                  <Star className="h-4 w-4 fill-amber-500" />
                  <Star className="h-4 w-4 fill-amber-500" />
                </div>
                <p className="text-xs text-slate-650 dark:text-slate-350 italic leading-relaxed font-medium">
                  "A integração do Birth Hub com o nosso CRM foi impecável. A IA Catarina qualifica leads com alta precisão e eliminou as filas telefônicas do time comercial. Conseguimos priorizar os leads mais quentes com uma velocidade incrível."
                </p>
              </div>
              <div className="flex items-center gap-3 pt-4 border-t border-slate-100 dark:border-slate-850">
                <div className="w-10 h-10 rounded-full bg-brand-100 text-brand font-bold text-xs flex items-center justify-center">
                  ML
                </div>
                <div className="text-xs">
                  <p className="font-bold text-slate-900 dark:text-white">Mariana Lima</p>
                  <p className="text-[10px] text-slate-450 uppercase font-bold">Diretora Comercial — ATLASGR</p>
                </div>
              </div>
            </Card>

            {/* Depoimento 2 */}
            <Card className="p-6 space-y-6 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex text-amber-500 gap-1">
                  <Star className="h-4 w-4 fill-amber-500" />
                  <Star className="h-4 w-4 fill-amber-500" />
                  <Star className="h-4 w-4 fill-amber-500" />
                  <Star className="h-4 w-4 fill-amber-500" />
                  <Star className="h-4 w-4 fill-amber-500" />
                </div>
                <p className="text-xs text-slate-650 dark:text-slate-350 italic leading-relaxed font-medium">
                  "Reduzimos em 42% o tempo médio de primeiro contato com novos leads. Nossos vendedores humanos agora se concentram apenas nas negociações mais avançadas. O pipeline de áudio tem latência excelente."
                </p>
              </div>
              <div className="flex items-center gap-3 pt-4 border-t border-slate-100 dark:border-slate-850">
                <div className="w-10 h-10 rounded-full bg-brand-100 text-brand font-bold text-xs flex items-center justify-center">
                  RC
                </div>
                <div className="text-xs">
                  <p className="font-bold text-slate-900 dark:text-white">Ricardo Costa</p>
                  <p className="text-[10px] text-slate-450 uppercase font-bold">Gerente de Tecnologia — Nexus Group</p>
                </div>
              </div>
            </Card>

            {/* Depoimento 3 */}
            <Card className="p-6 space-y-6 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex text-amber-500 gap-1">
                  <Star className="h-4 w-4 fill-amber-500" />
                  <Star className="h-4 w-4 fill-amber-500" />
                  <Star className="h-4 w-4 fill-amber-500" />
                  <Star className="h-4 w-4 fill-amber-500" />
                  <Star className="h-4 w-4 fill-amber-500" />
                </div>
                <p className="text-xs text-slate-650 dark:text-slate-350 italic leading-relaxed font-medium">
                  "O RAG integrado salvou nossa operação de suporte. Carregamos mais de 400 PDFs de diretrizes e a IA Catarina responde tudo sem errar ou alucinar. É espetacular."
                </p>
              </div>
              <div className="flex items-center gap-3 pt-4 border-t border-slate-100 dark:border-slate-850">
                <div className="w-10 h-10 rounded-full bg-brand-100 text-brand font-bold text-xs flex items-center justify-center">
                  AS
                </div>
                <div className="text-xs">
                  <p className="font-bold text-slate-900 dark:text-white">Alexandre Silveira</p>
                  <p className="text-[10px] text-slate-450 uppercase font-bold">Diretor de UX — Velox Corp</p>
                </div>
              </div>
            </Card>

          </div>

        </div>
      </section>

      {/* SEÇÃO 11: FAQS ACCORDION (20+ ITENS) */}
      <section id="faqs" className="py-20 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-850 text-left relative">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center mb-16 space-y-3">
            <Badge variant="primary">FAQs do Sistema</Badge>
            <h3 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-none font-sans">
              Perguntas Frequentes
            </h3>
            <p className="text-base text-slate-500 dark:text-slate-400 leading-relaxed font-semibold max-w-2xl mx-auto">
              Tudo o que você precisa saber sobre a segurança, escalabilidade, latência e o funcionamento prático do Birth Hub 360.
            </p>
          </div>

          <div className="space-y-3.5">
            {faqData.map((faq, index) => (
              <div 
                key={index}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl overflow-hidden transition-all shadow-xs"
              >
                <button
                  onClick={() => setActiveFAQ(activeFAQ === index ? null : index)}
                  className="w-full p-4.5 text-left font-bold text-sm text-slate-900 dark:text-white flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850/60"
                >
                  <span>{faq.q}</span>
                  <ChevronDown className={`h-4.5 w-4.5 text-slate-400 transition-transform duration-200 shrink-0 ${activeFAQ === index ? 'rotate-180' : ''}`} />
                </button>
                
                <AnimatePresence>
                  {activeFAQ === index && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-slate-100 dark:border-slate-850 text-xs text-slate-550 dark:text-slate-400 font-medium leading-relaxed"
                    >
                      <p className="p-4.5 bg-slate-50/50 dark:bg-slate-950/20">{faq.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* SEÇÃO 12: CTA FINAL COM GARANTIAS */}
      <section className="py-20 bg-white dark:bg-slate-900 border-b border-slate-250 dark:border-slate-850 relative text-center">
        <div className="absolute inset-0 bg-brand/5 dark:bg-brand/5 blur-3xl pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          
          <Card className="p-10 md:p-14 bg-slate-950 text-white border-slate-850 rounded-3xl space-y-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-brand/10 rounded-full blur-[100px] pointer-events-none" />
            
            <div className="space-y-4 max-w-3xl mx-auto">
              <Badge variant="primary" className="mx-auto">Aceleração Operacional</Badge>
              <h3 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-[1.1] font-sans">
                Pronto para escalar sua operação com Agentes de IA?
              </h3>
              <p className="text-sm md:text-base text-slate-400 leading-relaxed max-w-2xl mx-auto font-medium">
                Crie sua conta corporativa em minutos. Teste gratuitamente com créditos de demonstração, sem fidelidade ou necessidade de cartão de crédito nas primeiras ligações.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-4 pt-2">
              <Link
                to="/login"
                className="px-8 py-4 bg-brand hover:opacity-90 rounded-xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                style={{ backgroundColor: 'var(--brand-color)', color: accessibleBrandText }}
              >
                Criar Conta Corporativa
                <ArrowRight className="h-4.5 w-4.5" />
              </Link>
              <Link 
                to="/login" 
                className="px-8 py-4 bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-200 rounded-xl font-bold text-sm transition-all text-center cursor-pointer"
              >
                Falar com Consultor
              </Link>
            </div>

            <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-3.5 pt-6 border-t border-slate-900 text-xs font-bold text-slate-500">
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-4.5 w-4.5 text-brand" /> SLA de 99.98% de Uptime</span>
              <span className="flex items-center gap-1.5"><LockKeyhole className="h-4.5 w-4.5 text-brand" /> Criptografia de nível bancário</span>
              <span className="flex items-center gap-1.5"><BadgeDollarSign className="h-4.5 w-4.5 text-brand" /> Sem taxa de adesão obrigatória</span>
            </div>

          </Card>

        </div>
      </section>

      {/* COMPLEX FOOTER */}
      <footer className="bg-slate-950 text-white py-16 border-t border-slate-900 relative text-left">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-5 gap-8">
          
          {/* Logo & Info column */}
          <div className="col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-white rounded-lg">
                <AtlasLogo className="h-6 w-6" />
              </div>
              <div className="text-left">
                <h1 className="text-base font-extrabold leading-none tracking-tight text-white">Birth Hub 360</h1>
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest block mt-0.5">Enterprise AI Platform</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-sm font-medium">
              A solução completa para orquestração de Agentes de Inteligência Artificial. Entregamos voz natural, conformidade rígida e conexões SIP redundantes para operações de alto volume.
            </p>
            <div className="flex items-center gap-3.5 text-slate-500 pt-2 text-xs font-semibold">
              <a href="#" className="hover:text-white">Twitter/X</a>
              <a href="#" className="hover:text-white">GitHub</a>
              <a href="#" className="hover:text-white">LinkedIn</a>
            </div>
          </div>

          {/* Col 2: Produto */}
          <div className="space-y-3.5">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Produto</h4>
            <ul className="space-y-2.5 text-xs text-slate-500 font-semibold">
              <li><a href="#beneficios" className="hover:text-white transition-colors">Benefícios</a></li>
              <li><a href="#modulos" className="hover:text-white transition-colors">Módulos do Painel</a></li>
              <li><a href="#funcionamento" className="hover:text-white transition-colors">Como Funciona</a></li>
              <li><a href="#comparativo" className="hover:text-white transition-colors">Matriz de Diferenciais</a></li>
              <li><Link to="/login" className="hover:text-white transition-colors">Playground Reativo</Link></li>
            </ul>
          </div>

          {/* Col 3: Segurança & API */}
          <div className="space-y-3.5">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Segurança & API</h4>
            <ul className="space-y-2.5 text-xs text-slate-500 font-semibold">
              <li><a href="#seguranca" className="hover:text-white transition-colors">Conformidade SOC 2</a></li>
              <li><a href="#seguranca" className="hover:text-white transition-colors">Privacidade LGPD</a></li>
              <li><Link to="/login" className="hover:text-white transition-colors">Chaves de API</Link></li>
              <li><Link to="/login" className="hover:text-white transition-colors">Webhooks Logs</Link></li>
              <li><Link to="/login" className="hover:text-white transition-colors">SDKs de Conexão</Link></li>
            </ul>
          </div>

          {/* Col 4: Status & Legal */}
          <div className="space-y-3.5">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status & Legal</h4>
            <ul className="space-y-2.5 text-xs text-slate-500 font-semibold">
              <li className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-slate-400">Todos os sistemas normais</span>
              </li>
              <li><a href="#" className="hover:text-white transition-colors">Termos de Serviço</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Políticas de Privacidade</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Configuração SOC 2</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Changelog v3.6</a></li>
            </ul>
          </div>

        </div>

        {/* Bottom copyright banner */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 mt-12 border-t border-slate-900 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-semibold text-slate-500">
          <p>© 2026 Birth Hub 360 Enterprise. Todos os direitos reservados. Projetado para vendas de alta performance.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-white">Termos</a>
            <a href="#" className="hover:text-white">Privacidade</a>
            <a href="#" className="hover:text-white">Cookies</a>
          </div>
        </div>
      </footer>

      {/* FLOATING BACK TO TOP BUTTON */}
      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-24 right-6 p-3 rounded-full bg-slate-900 text-white shadow-2xl border border-slate-800 cursor-pointer z-40 hover:scale-105 active:scale-95 transition-all text-xs font-bold"
            title="Voltar ao Topo"
          >
            ↑ Topo
          </motion.button>
        )}
      </AnimatePresence>

      <ToastContainer toasts={toasts} />
    </div>
  );
}
