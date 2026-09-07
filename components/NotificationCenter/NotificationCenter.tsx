import React, { useCallback, useEffect, useState } from 'react';
import { Bell, Check, CheckCheck, RefreshCw } from 'lucide-react';
import { logger } from '../../lib/logger';
import { formatRelativeTime } from './formatRelativeTime';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string; // ISO 8601
}

interface NotificationsResponse {
  items: NotificationItem[];
  unreadCount: number;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

type FeedState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: NotificationItem[]; unreadCount: number };

const PAGE_SIZE = 20;

// Real, per-user notification feed (GET/POST /api/notifications*, Agente 12) — replaces the 5
// hardcoded "Exemplo" items that used to live inline in components/Sidebar.tsx (Agente 02), per
// .agents/handoffs/onda-2/02-para-00-notificacoes-backend.md. This component owns its own fetch,
// open/close and mark-as-read state; components/Sidebar.tsx only renders <NotificationCenter />
// where the old bell+drawer used to be (see the handoff to Agente 02 asking for that wiring — this
// agent does not edit Sidebar.tsx itself, AGENTS.md §11).
//
// Deliberately styled for a fixed-dark host (matches Sidebar.tsx's own hardcoded
// `bg-slate-900 text-white`, not the app's light/dark theme tokens) since that is the only place
// this component is meant to render today. AGENTS.md §14: loading/empty/error are explicit states
// below — never a fabricated notification while data loads or a request fails.
export function NotificationCenter({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FeedState>({ status: 'loading' });
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = useCallback(() => {
    setState({ status: 'loading' });
    fetch(`/api/notifications?page=1&pageSize=${PAGE_SIZE}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<NotificationsResponse>;
      })
      .then((data) => setState({ status: 'ready', items: data.items, unreadCount: data.unreadCount }))
      .catch((err) => {
        logger.error('Failed to load notifications', { err });
        setState({ status: 'error' });
      });
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    if (state.status !== 'ready') return;
    setPendingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState((prev) =>
        prev.status === 'ready'
          ? {
              status: 'ready',
              items: prev.items.map((n) => (n.id === id && !n.isRead ? { ...n, isRead: true } : n)),
              unreadCount: Math.max(0, prev.unreadCount - (prev.items.find((n) => n.id === id && !n.isRead) ? 1 : 0)),
            }
          : prev
      );
    } catch (err) {
      logger.error('Failed to mark notification as read', { err, id });
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const markAllAsRead = async () => {
    setMarkingAll(true);
    try {
      const res = await fetch('/api/notifications/read-all', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState((prev) =>
        prev.status === 'ready'
          ? { status: 'ready', items: prev.items.map((n) => ({ ...n, isRead: true })), unreadCount: 0 }
          : prev
      );
    } catch (err) {
      logger.error('Failed to mark all notifications as read', { err });
    } finally {
      setMarkingAll(false);
    }
  };

  const unreadCount = state.status === 'ready' ? state.unreadCount : 0;

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notificações"
        aria-expanded={open}
        className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors relative cursor-pointer"
      >
        <Bell className="h-4.5 w-4.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        // Fixed overlay sized to match Sidebar.tsx's own width (`w-64`, 16rem) — this component
        // does not rely on the parent DOM structure it is rendered into (it only needs to sit
        // somewhere inside the sidebar header), so it positions itself relative to the viewport
        // rather than the immediate parent.
        <div className="fixed top-0 left-0 h-screen w-64 bg-slate-950/95 z-50 p-4 flex flex-col border-r border-slate-800">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <div className="flex items-center gap-1.5">
              <Bell className="h-4.5 w-4.5 text-brand" />
              <h3 className="font-bold text-sm text-white">Notificações</h3>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-slate-400 hover:text-white font-bold"
            >
              Fechar
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 text-left">
            {state.status === 'loading' && (
              <div className="space-y-2.5" aria-label="Carregando notificações">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 rounded-lg bg-slate-900 animate-pulse" />
                ))}
              </div>
            )}

            {state.status === 'error' && (
              <div className="py-10 text-center text-slate-400">
                <p className="text-xs font-bold mb-2">Não foi possível carregar as notificações.</p>
                <button
                  onClick={fetchNotifications}
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold text-brand hover:underline"
                >
                  <RefreshCw className="h-3 w-3" /> Tentar novamente
                </button>
              </div>
            )}

            {state.status === 'ready' && state.items.length === 0 && (
              <div className="py-12 text-center text-slate-500">
                <p className="text-xs font-bold">Nenhuma notificação</p>
                <p className="text-[10px] text-slate-600 mt-1">Você será avisado aqui quando algo importante acontecer.</p>
              </div>
            )}

            {state.status === 'ready' &&
              state.items.map((n) => (
                <div
                  key={n.id}
                  className={`p-2.5 rounded-lg border text-xs relative ${
                    n.isRead
                      ? 'bg-slate-900/40 border-slate-850 text-slate-450'
                      : 'bg-slate-850/60 border-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex justify-between items-start gap-4">
                    <p className="font-bold pr-2">{n.title}</p>
                    <span className="text-[9px] text-slate-500 font-bold shrink-0">
                      {formatRelativeTime(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{n.message}</p>

                  {!n.isRead && (
                    <div className="flex justify-end items-center mt-2.5 pt-2 border-t border-slate-800/40">
                      <button
                        onClick={() => markAsRead(n.id)}
                        disabled={pendingIds.has(n.id)}
                        className="inline-flex items-center gap-1 text-[9px] font-bold text-brand hover:underline disabled:opacity-50"
                      >
                        <Check className="h-3 w-3" /> Marcar como lida
                      </button>
                    </div>
                  )}
                </div>
              ))}
          </div>

          {state.status === 'ready' && (
            <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-[10px]">
              <button
                onClick={markAllAsRead}
                disabled={markingAll || state.unreadCount === 0}
                className="inline-flex items-center gap-1 text-brand hover:underline font-bold disabled:opacity-40 disabled:no-underline"
              >
                <CheckCheck className="h-3 w-3" /> Marcar todas como lidas
              </button>
              <span className="text-slate-500 font-mono">Total: {state.items.length}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationCenter;
