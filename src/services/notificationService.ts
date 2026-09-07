// Notification domain service (Agente 12 — Growth, Billing e Monetização de Uso).
//
// Resolves .agents/handoffs/onda-2/02-para-00-notificacoes-backend.md: replaces the 5 hardcoded,
// "Exemplo"-labeled notifications in components/Sidebar.tsx with a real, persisted, per-user
// notification feed.
//
// SCOPE OF THIS FIRST VERSION (deliberate, pragmatic choice — see the model comment directly
// above `model Notification` in prisma/schema.prisma and this agent's report):
//   - in-app only. `Notification` has no channel field (email/webhook) — every notification
//     created here is an in-app item. Email/webhook delivery is future work, gated on a schema
//     extension (see the handoff to Agente 01 this agent filed alongside this service).
//   - scoped by `userId`, not `tenantId`. `Notification` has no `tenantId` column. A `User`
//     belongs to exactly one `Tenant` (`User.tenantId`), so filtering by `userId` alone cannot
//     leak a notification across tenants *as long as* `userId` always comes from `req.user.id`
//     (never from a client-supplied payload/query param) — enforced in notification.controller.ts,
//     never relaxed here. This mirrors the existing Session/Metric/Setting per-user pattern in the
//     schema and is the same invariant AGENTS.md §16 item 12 (this agent's own LGPD
//     responsibility: "o sistema de notificações não vaze evento/dado de um tenant para o
//     e-mail/webhook de outro") requires — there is currently no email/webhook channel to leak
//     through, and in-app delivery is bound to the same tenant transitively via userId.
//
// GENERIC ENGINE, NOT A BILLING-ONLY ONE (this agent's own prompt, "Sistema de notificações"):
// `createNotification` below is the single entry point any domain can call to raise a
// notification for a user — it takes no billing-specific shape. billing.controller.ts calling it
// after a successful plan change is the *first* caller, not the *only* one: a future call site in
// 05 (incidente de chamada), 10 (alerta de infra) or 11 (alerta de supervisão) is a matter of
// importing this function and calling it with that user's id — no parallel notification system to
// build, per this agent's explicit instruction not to construct "uma versão só para billing e
// outra pro resto".
import { Notification } from '@prisma/client';
import {
  countUnreadForUser,
  createNotification as createNotificationRow,
  findNotificationsForUser,
  markAllAsReadForUser,
  markNotificationAsRead as markNotificationAsReadRow,
} from '../repositories/notificationRepository.js';

export interface NotificationSummary {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string; // ISO 8601
}

export interface NotificationsPage {
  items: NotificationSummary[];
  total: number;
  unreadCount: number;
}

export class NotificationNotFoundError extends Error {
  constructor(id: string) {
    super(`notificationService: notificação ${id} não existe para este usuário.`);
    this.name = 'NotificationNotFoundError';
  }
}

function mapNotification(notification: Notification): NotificationSummary {
  return {
    id: notification.id,
    title: notification.title,
    message: notification.message,
    isRead: notification.isRead,
    createdAt: notification.createdAt.toISOString(),
  };
}

// Generic creation entry point — see module doc above. `userId` must already be known-good
// (resolved from `req.user.id` at the call site, or from a trusted internal domain event), never
// taken from unvalidated external input.
export async function createNotification(input: {
  userId: string;
  title: string;
  message: string;
}): Promise<NotificationSummary> {
  const created = await createNotificationRow(input);
  return mapNotification(created);
}

// Paginated list for the NotificationCenter panel, plus the unread count the bell badge needs —
// both scoped strictly to `userId` (AGENTS.md §15/§16 item 12: filter applied here in the
// service/repository layer, never merely "remembered" in the controller or UI).
export async function listNotifications(
  userId: string,
  pagination: { page: number; pageSize: number }
): Promise<NotificationsPage> {
  const [[items, total], unreadCount] = await Promise.all([
    findNotificationsForUser(userId, pagination),
    countUnreadForUser(userId),
  ]);
  return { items: items.map(mapNotification), total, unreadCount };
}

// Marks one notification read, verifying ownership by userId first (repository returns null for a
// notification that does not exist OR belongs to a different user — same fallback, deliberately
// indistinguishable from the caller's point of view per AGENTS.md §15 "comportamento de fallback
// seguro, sem vazar se o recurso existe em outro tenant").
export async function markAsRead(id: string, userId: string): Promise<NotificationSummary> {
  const updated = await markNotificationAsReadRow(id, userId);
  if (!updated) throw new NotificationNotFoundError(id);
  return mapNotification(updated);
}

export async function markAllAsRead(userId: string): Promise<{ updatedCount: number }> {
  const result = await markAllAsReadForUser(userId);
  return { updatedCount: result.count };
}
