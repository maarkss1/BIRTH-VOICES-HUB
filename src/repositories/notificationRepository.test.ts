import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from '../lib/prisma.js';
import {
  createNotification,
  findNotificationByIdForUser,
  findNotificationsForUser,
  countUnreadForUser,
  markAllAsReadForUser,
  markNotificationAsRead,
} from './notificationRepository.js';

beforeEach(() => vi.clearAllMocks());

describe('notificationRepository.createNotification', () => {
  it('creates a row scoped to userId', async () => {
    vi.mocked(prisma.notification.create).mockResolvedValue({ id: 'notif-1' } as any);

    await createNotification({ userId: 'user-1', title: 'Título', message: 'Mensagem' });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', title: 'Título', message: 'Mensagem' },
    });
  });
});

describe('notificationRepository.findNotificationsForUser', () => {
  it('filters by userId, orders newest first, and paginates', async () => {
    vi.mocked(prisma.notification.findMany).mockResolvedValue([{ id: 'notif-1' }] as any);
    vi.mocked(prisma.notification.count).mockResolvedValue(1);

    const [items, total] = await findNotificationsForUser('user-1', { page: 2, pageSize: 10 });

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(prisma.notification.count).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(items).toEqual([{ id: 'notif-1' }]);
    expect(total).toBe(1);
  });
});

describe('notificationRepository.countUnreadForUser', () => {
  it('counts only isRead:false rows for the user', async () => {
    vi.mocked(prisma.notification.count).mockResolvedValue(3);

    const result = await countUnreadForUser('user-1');

    expect(prisma.notification.count).toHaveBeenCalledWith({ where: { userId: 'user-1', isRead: false } });
    expect(result).toBe(3);
  });
});

describe('notificationRepository.findNotificationByIdForUser', () => {
  it('scopes the lookup to id AND userId so a cross-user id resolves to null, not another user\'s row', async () => {
    vi.mocked(prisma.notification.findFirst).mockResolvedValue(null);

    const result = await findNotificationByIdForUser('notif-1', 'user-1');

    expect(prisma.notification.findFirst).toHaveBeenCalledWith({ where: { id: 'notif-1', userId: 'user-1' } });
    expect(result).toBeNull();
  });
});

describe('notificationRepository.markNotificationAsRead', () => {
  it('returns null without calling update when the notification does not belong to userId (tenant-isolation fallback)', async () => {
    vi.mocked(prisma.notification.findFirst).mockResolvedValue(null);

    const result = await markNotificationAsRead('notif-1', 'user-1');

    expect(result).toBeNull();
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('updates isRead:true by id once ownership is confirmed', async () => {
    vi.mocked(prisma.notification.findFirst).mockResolvedValue({ id: 'notif-1', userId: 'user-1' } as any);
    vi.mocked(prisma.notification.update).mockResolvedValue({ id: 'notif-1', isRead: true } as any);

    const result = await markNotificationAsRead('notif-1', 'user-1');

    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notif-1' },
      data: { isRead: true },
    });
    expect(result).toEqual({ id: 'notif-1', isRead: true });
  });
});

describe('notificationRepository.markAllAsReadForUser', () => {
  it('bulk-updates only the given user\'s unread notifications', async () => {
    vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 4 });

    const result = await markAllAsReadForUser('user-1');

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', isRead: false },
      data: { isRead: true },
    });
    expect(result).toEqual({ count: 4 });
  });
});
