import { Request, Response } from 'express';
import {
  listNotifications,
  markAllAsRead,
  markAsRead,
  NotificationNotFoundError,
} from '../services/notificationService.js';

const NOTIFICATIONS_DEFAULT_PAGE_SIZE = 20;
const NOTIFICATIONS_MAX_PAGE_SIZE = 100;

function parsePagination(rawPage: unknown, rawPageSize: unknown): { page: number; pageSize: number } {
  const page = Math.max(1, Number.parseInt(String(rawPage ?? '1'), 10) || 1);
  const pageSize = Math.min(
    NOTIFICATIONS_MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(String(rawPageSize ?? NOTIFICATIONS_DEFAULT_PAGE_SIZE), 10) || NOTIFICATIONS_DEFAULT_PAGE_SIZE)
  );
  return { page, pageSize };
}

// GET /api/notifications — paginated feed for the NotificationCenter panel, plus the unread count
// the bell badge needs. Scoped to `req.user!.id` — never a query/body param — so one user can
// never page through another user's (and therefore another tenant's, AGENTS.md §15/§16 item 12)
// notifications by changing an id in the request.
export async function listNotificationsHandler(req: Request, res: Response) {
  const { page, pageSize } = parsePagination(req.query.page, req.query.pageSize);
  const result = await listNotifications(req.user!.id, { page, pageSize });
  res.json({
    items: result.items,
    unreadCount: result.unreadCount,
    page,
    pageSize,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
  });
}

// POST /api/notifications/:id/read — marks one notification read. Ownership is verified inside
// notificationService/notificationRepository against req.user!.id; a notification belonging to
// another user resolves to the same 404 as one that does not exist at all (AGENTS.md §15 fallback
// convention — never reveal that a resource exists in someone else's account).
export async function markNotificationReadHandler(req: Request, res: Response) {
  try {
    const notification = await markAsRead(String(req.params.id), req.user!.id);
    res.json({ notification });
  } catch (err) {
    if (err instanceof NotificationNotFoundError) {
      return res.status(404).json({ error: 'Notificação não encontrada.' });
    }
    throw err;
  }
}

// POST /api/notifications/read-all — bulk "mark all as read" for the panel header action.
export async function markAllNotificationsReadHandler(req: Request, res: Response) {
  const result = await markAllAsRead(req.user!.id);
  res.json(result);
}
