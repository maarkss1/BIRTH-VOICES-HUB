import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Save, Upload, Shield, Video, Loader2, AlertTriangle, Lock } from 'lucide-react';
import { useSessionStore } from '../../store/useSessionStore';
import { logger } from '../../lib/logger';
import { Badge, Button, EmptyState, Skeleton, Table, TableHead, TableRow, TableCell } from '../../components/design-system';

interface TenantUser {
  id: string;
  email: string;
  role: string;
}

interface AuditLogEntry {
  id: string;
  userId: string;
  actorEmail: string | null;
  action: string;
  details: unknown;
  timestamp: string;
}

interface AuditLogPage {
  items: AuditLogEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

type AuditLogState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: AuditLogPage };

const AUDIT_LOG_PAGE_SIZE = 20;

export default function OrganizationPage() {
  const [activeTab, setActiveTab] = useState('branding');
  const brandColor = useSessionStore((state) => state.brandColor);
  const setBrandColor = useSessionStore((state) => state.setBrandColor);
  const sessionUser = useSessionStore((state) => state.user);
  const [branding, setBranding] = useState({ color: brandColor, name: '' });
  const [orgNameStatus, setOrgNameStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // Video Generation States
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [videoPrompt, setVideoPrompt] = useState('Um agente amigável sorrindo em um escritório moderno, com iluminação suave.');
  const [selectedImage, setSelectedImage] = useState<{base64: string, type: string, previewUrl: string} | null>(null);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoOperation, setVideoOperation] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Team tab: GET /api/users is admin-only server-side — only fetched/shown when the real
  // session role is admin, matching what the backend would authorize anyway.
  const isAdmin = sessionUser?.role === 'admin';
  const [members, setMembers] = useState<TenantUser[] | null>(null);
  const [membersError, setMembersError] = useState(false);

  useEffect(() => {
    // Real organization name from GET /api/organizations (tenant-scoped), replacing what used
    // to be a client-only fallback ("My Company") that never reflected the actual tenant.
    let cancelled = false;
    setOrgNameStatus('loading');
    fetch('/api/organizations')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const name = Array.isArray(data.organizations) && data.organizations[0]?.name;
        setBranding((prev) => ({ ...prev, name: name || '' }));
        setOrgNameStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        logger.error('Failed to load organization name', { err });
        setOrgNameStatus('error');
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setBranding((prev) => ({ ...prev, color: brandColor }));
  }, [brandColor]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/users')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setMembers(Array.isArray(data.users) ? data.users : []))
      .catch((err) => {
        logger.error('Failed to load tenant members', { err });
        setMembersError(true);
      });
  }, [isAdmin]);

  // Audit Log tab: GET /api/audit-log is admin-only server-side (403 otherwise), same gate as
  // GET /api/users above. Real data from the backend (see
  // .agents/handoffs/onda-4/01-para-02-audit-log-frontend.md) — replaces the honest "not
  // available yet" EmptyState this tab used to show.
  const [auditPage, setAuditPage] = useState(1);
  const [auditState, setAuditState] = useState<AuditLogState>({ status: 'loading' });

  const fetchAuditLog = useCallback((page: number, onCancelled?: () => boolean) => {
    setAuditState({ status: 'loading' });
    fetch(`/api/audit-log?page=${page}&pageSize=${AUDIT_LOG_PAGE_SIZE}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: AuditLogPage) => {
        if (onCancelled?.()) return;
        setAuditState({ status: 'ready', data });
      })
      .catch((err) => {
        if (onCancelled?.()) return;
        logger.error('Failed to load audit log', { err });
        setAuditState({ status: 'error' });
      });
  }, []);

  useEffect(() => {
    if (activeTab !== 'audit' || !isAdmin) return;
    let cancelled = false;
    fetchAuditLog(auditPage, () => cancelled);
    return () => { cancelled = true; };
  }, [activeTab, isAdmin, auditPage, fetchAuditLog]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (videoOperation && !videoUrl && !videoError) {
      interval = setInterval(async () => {
        try {
          const res = await fetch('/api/video-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operationName: videoOperation })
          });
          const data = await res.json();
          if (data.error) {
            setVideoError(data.error.message || 'Erro na geração');
            setVideoOperation(null);
          } else if (data.done) {
            setVideoUrl(`/api/video-download?operationName=${encodeURIComponent(videoOperation)}`);
            setIsGeneratingVideo(false);
            setVideoOperation(null);
          }
        } catch (e: unknown) {
          logger.error('Error polling video generation status', { e });
        }
      }, 5000); // poll every 5s
    }
    return () => clearInterval(interval);
  }, [videoOperation, videoUrl, videoError]);

  const handleSave = () => {
    setBrandColor(branding.color);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      // result is "data:image/png;base64,..."
      const base64 = result.split(',')[1];
      setSelectedImage({
        base64,
        type: file.type,
        previewUrl: result
      });
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateVideo = async () => {
    if (!selectedImage) return;
    setIsGeneratingVideo(true);
    setVideoError(null);
    setVideoUrl(null);
    
    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: videoPrompt,
          imageBytes: selectedImage.base64,
          mimeType: selectedImage.type
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro na chamada de API');
      
      setVideoOperation(data.operationName);
    } catch (err: unknown) {
      setVideoError(err instanceof Error ? err.message : String(err));
      setIsGeneratingVideo(false);
    }
  };

  return (
    <div className="space-y-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-6 font-sans">Configurações da Organização</h1>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex border-b border-slate-200 overflow-x-auto">
                <button onClick={() => setActiveTab('branding')} className={`px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'branding' ? 'border-b-2 border-brand text-brand' : 'text-slate-500 hover:bg-slate-50'}`}>Marca & White-label</button>
                <button onClick={() => setActiveTab('video')} className={`px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'video' ? 'border-b-2 border-brand text-brand' : 'text-slate-500 hover:bg-slate-50'}`}>Vídeo de Boas Vindas</button>
                <button onClick={() => setActiveTab('team')} className={`px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'team' ? 'border-b-2 border-brand text-brand' : 'text-slate-500 hover:bg-slate-50'}`}>Equipe & Permissões</button>
                <button onClick={() => setActiveTab('audit')} className={`px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'audit' ? 'border-b-2 border-brand text-brand' : 'text-slate-500 hover:bg-slate-50'}`}>Audit Log</button>
            </div>

            <div className="p-6">
                {activeTab === 'branding' && (
                    <div className="max-w-xl space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Nome da Organização</label>
                            {orgNameStatus === 'loading' ? (
                                <div className="h-[42px]"><Skeleton className="h-full w-full" /></div>
                            ) : (
                                // Read-only: there is no backend write path for the organization
                                // name yet (GET /api/organizations exists, no PUT/PATCH). An
                                // editable field here used to silently discard the edit on save.
                                <input type="text" value={branding.name} readOnly disabled className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-500 cursor-not-allowed" />
                            )}
                            {orgNameStatus === 'error' && (
                                <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Não foi possível carregar o nome real da organização.</p>
                            )}
                            {orgNameStatus === 'ready' && (
                                <p className="text-xs text-slate-400 mt-1.5">Edição de nome ainda não disponível nesta versão.</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Cor da Marca</label>
                            <div className="flex gap-4 items-center">
                                <input type="color" value={branding.color} onChange={e => setBranding({...branding, color: e.target.value})} className="h-10 w-20 p-1 rounded border border-slate-300 cursor-pointer" />
                                <span className="font-mono text-slate-500 text-sm bg-slate-100 px-2 py-1 rounded">{branding.color}</span>
                            </div>
                            <p className="text-xs text-slate-400 mt-2">Escolha uma cor principal da marca. Isso atualizará o tema da plataforma em tempo real.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Logo</label>
                            <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:bg-slate-50 transition-colors cursor-pointer">
                                <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                                <p className="text-sm text-slate-500">Clique para fazer upload (PNG, SVG)</p>
                            </div>
                        </div>
                        <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg hover:opacity-90 font-medium transition-opacity">
                            <Save className="h-4 w-4" /> Salvar Alterações
                        </button>
                    </div>
                )}

                {activeTab === 'video' && (
                    <div className="flex flex-col md:flex-row gap-8">
                        <div className="flex-1 space-y-6">
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg mb-2">Vídeo Avatar da Marca</h3>
                                <p className="text-sm text-slate-600 mb-6">Gere um vídeo de boas vindas para ser exibido no chat web usando o modelo Veo. Envie uma foto base e descreva a ação.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">1. Upload de Imagem Base</label>
                                <input 
                                    type="file" 
                                    accept="image/png, image/jpeg" 
                                    className="hidden" 
                                    ref={fileInputRef}
                                    onChange={handleImageUpload}
                                />
                                <div 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:bg-slate-50 transition-colors cursor-pointer"
                                >
                                    {selectedImage ? (
                                        <div className="relative">
                                            <img src={selectedImage.previewUrl} alt="Preview" className="max-h-48 mx-auto rounded" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity rounded">
                                                <span className="text-white text-sm font-bold">Trocar Imagem</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                                            <p className="text-sm text-slate-500">Clique para fazer upload (PNG, JPG)</p>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">2. Prompt do Vídeo</label>
                                <textarea 
                                    value={videoPrompt}
                                    onChange={e => setVideoPrompt(e.target.value)}
                                    className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand outline-none resize-none h-24"
                                />
                            </div>

                            {videoError && (
                                <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">
                                    {videoError}
                                </div>
                            )}

                            <button 
                                onClick={handleGenerateVideo}
                                disabled={isGeneratingVideo || !selectedImage || !videoPrompt.trim()}
                                className="flex items-center justify-center gap-2 px-4 py-2 w-full bg-brand text-white rounded-lg hover:opacity-90 font-medium transition-opacity disabled:opacity-50"
                            >
                                {isGeneratingVideo ? (
                                    <><Loader2 className="h-4 w-4 animate-spin" /> Gerando Vídeo (pode demorar alguns minutos)...</>
                                ) : (
                                    <><Video className="h-4 w-4" /> Gerar Avatar</>
                                )}
                            </button>
                        </div>

                        <div className="flex-1 border-t md:border-t-0 md:border-l border-slate-200 pt-8 md:pt-0 md:pl-8 flex flex-col">
                            <label className="block text-sm font-medium text-slate-700 mb-4">Resultado</label>
                            
                            {videoUrl ? (
                                <div className="space-y-4">
                                    <video src={videoUrl} controls className="w-full rounded-lg border border-slate-200" autoPlay loop />
                                    <a 
                                        href={videoUrl}
                                        download="avatar.mp4"
                                        className="w-full block text-center py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
                                    >
                                        Baixar MP4
                                    </a>
                                </div>
                            ) : (
                                <div className="flex-1 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center bg-slate-50 text-slate-400">
                                    {isGeneratingVideo ? (
                                        <div className="flex flex-col items-center gap-3">
                                            <Loader2 className="h-8 w-8 animate-spin text-brand" />
                                            <span className="text-sm">Processando com Veo...</span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-3">
                                            <Video className="h-8 w-8 opacity-20" />
                                            <span className="text-sm">Nenhum vídeo gerado</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'team' && (
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-slate-800">Membros do Time</h3>
                        </div>
                        {!isAdmin ? (
                            <EmptyState
                                icon={<Lock className="h-8 w-8" />}
                                title="Acesso restrito"
                                description="A lista de membros exige o papel de administrador nesta organização."
                            />
                        ) : membersError ? (
                            <EmptyState
                                icon={<AlertTriangle className="h-8 w-8" />}
                                title="Não foi possível carregar os membros"
                                description="Tente novamente em alguns instantes."
                            />
                        ) : members === null ? (
                            <div className="space-y-3">
                                <Skeleton className="h-16 w-full" />
                                <Skeleton className="h-16 w-full" />
                            </div>
                        ) : members.length === 0 ? (
                            <EmptyState
                                icon={<Shield className="h-8 w-8" />}
                                title="Nenhum membro encontrado"
                                description="Esta organização ainda não tem usuários cadastrados."
                            />
                        ) : (
                            <div className="space-y-4">
                                {members.map((m) => (
                                    <div key={m.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-brand-50 text-brand rounded-full flex items-center justify-center font-bold">
                                                {m.email[0]?.toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-900">{m.email}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <Badge variant="secondary" className="uppercase">{m.role}</Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'audit' && (
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-slate-800">Trilha de Auditoria</h3>
                        </div>
                        {!isAdmin ? (
                            <EmptyState
                                icon={<Lock className="h-8 w-8" />}
                                title="Acesso restrito"
                                description="A trilha de auditoria exige o papel de administrador nesta organização."
                            />
                        ) : auditState.status === 'loading' ? (
                            <div className="space-y-3">
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                        ) : auditState.status === 'error' ? (
                            <EmptyState
                                icon={<AlertTriangle className="h-8 w-8" />}
                                title="Não foi possível carregar a trilha de auditoria"
                                description="Tente novamente em alguns instantes."
                                action={<Button size="sm" variant="outline" onClick={() => fetchAuditLog(auditPage)}>Tentar novamente</Button>}
                            />
                        ) : auditState.data.items.length === 0 ? (
                            <EmptyState
                                icon={<Shield className="h-8 w-8" />}
                                title="Nenhum evento de auditoria registrado"
                                description="Assim que uma ação sensível ocorrer nesta organização, ela aparece aqui."
                            />
                        ) : (
                            <div className="space-y-4">
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell isHeader>Ação</TableCell>
                                            <TableCell isHeader>Ator</TableCell>
                                            <TableCell isHeader>Detalhes</TableCell>
                                            <TableCell isHeader>Quando</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <tbody>
                                        {auditState.data.items.map((entry) => {
                                            const hasDetails = entry.details && typeof entry.details === 'object'
                                                ? Object.keys(entry.details as Record<string, unknown>).length > 0
                                                : Boolean(entry.details);
                                            const detailsText = hasDetails ? JSON.stringify(entry.details) : '—';
                                            return (
                                                <TableRow key={entry.id}>
                                                    <TableCell className="font-mono text-xs font-semibold text-slate-800">
                                                        {entry.action}
                                                    </TableCell>
                                                    <TableCell className="text-xs text-slate-600">
                                                        {entry.actorEmail ?? <span className="text-slate-400 italic">removido/anonimizado</span>}
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs text-slate-500 max-w-xs">
                                                        <span className="block truncate" title={detailsText}>{detailsText}</span>
                                                    </TableCell>
                                                    <TableCell className="text-xs text-slate-400 whitespace-nowrap">
                                                        {new Date(entry.timestamp).toLocaleString('pt-BR')}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </tbody>
                                </Table>
                                <div className="flex items-center justify-between pt-2">
                                    <span className="text-xs text-slate-500">
                                        Página {auditState.data.page} de {auditState.data.totalPages} · {auditState.data.total} evento(s)
                                    </span>
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={auditState.data.page <= 1}
                                            onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                                        >
                                            Anterior
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={auditState.data.page >= auditState.data.totalPages}
                                            onClick={() => setAuditPage((p) => p + 1)}
                                        >
                                            Próxima
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    </div>
  );
}