// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as socketIoClient from 'socket.io-client';
import { LiveSupervisor } from './LiveSupervisor';
import { useSessionStore } from '../../store/useSessionStore';

type Handler = (data?: unknown) => void;
type MockSocket = {
  on: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  trigger: (event: string, data?: unknown) => void;
};

// A fresh mock socket is created on every `io(...)` call so each test/render
// gets an isolated instance instead of accumulating handlers across tests.
vi.mock('socket.io-client', () => {
  let lastSocket: MockSocket | null = null;

  const io = vi.fn(() => {
    const handlers = new Map<string, Handler[]>();
    const socket: MockSocket = {
      on: vi.fn((event: string, cb: Handler) => {
        const list = handlers.get(event) ?? [];
        list.push(cb);
        handlers.set(event, list);
      }),
      emit: vi.fn(),
      disconnect: vi.fn(),
      trigger: (event: string, data?: unknown) => {
        (handlers.get(event) ?? []).forEach((cb) => cb(data));
      }
    };
    lastSocket = socket;
    return socket;
  });

  return {
    io,
    __getLastSocket: () => lastSocket
  };
});

function getMockSocket(): MockSocket {
  const mod = socketIoClient as unknown as { __getLastSocket: () => MockSocket };
  const socket = mod.__getLastSocket();
  if (!socket) throw new Error('Mock socket was not created — did the component call io()?');
  return socket;
}

const SUPERVISOR_USER = { id: 'u1', email: 'supervisora@teste.com', role: 'admin', tenantId: 'tenant-1' };
const AGENT_USER = { id: 'u2', email: 'agente@teste.com', role: 'user', tenantId: 'tenant-1' };
// Dedicated 'supervisor' role (see handoff 01-para-11-supervisor-permission-frontend.md): holds
// the 'supervision:intervene' permission on the server by default, same as 'admin', but must not
// get full admin access. Only the client-side allowlist is exercised here.
const DEDICATED_SUPERVISOR_USER = { id: 'u3', email: 'supervisor.dedicado@teste.com', role: 'supervisor', tenantId: 'tenant-1' };

