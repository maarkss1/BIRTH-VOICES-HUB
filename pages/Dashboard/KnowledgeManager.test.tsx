// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KnowledgeManager from './KnowledgeManager';

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe('KnowledgeManager Page', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {})); // Never resolves
    const { container } = render(<KnowledgeManager />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders empty state when no agents exist', async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (String(url).endsWith('/api/agents')) {
        return jsonResponse({ agents: [] });
      }
      return jsonResponse({});
    });

    render(<KnowledgeManager />);

    await waitFor(() => {
      expect(screen.getByText('Nenhum agente cadastrado')).toBeInTheDocument();
      expect(screen.getByText('Criar Agente')).toBeInTheDocument();
    });
  });

  it('renders agents, document cards, and active agent selection', async () => {
    const mockAgents = [
      {
        id: 'agent-1',
        name: 'Assistente Comercial',
        role: 'Vendas',
        status: 'active',
        configuration: {
          knowledge: [
            {
              id: 'doc-1',
              name: 'Tabela de Preços 2026',
              keyword: 'precos',
              content: 'Plano Pro custa R$ 299 por mês e inclui minutos ilimitados.',
              addedAt: Date.now(),
            },
          ],
        },
      },
      {
        id: 'agent-2',
        name: 'Suporte Técnico',
        role: 'Suporte',
        status: 'active',
        configuration: { knowledge: [] },
      },
    ];

    vi.mocked(fetch).mockImplementation((url) => {
      if (String(url).endsWith('/api/agents')) {
        return jsonResponse({ agents: mockAgents });
      }
      return jsonResponse({});
    });

    render(<KnowledgeManager />);

    await waitFor(() => {
      expect(screen.getAllByText('Assistente Comercial').length).toBeGreaterThan(0);
      expect(screen.getByText('Suporte Técnico')).toBeInTheDocument();
      expect(screen.getByText('Tabela de Preços 2026')).toBeInTheDocument();
      expect(screen.getByText('precos')).toBeInTheDocument();
      expect(screen.getByText(/Plano Pro custa R\$ 299/)).toBeInTheDocument();
    });
  });

  it('switches to an agent with empty knowledge and shows empty state for that agent', async () => {
    const user = userEvent.setup();
    const mockAgents = [
      {
        id: 'agent-1',
        name: 'Assistente Comercial',
        role: 'Vendas',
        status: 'active',
        configuration: {
          knowledge: [
            { id: 'doc-1', name: 'Doc 1', keyword: 'doc', content: 'Info' },
          ],
        },
      },
      {
        id: 'agent-2',
        name: 'Suporte Técnico',
        role: 'Suporte',
        status: 'active',
        configuration: { knowledge: [] },
      },
    ];

    vi.mocked(fetch).mockImplementation((url) => {
      if (String(url).endsWith('/api/agents')) {
        return jsonResponse({ agents: mockAgents });
      }
      return jsonResponse({});
    });

    render(<KnowledgeManager />);

    await waitFor(() => {
      expect(screen.getAllByText('Assistente Comercial').length).toBeGreaterThan(0);
    });

    // Click on Suporte Técnico
    await user.click(screen.getByText('Suporte Técnico'));

    await waitFor(() => {
      expect(screen.getByText('Base de conhecimento vazia')).toBeInTheDocument();
      expect(screen.getByText(/O agente "Suporte Técnico" ainda não possui nenhum documento indexado/)).toBeInTheDocument();
    });
  });

  it('opens and closes upload modal', async () => {
    const user = userEvent.setup();
    const mockAgents = [
      {
        id: 'agent-1',
        name: 'Assistente Comercial',
        role: 'Vendas',
        status: 'active',
        configuration: { knowledge: [] },
      },
    ];

    vi.mocked(fetch).mockImplementation((url) => {
      if (String(url).endsWith('/api/agents')) {
        return jsonResponse({ agents: mockAgents });
      }
      return jsonResponse({});
    });

    render(<KnowledgeManager />);

    await waitFor(() => {
      expect(screen.getAllByText('Assistente Comercial').length).toBeGreaterThan(0);
    });

    // Click Upload button
    await user.click(screen.getByRole('button', { name: /Upload \(\.txt \/ \.md\)/i }));

    expect(screen.getByRole('heading', { name: 'Upload de Conhecimento' })).toBeInTheDocument();
    expect(screen.getByText(/Varredura antivírus obrigatória/i)).toBeInTheDocument();

    // Click Cancelar
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('heading', { name: 'Upload de Conhecimento' })).not.toBeInTheDocument();
  });

  it('executes RAG query and displays confidence and matches', async () => {
    const user = userEvent.setup();
    const mockAgents = [
      {
        id: 'agent-1',
        name: 'Assistente Comercial',
        role: 'Vendas',
        status: 'active',
        configuration: {
          knowledge: [
            { id: 'doc-1', name: 'FAQ Comercial', keyword: 'horario', content: 'Atendemos das 8h às 18h.' },
          ],
        },
      },
    ];

    vi.mocked(fetch).mockImplementation((url, init) => {
      const href = String(url);
      if (href.endsWith('/api/agents')) {
        return jsonResponse({ agents: mockAgents });
      }
      if (href.endsWith('/api/agents/agent-1/rag/test') && init?.method === 'POST') {
        return jsonResponse({
          success: true,
          result: {
            confidence: 0.95,
            confidenceLevel: 'high',
            hasDirectMatch: true,
            matches: [{ name: 'FAQ Comercial', keyword: 'horario' }],
          },
        });
      }
      return jsonResponse({});
    });

    render(<KnowledgeManager />);

    await waitFor(() => {
      expect(screen.getAllByText('FAQ Comercial').length).toBeGreaterThan(0);
    });

    // Open RAG Test modal
    await user.click(screen.getByRole('button', { name: /Testar RAG/i }));

    expect(screen.getByRole('heading', { name: 'Simulador de Consulta RAG' })).toBeInTheDocument();

    // Type query and submit
    const queryInput = screen.getByPlaceholderText(/Como funciona a política de cancelamento/i);
    await user.type(queryInput, 'Qual o horário de atendimento?');
    
    const consultBtn = screen.getByRole('button', { name: 'Consultar' });
    await user.click(consultBtn);

    await waitFor(() => {
      expect(screen.getByText(/Alta Confiança \(95%\)/i)).toBeInTheDocument();
      expect(screen.getAllByText('FAQ Comercial').length).toBe(2);
    });
  });
});
