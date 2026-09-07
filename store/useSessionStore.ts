import { create } from 'zustand';
import { logger } from '../lib/logger';

export interface SessionUser {
  id: string;
  email: string;
  role: string;
  tenantId: string;
  // Permissions computed live by the server (GET /api/auth/me), never fabricated on the client.
  // Optional because older cached sessions/tests may not carry it; treat absence as "no permissions
  // known", not as "all denied" or "all allowed" — callers should check via
  // `user.permissions?.includes('some:permission')`.
  permissions?: string[];
}

export type SessionStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface SessionState {
  activeCalls: number;
  increment: () => void;
  decrement: () => void;
  brandColor: string;
  setBrandColor: (color: string) => void;

  // Real session state: who is logged in, which tenant/role they act under. Populated from
  // GET /api/auth/me (the only source of truth — never trust a client-writable cookie for this).
  user: SessionUser | null;
  sessionStatus: SessionStatus;
  fetchSession: () => Promise<SessionUser | null>;
  clearSession: () => void;
}

export const applyBrandColorToDom = (color: string) => {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--brand-color', color);
  
  const hex = color.replace('#', '');
  if (hex.length === 6) {
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    document.documentElement.style.setProperty('--brand-color-50', `rgba(${r}, ${g}, ${b}, 0.05)`);
    document.documentElement.style.setProperty('--brand-color-100', `rgba(${r}, ${g}, ${b}, 0.1)`);
    document.documentElement.style.setProperty('--brand-color-200', `rgba(${r}, ${g}, ${b}, 0.2)`);
    document.documentElement.style.setProperty('--brand-color-500', `rgba(${r}, ${g}, ${b}, 0.8)`);
    document.documentElement.style.setProperty('--brand-color-600', color);
    
    const darken = (val: number, percent: number) => Math.max(0, Math.floor(val * (1 - percent)));
    document.documentElement.style.setProperty('--brand-color-700', `rgb(${darken(r, 0.15)}, ${darken(g, 0.15)}, ${darken(b, 0.15)})`);
    document.documentElement.style.setProperty('--brand-color-800', `rgb(${darken(r, 0.3)}, ${darken(g, 0.3)}, ${darken(b, 0.3)})`);
    document.documentElement.style.setProperty('--brand-color-900', `rgb(${darken(r, 0.45)}, ${darken(g, 0.45)}, ${darken(b, 0.45)})`);
  }
};

export const useSessionStore = create<SessionState>((set) => ({
  activeCalls: 0,
  increment: () => set((state) => ({ activeCalls: state.activeCalls + 1 })),
  decrement: () => set((state) => ({ activeCalls: Math.max(0, state.activeCalls - 1) })),
  brandColor: '#ff5618',
  setBrandColor: (color: string) => {
    fetch('/api/brand-color', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color })
    }).catch(err => logger.error('Failed to save brand color', { err }));

    set({ brandColor: color });
    applyBrandColorToDom(color);
  },

  user: null,
  sessionStatus: 'idle',
  fetchSession: async () => {
    set({ sessionStatus: 'loading' });
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) {
        set({ user: null, sessionStatus: 'unauthenticated' });
        return null;
      }
      const data = await res.json();
      const user: SessionUser | null = data?.user
        ? {
            id: data.user.id,
            email: data.user.email,
            role: data.user.role,
            tenantId: data.user.tenantId,
            permissions: data.user.permissions,
          }
        : null;
      set({ user, sessionStatus: user ? 'authenticated' : 'unauthenticated' });
      return user;
    } catch (err) {
      logger.error('Failed to fetch current session', { err });
      set({ user: null, sessionStatus: 'unauthenticated' });
      return null;
    }
  },
  clearSession: () => set({ user: null, sessionStatus: 'unauthenticated' }),
}));
