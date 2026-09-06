import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ShieldAlert, HeartPulse, Activity, Zap, Shield, Clock, Wifi, WifiOff, Loader2, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { io, Socket } from 'socket.io-client';
import { useSessionStore } from '../../store/useSessionStore';
import { logger } from '../../lib/logger';

interface Alert {
  id: string;
  level: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: number;
}

interface EmotionSnapshot {
  empathy: number;
  confidence: number;
  frustration: number;
}

interface IntentSnapshot {
  primary: string;
  confidence: number;
}

interface TelemetryPayload {
  // The current server implementation does not always stamp every event with the sessionId of
  // the call it belongs to (see handoff 11-para-00-socketio-tenant-rbac-audit.md). When it is
  // present we use it as a defense-in-depth filter so this component can never render another
  // session's data as if it were the one being watched.
  sessionId?: string;
  callDuration: number;
  emotions: EmotionSnapshot;
  intent: IntentSnapshot;
  objections: string[];
  alerts?: Alert[];
}

interface InterventionPayload {
  sessionId?: string;
  by?: string;
  at?: number;
}

interface InterventionState {
  active: boolean;
  triggeredByMe: boolean;
  actorLabel: string;
  at: number;
}

type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface LiveSupervisorProps {
  sessionId: string;
}

// RBAC for call intervention: the platform's RBAC model (see src/repositories/roleRepository.ts)
// only issues 'admin' and 'user' system roles today — there is no dedicated 'supervisor' role
// yet. Until one exists (see handoff 11-para-01-supervisor-role-rbac.md), 'admin' is used here as
// the closest conservative proxy: it can only ever be narrower than "any authenticated user",
// never broader. This check is UX/defense-in-depth only — the authoritative enforcement belongs
// on the socket server (see handoff 11-para-00-socketio-tenant-rbac-audit.md) and must never be
// trusted from the client alone.
const ROLES_ALLOWED_TO_INTERVENE = ['admin'];

