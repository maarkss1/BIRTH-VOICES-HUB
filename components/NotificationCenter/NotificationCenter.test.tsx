// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationCenter } from './NotificationCenter';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe('NotificationCenter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('fetches on mount and shows the unread badge from real data', async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      expect(String(url)).toContain('/api/notifications?page=1');
      return jsonResponse({
        items: [
          { id: 'n1', title: 'Plano atualizado', message: 'Seu plano mudou.', isRead: false, createdAt: new Date().toISOString() },
        ],
        unreadCount: 1,
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });
    });

    render(<NotificationCenter />);

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
  });

  it('shows an explicit empty state — never a fabricated item — when there are no notifications', async () => {
    vi.mocked(fetch).mockImplementation(() =>
      jsonResponse({ items: [], unreadCount: 0, page: 1, pageSize: 20, total: 0, totalPages: 1 })
    );

    const user = userEvent.setup();
    render(<NotificationCenter />);

    await user.click(screen.getByLabelText('Notificações'));

    expect(await screen.findByText('Nenhuma notificação')).toBeInTheDocument();
  });

  it('shows an explicit error state with a retry action when the fetch fails', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response));

    const user = userEvent.setup();
    render(<NotificationCenter />);

    await user.click(screen.getByLabelText('Notificações'));

    expect(await screen.findByText(/Não foi possível carregar/)).toBeInTheDocument();
  });

  it('marks a notification as read and decrements the unread badge', async () => {
    const items = [
      { id: 'n1', title: 'Alerta', message: 'Mensagem', isRead: false, createdAt: new Date().toISOString() },
    ];
    vi.mocked(fetch).mockImplementation((url, init) => {
      const method = init?.method ?? 'GET';
      if (String(url).includes('/read') && method === 'POST') {
        return jsonResponse({ notification: { ...items[0], isRead: true } });
      }
      return jsonResponse({ items, unreadCount: 1, page: 1, pageSize: 20, total: 1, totalPages: 1 });
    });

    const user = userEvent.setup();
    render(<NotificationCenter />);

    await user.click(screen.getByLabelText('Notificações'));
    await screen.findByText('Alerta');

    await user.click(screen.getByText('Marcar como lida'));

    await waitFor(() => expect(screen.queryByText('Marcar como lida')).not.toBeInTheDocument());
    // Badge disappears once unreadCount reaches 0.
    await waitFor(() => expect(screen.queryByLabelText('Notificações')?.querySelector('span')).toBeNull());
  });

  it('marks all as read via the bulk action', async () => {
    const items = [
      { id: 'n1', title: 'A', message: 'msg', isRead: false, createdAt: new Date().toISOString() },
      { id: 'n2', title: 'B', message: 'msg', isRead: false, createdAt: new Date().toISOString() },
    ];
    vi.mocked(fetch).mockImplementation((url, init) => {
      const method = init?.method ?? 'GET';
      if (String(url).includes('/read-all') && method === 'POST') {
        return jsonResponse({ updatedCount: 2 });
      }
      return jsonResponse({ items, unreadCount: 2, page: 1, pageSize: 20, total: 2, totalPages: 1 });
    });

    const user = userEvent.setup();
    render(<NotificationCenter />);

    await user.click(screen.getByLabelText('Notificações'));
    await screen.findByText('A');

    await user.click(screen.getByText('Marcar todas como lidas'));

    await waitFor(() => expect(screen.queryAllByText('Marcar como lida')).toHaveLength(0));
  });
});
