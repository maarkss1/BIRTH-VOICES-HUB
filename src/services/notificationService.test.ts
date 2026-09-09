import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../repositories/notificationRepository.js', () => ({
  createNotification: vi.fn(),
  findNotificationsForUser: vi.fn(),
  countUnreadForUser: vi.fn(),
  markNotificationAsRead: vi.fn(),
  markAllAsReadForUser: vi.fn(),
}));

import {
  createNotification as createNotificationRow,
  findNotificationsForUser,
  countUnreadForUser,
  markNotificationAsRead as markNotificationAsReadRow,
  markAllAsReadForUser,
} from '../repositories/notificationRepository.js';
import {
  createNotification,
  listNotifications,
  markAllAsRead,
  markAsRead,
  NotificationNotFoundError,
} from './notificationService.js';

beforeEach(() => vi.clearAllMocks());

const NOW = new Date('2026-09-07T12:00:00.000Z');

describe('notificationService.createNotification', () => {
  it('creates via the repository and maps the row to a DTO with an ISO timestamp', async () => {
    vi.mocked(createNotificationRow).mockResolvedValue({
      id: 'notif-1',
      userId: 'user-1',
      title: 'Plano atualizado',
      message: 'Seu plano foi alterado.',
      isRead: false,
      createdAt: NOW,
    } as any);

    const result = await createNotification({ userId: 'user-1', title: 'Plano atualizado', message: 'Seu plano foi alterado.' });

    expect(createNotificationRow).toHaveBeenCalledWith({ userId: 'user-1', title: 'Plano atualizado', message: 'Seu plano foi alterado.' });
    expect(result).toEqual({
      id: 'notif-1',
      title: 'Plano atualizado',
      message: 'Seu plano foi alterado.',
      isRead: false,
      createdAt: '2026-09-07T12:00:00.000Z',
    });
  });
});

describe('notificationService.listNotifications', () => {
  it('combines paginated items and unread count, both scoped to userId', async () => {
    vi.mocked(findNotificationsForUser).mockResolvedValue([
      [
        { id: 'notif-1', userId: 'user-1', title: 'A', message: 'B', isRead: false, createdAt: NOW },
      ],
      1,
    ] as any);
    vi.mocked(countUnreadForUser).mockResolvedValue(1);

    const result = await listNotifications('user-1', { page: 1, pageSize: 20 });

    expect(findNotificationsForUser).toHaveBeenCalledWith('user-1', { page: 1, pageSize: 20 });
    expect(countUnreadForUser).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({
      items: [{ id: 'notif-1', title: 'A', message: 'B', isRead: false, createdAt: '2026-09-07T12:00:00.000Z' }],
      total: 1,
      unreadCount: 1,
    });
  });

  it('returns an explicit empty page (not fabricated data) when the user has no notifications', async () => {
    vi.mocked(findNotificationsForUser).mockResolvedValue([[], 0] as any);
    vi.mocked(countUnreadForUser).mockResolvedValue(0);

    const result = await listNotifications('user-1', { page: 1, pageSize: 20 });

    expect(result).toEqual({ items: [], total: 0, unreadCount: 0 });
  });
});

describe('notificationService.markAsRead', () => {
  it('returns the mapped notification when the repository confirms ownership', async () => {
    vi.mocked(markNotificationAsReadRow).mockResolvedValue({
      id: 'notif-1', userId: 'user-1', title: 'A', message: 'B', isRead: true, createdAt: NOW,
    } as any);

    const result = await markAsRead('notif-1', 'user-1');

    expect(markNotificationAsReadRow).toHaveBeenCalledWith('notif-1', 'user-1');
    expect(result.isRead).toBe(true);
  });

  it('throws NotificationNotFoundError when the repository returns null (missing or belongs to another user — same fallback, AGENTS.md §15)', async () => {
    vi.mocked(markNotificationAsReadRow).mockResolvedValue(null);

    await expect(markAsRead('notif-1', 'user-1')).rejects.toBeInstanceOf(NotificationNotFoundError);
  });
});

describe('notificationService.markAllAsRead', () => {
  it('returns the number of rows updated for that user', async () => {
    vi.mocked(markAllAsReadForUser).mockResolvedValue({ count: 5 });

    const result = await markAllAsRead('user-1');

    expect(markAllAsReadForUser).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ updatedCount: 5 });
  });
});