describe('LiveSupervisor', () => {
  beforeEach(() => {
    useSessionStore.setState({ user: SUPERVISOR_USER, sessionStatus: 'authenticated' });
  });

  afterEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({ user: null, sessionStatus: 'idle' });
  });

  it('renders a connecting state with no fabricated telemetry before the socket ever connects', () => {
    render(<LiveSupervisor sessionId="sess-123" />);

    expect(screen.getByText('LIVE SUPERVISOR')).toBeInTheDocument();
    expect(screen.getByText('CONECTANDO...')).toBeInTheDocument();
    // No hardcoded/fabricated emotion or intent numbers before real data arrives.
    expect(screen.queryByText('85')).not.toBeInTheDocument();
    expect(screen.getByText(/Sem dados — aguardando conexão/)).toBeInTheDocument();
    expect(screen.getByText('Nenhuma objeção registrada nesta sessão.')).toBeInTheDocument();
  });

  it('joins the watched session and reflects live telemetry pushed over the socket', () => {
    render(<LiveSupervisor sessionId="sess-123" />);
    const socket = getMockSocket();

    act(() => {
      socket.trigger('connect');
    });

    expect(socket.emit).toHaveBeenCalledWith('watch_session', { sessionId: 'sess-123' });
    expect(screen.getByText('WS CONECTADO')).toBeInTheDocument();
    expect(screen.getByText('Aguardando dados reais desta chamada...')).toBeInTheDocument();

    act(() => {
      socket.trigger('telemetry_stream', {
        sessionId: 'sess-123',
        callDuration: 65,
        emotions: { empathy: 40, confidence: 30, frustration: 80 },
        intent: { primary: 'Reclamação sobre cobrança', confidence: 77 },
        objections: ['Preço muito alto'],
        alerts: [{ id: 'a1', level: 'critical', message: 'Cliente irritado detectado', timestamp: Date.now() }]
      });
    });

    expect(screen.getByText('01:05')).toBeInTheDocument();
    expect(screen.getByText('Reclamação sobre cobrança')).toBeInTheDocument();
    expect(screen.getByText('Preço muito alto')).toBeInTheDocument();
    expect(screen.getByText('Cliente irritado detectado')).toBeInTheDocument();
  });

  it('ignores telemetry and intervention events stamped with a different sessionId (tenant/session isolation)', () => {
    render(<LiveSupervisor sessionId="sess-123" />);
    const socket = getMockSocket();

    act(() => {
      socket.trigger('connect');
      socket.trigger('telemetry_stream', {
        sessionId: 'sess-OTHER-TENANT',
        callDuration: 999,
        emotions: { empathy: 1, confidence: 1, frustration: 1 },
        intent: { primary: 'Vazamento cross-tenant', confidence: 1 },
        objections: [],
        alerts: []
      });
      socket.trigger('intervention_triggered', { sessionId: 'sess-OTHER-TENANT', by: 'outro@tenant.com' });
    });

    expect(screen.queryByText('Vazamento cross-tenant')).not.toBeInTheDocument();
    expect(screen.getByText('Aguardando dados reais desta chamada...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /intervir na chamada/i })).not.toBeDisabled();
  });

  it('shows a visible reconnecting state and marks stale data instead of freezing it as live', () => {
    render(<LiveSupervisor sessionId="sess-123" />);
    const socket = getMockSocket();

    act(() => {
      socket.trigger('connect');
      socket.trigger('telemetry_stream', {
        sessionId: 'sess-123',
        callDuration: 10,
        emotions: { empathy: 50, confidence: 50, frustration: 50 },
        intent: { primary: 'Qualificação', confidence: 80 },
        objections: [],
        alerts: []
      });
    });

    expect(screen.getByText('Qualificação')).toBeInTheDocument();

    act(() => {
      socket.trigger('disconnect');
    });

    expect(screen.getByText('RECONECTANDO...')).toBeInTheDocument();
    expect(screen.getByText(/Dados congelados/)).toBeInTheDocument();
    // Stale data stays visible (for context) but is clearly labeled as no longer live.
    expect(screen.getByText('Qualificação')).toBeInTheDocument();
  });

  it('shows a disconnected state when the socket never manages to connect', () => {
    render(<LiveSupervisor sessionId="sess-123" />);
    const socket = getMockSocket();

    act(() => {
      socket.trigger('connect_error', new Error('unauthorized'));
    });

    expect(screen.getByText('WS OFFLINE')).toBeInTheDocument();
  });

  it('only allows a supervisor role to intervene, and disables the control for others', () => {
    useSessionStore.setState({ user: AGENT_USER, sessionStatus: 'authenticated' });
    render(<LiveSupervisor sessionId="sess-123" />);

    const interveneButton = screen.getByRole('button', { name: /intervir na chamada/i });
    expect(interveneButton).toBeDisabled();
    expect(screen.getByText(/Apenas supervisores podem intervir/)).toBeInTheDocument();
  });

  it('also allows the dedicated supervisor role to intervene, not just admin', () => {
    useSessionStore.setState({ user: DEDICATED_SUPERVISOR_USER, sessionStatus: 'authenticated' });
    render(<LiveSupervisor sessionId="sess-123" />);

    const interveneButton = screen.getByRole('button', { name: /intervir na chamada/i });
    expect(interveneButton).not.toBeDisabled();
    expect(screen.queryByText(/Apenas supervisores podem intervir/)).not.toBeInTheDocument();
  });

  it('emits an audited intervention and disables further intervention once triggered', async () => {
    const user = userEvent.setup();
    render(<LiveSupervisor sessionId="sess-123" />);
    const socket = getMockSocket();

    const interveneButton = screen.getByRole('button', { name: /intervir na chamada/i });
    expect(interveneButton).not.toBeDisabled();

    await user.click(interveneButton);

    expect(socket.emit).toHaveBeenCalledWith('intervene_call', { sessionId: 'sess-123' });
    expect(screen.getByRole('button', { name: /intervenção enviada/i })).toBeDisabled();
    expect(screen.getByText(new RegExp(SUPERVISOR_USER.email))).toBeInTheDocument();
  });

  it('reflects a concurrent intervention from another supervisor without a silent race', () => {
    render(<LiveSupervisor sessionId="sess-123" />);
    const socket = getMockSocket();

    act(() => {
      socket.trigger('intervention_triggered', { sessionId: 'sess-123', by: 'outro.supervisor@teste.com', at: Date.now() });
    });

    expect(screen.getByRole('button', { name: /intervenção ativa \(outro supervisor\)/i })).toBeDisabled();
    expect(screen.getByText(/outro\.supervisor@teste\.com/)).toBeInTheDocument();
  });

  it('announces a new critical alert through a dedicated aria-live region', () => {
    render(<LiveSupervisor sessionId="sess-123" />);
    const socket = getMockSocket();

    act(() => {
      socket.trigger('connect');
      socket.trigger('telemetry_stream', {
        sessionId: 'sess-123',
        callDuration: 5,
        emotions: { empathy: 50, confidence: 50, frustration: 90 },
        intent: { primary: 'Cancelamento', confidence: 60 },
        objections: [],
        alerts: [{ id: 'crit-1', level: 'critical', message: 'Cliente ameaça cancelar contrato', timestamp: Date.now() }]
      });
    });

    const liveRegion = screen.getByRole('alert');
    expect(liveRegion).toHaveAttribute('aria-live', 'assertive');
    expect(liveRegion).toHaveTextContent('Cliente ameaça cancelar contrato');
  });

  it('announces new warning/info alerts through a separate polite region, without duplicating the critical one', () => {
    render(<LiveSupervisor sessionId="sess-123" />);
    const socket = getMockSocket();

    act(() => {
      socket.trigger('connect');
      socket.trigger('telemetry_stream', {
        sessionId: 'sess-123',
        callDuration: 5,
        emotions: { empathy: 50, confidence: 50, frustration: 60 },
        intent: { primary: 'Suporte', confidence: 60 },
        objections: [],
        alerts: [
          { id: 'warn-1', level: 'warning', message: 'Tom de voz elevado', timestamp: Date.now() },
          { id: 'info-1', level: 'info', message: 'Cliente mencionou concorrente', timestamp: Date.now() }
        ]
      });
    });

    const politeRegion = screen.getByRole('status');
    expect(politeRegion).toHaveAttribute('aria-live', 'polite');
    // Only the latest non-critical alert needs to be present in the polite region's current text —
    // it is not expected to re-announce every alert ever seen, only what's new.
    expect(politeRegion).toHaveTextContent('Cliente mencionou concorrente');

    // No critical alert arrived, so the assertive region must stay empty (not repurposed for
    // warning/info, which would defeat the point of keeping the two severities separate).
    const criticalRegion = screen.getByRole('alert');
    expect(criticalRegion).toHaveTextContent('');

    // A later critical alert must still go through the assertive region, not the polite one,
    // and must not re-trigger the polite region for alerts already announced.
    act(() => {
      socket.trigger('telemetry_stream', {
        sessionId: 'sess-123',
        callDuration: 6,
        emotions: { empathy: 50, confidence: 50, frustration: 60 },
        intent: { primary: 'Suporte', confidence: 60 },
        objections: [],
        alerts: [
          { id: 'warn-1', level: 'warning', message: 'Tom de voz elevado', timestamp: Date.now() },
          { id: 'info-1', level: 'info', message: 'Cliente mencionou concorrente', timestamp: Date.now() },
          { id: 'crit-2', level: 'critical', message: 'Cliente exige cancelamento imediato', timestamp: Date.now() }
        ]
      });
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Cliente exige cancelamento imediato');
    // Still the previous non-critical message — 'warn-1'/'info-1' were already announced above
    // and must not be re-announced just because the alert list was retransmitted.
    expect(screen.getByRole('status')).toHaveTextContent('Cliente mencionou concorrente');
  });
});