export function LiveSupervisor({ sessionId }: LiveSupervisorProps) {
  const user = useSessionStore((s) => s.user);
  const canIntervene = !!user && ROLES_ALLOWED_TO_INTERVENE.includes(user.role);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  // Emotion/intent start as "no data yet" (null), never a fabricated baseline. Rendering a fake
  // 85/90/10 before any real telemetry arrives would be exactly the kind of invented metric
  // AGENTS.md §14 prohibits.
  const [emotions, setEmotions] = useState<EmotionSnapshot | null>(null);
  const [intent, setIntent] = useState<IntentSnapshot | null>(null);
  const [objections, setObjections] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [callDuration, setCallDuration] = useState<number>(0);
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
  const [intervention, setIntervention] = useState<InterventionState | null>(null);
  const [criticalAnnouncement, setCriticalAnnouncement] = useState<string>('');

  const announcedAlertIds = useRef<Set<string>>(new Set());
  const hasConnectedOnceRef = useRef(false);

  useEffect(() => {
    announcedAlertIds.current = new Set();
    hasConnectedOnceRef.current = false;
    setConnectionStatus('connecting');
    setLastUpdateAt(null);
    setEmotions(null);
    setIntent(null);
    setObjections([]);
    setAlerts([]);
    setCallDuration(0);
    setIntervention(null);

    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
    });

    setSocketInstance(socket);

    socket.on('connect', () => {
      hasConnectedOnceRef.current = true;
      setConnectionStatus('connected');
      // Declares intent to watch this specific session so a tenant/session-scoped server can
      // join this socket to the right room. The current server does not implement this yet —
      // see handoff 11-para-00-socketio-tenant-rbac-audit.md — so today it is a no-op there.
      socket.emit('watch_session', { sessionId });
    });

    socket.on('connect_error', () => {
      setConnectionStatus(hasConnectedOnceRef.current ? 'reconnecting' : 'disconnected');
    });

    socket.on('disconnect', () => {
      // socket.io-client reconnects automatically by default, so a drop mid-session is a
      // "reconnecting" state, never a silent freeze of the last known data as if it were live.
      setConnectionStatus('reconnecting');
    });

    socket.on('telemetry_stream', (data: TelemetryPayload) => {
      if (data?.sessionId && data.sessionId !== sessionId) {
        logger.warn('LiveSupervisor: telemetria ignorada — sessionId não corresponde à sessão observada', {
          expected: sessionId,
          received: data.sessionId,
        });
        return;
      }
      setLastUpdateAt(Date.now());
      setCallDuration(data.callDuration);
      setEmotions(data.emotions);
      setIntent(data.intent);
      setObjections(data.objections ?? []);
      setAlerts(data.alerts ?? []);
    });

    socket.on('intervention_triggered', (data?: InterventionPayload) => {
      if (data?.sessionId && data.sessionId !== sessionId) return;
      setIntervention((prev) =>
        // A local optimistic "triggeredByMe" record always wins over a broadcast echo of our
        // own action; only a *different* actor's intervention should overwrite it.
        prev?.triggeredByMe
          ? prev
          : {
              active: true,
              triggeredByMe: false,
              actorLabel: data?.by || 'Outro supervisor',
              at: data?.at ?? Date.now(),
            },
      );
    });

    socket.on('intervention_error', (data?: { message?: string }) => {
      // The client-side `canIntervene` gate is UX only — the server is the authoritative check
      // (see server.ts, ROLES_ALLOWED_TO_INTERVENE). If it rejects the request, roll back the
      // optimistic state instead of showing an intervention that never actually happened.
      logger.warn('LiveSupervisor: intervenção rejeitada pelo servidor', { message: data?.message });
      setIntervention((prev) => (prev?.triggeredByMe ? null : prev));
    });

    return () => {
      socket.disconnect();
    };
  }, [sessionId]);

  // Critical alerts must be announceable to assistive tech, not just a color change on the
  // visual log. A dedicated aria-live region is updated only when a *new* critical alert arrives
  // (tracked by id) so screen readers announce one concise message instead of the whole list.
  useEffect(() => {
    const newCritical = alerts.find((a) => a.level === 'critical' && !announcedAlertIds.current.has(a.id));
    if (newCritical) {
      announcedAlertIds.current.add(newCritical.id);
      setCriticalAnnouncement(`Alerta crítico: ${newCritical.message}`);
    }
  }, [alerts]);

  const handleIntervene = useCallback(() => {
    if (!socketInstance || !canIntervene || intervention?.active) return;
    socketInstance.emit('intervene_call', { sessionId });
    // Optimistic local state — the server is the source of truth for the audit record (who/when),
    // this only reflects the action was sent while awaiting/echoing confirmation.
    setIntervention({ active: true, triggeredByMe: true, actorLabel: user?.email || 'Você', at: Date.now() });
  }, [socketInstance, canIntervene, intervention, sessionId, user]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const hasTelemetry = emotions !== null && intent !== null;
  const isStale = connectionStatus !== 'connected' && hasTelemetry;

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 text-white overflow-hidden shadow-2xl flex flex-col h-full max-h-[800px]">
      {/* Screen-reader-only live region: announces new critical alerts immediately. */}
      <div className="sr-only" role="alert" aria-live="assertive">
        {criticalAnnouncement}
      </div>

      <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-wide">LIVE SUPERVISOR</h2>
            <p className="text-xs text-slate-400 font-mono">Session: {sessionId.split('-')[0]}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <ConnectionBadge status={connectionStatus} />
          {connectionStatus === 'connected' && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-mono font-medium text-slate-300">LIVE</span>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-full text-xs font-mono">
            <Clock className="w-3 h-3 text-slate-400" />
            {formatTime(callDuration)}
          </div>
        </div>
      </div>

      {isStale && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Dados congelados — {connectionStatus === 'reconnecting' ? 'reconectando ao stream ao vivo' : 'conexão perdida'}.
          {lastUpdateAt && ` Última atualização: ${new Date(lastUpdateAt).toLocaleTimeString()}.`}
        </div>
      )}

      <div className="flex-1 p-6 grid grid-cols-12 gap-6 overflow-y-auto">
        {/* Left Column: Metrics & Intent */}
        <div className={`col-span-12 lg:col-span-8 space-y-6 transition-opacity ${isStale ? 'opacity-60' : 'opacity-100'}`}>

          {!hasTelemetry ? (
            <div className="bg-slate-800/50 rounded-xl p-8 border border-slate-700 text-center text-sm text-slate-400">
              {connectionStatus === 'connected'
                ? 'Aguardando dados reais desta chamada...'
                : 'Sem dados — aguardando conexão com o stream ao vivo.'}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <MetricCard title="Empatia" value={emotions.empathy} icon={<HeartPulse className="w-4 h-4" />} color="text-pink-400" bg="bg-pink-400/10" />
                <MetricCard title="Confiança" value={emotions.confidence} icon={<Shield className="w-4 h-4" />} color="text-emerald-400" bg="bg-emerald-400/10" />
                <MetricCard title="Frustração" value={emotions.frustration} icon={<Activity className="w-4 h-4" />} color="text-orange-400" bg="bg-orange-400/10" inverted />
              </div>

              <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-indigo-400" />
                    Intenção Atual
                  </h3>
                  <span className="text-xs font-mono text-indigo-300 bg-indigo-500/20 px-2 py-1 rounded">
                    Confiança: {intent.confidence}%
                  </span>
                </div>
                <div className="text-xl font-medium text-white">{intent.primary}</div>
                <div className="mt-4 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-indigo-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${intent.confidence}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            </>
          )}

          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-4">
              <AlertCircle className="w-4 h-4 text-orange-400" />
              Objeções Detectadas
            </h3>
            <div className="space-y-3">
              <AnimatePresence>
                {objections.length === 0 ? (
                   <p className="text-sm text-slate-500 italic">Nenhuma objeção registrada nesta sessão.</p>
                ) : (
                  objections.map((obj, i) => (
                    <motion.div
                      key={`${obj}-${i}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-300 flex items-start gap-3"
                    >
                      <div className="w-2 h-2 rounded-full bg-orange-500 mt-1.5" />
                      {obj}
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>

        </div>

        {/* Right Column: Real-time Alerts */}
        <div className="col-span-12 lg:col-span-4 flex flex-col">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-700 bg-slate-800/80">
              <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                Risk & Alerts Log
              </h3>
            </div>
            <div className="p-4 flex-1 overflow-y-auto space-y-3">
              <AnimatePresence>
                {alerts.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center mt-10">Tudo normal. Nenhum alerta crítico.</p>
                ) : (
                  alerts.map((alert) => (
                    <motion.div
                      key={alert.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`p-3 rounded-lg border text-xs ${
                        alert.level === 'critical'
                          ? 'bg-red-500/10 border-red-500/30 text-red-300'
                          : 'bg-orange-500/10 border-orange-500/30 text-orange-300'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-bold uppercase tracking-wider text-[10px]">{alert.level}</span>
                        <span className="font-mono text-slate-500">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p>{alert.message}</p>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
            <div className="p-4 bg-slate-900 border-t border-slate-700 space-y-2">
               {!canIntervene && (
                 <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                   <Lock className="w-3 h-3" /> Apenas supervisores podem intervir nesta chamada.
                 </p>
               )}
               <button
                 onClick={handleIntervene}
                 disabled={!canIntervene || !!intervention?.active}
                 title={!canIntervene ? 'Apenas supervisores podem intervir nesta chamada.' : undefined}
                 className={`w-full py-2 text-white text-sm font-bold rounded-lg shadow-lg transition-colors disabled:cursor-not-allowed ${
                   intervention?.active
                     ? 'bg-emerald-600 shadow-emerald-900/50'
                     : canIntervene
                       ? 'bg-red-600 hover:bg-red-700 shadow-red-900/50'
                       : 'bg-slate-700 shadow-none opacity-60'
                 }`}
               >
                 {intervention?.active
                   ? intervention.triggeredByMe
                     ? 'INTERVENÇÃO ENVIADA VIA WEBSOCKET'
                     : 'INTERVENÇÃO ATIVA (OUTRO SUPERVISOR)'
                   : 'INTERVIR NA CHAMADA'}
               </button>
               {intervention?.active && (
                 <p className="text-[11px] text-slate-400 font-mono">
                   Por {intervention.actorLabel} às {new Date(intervention.at).toLocaleTimeString()}
                 </p>
               )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const config: Record<ConnectionStatus, { label: string; className: string; icon: React.ReactNode }> = {
    connecting: {
      label: 'CONECTANDO...',
      className: 'text-slate-300',
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    connected: {
      label: 'WS CONECTADO',
      className: 'text-emerald-400',
      icon: <Wifi className="w-3 h-3" />,
    },
    reconnecting: {
      label: 'RECONECTANDO...',
      className: 'text-amber-400',
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    disconnected: {
      label: 'WS OFFLINE',
      className: 'text-red-400',
      icon: <WifiOff className="w-3 h-3" />,
    },
  };
  const { label, className, icon } = config[status];

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-800 rounded-md text-[10px] font-mono font-bold">
      <span className={`flex items-center gap-1 ${className}`}>
        {icon} {label}
      </span>
    </div>
  );
}

function MetricCard({ title, value, icon, color, bg, inverted = false }: { title: string, value: number, icon: React.ReactNode, color: string, bg: string, inverted?: boolean }) {
  const isWarning = inverted ? value > 50 : value < 50;

  return (
    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2 rounded-lg ${bg} ${color}`}>
          {icon}
        </div>
        <span className="text-xs font-medium text-slate-400">{title}</span>
      </div>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-bold font-mono text-white">{Math.round(value)}</span>
        <span className={`text-xs font-medium ${isWarning ? 'text-red-400' : 'text-slate-500'}`}>
          / 100
        </span>
      </div>
      <div className="mt-3 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <motion.div
          className={`h-full ${isWarning ? 'bg-red-500' : color.replace('text-', 'bg-')}`}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
    </div>
  );
}
