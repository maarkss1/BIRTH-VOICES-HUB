// Prisma access for the notification domain (Agente 12 — Growth, Billing e Monetização de Uso).
//
// Kept intentionally thin: every function here is a direct Prisma query/mutation with no business
// rules (ownership checks, DTO mapping) — that logic lives in `src/services/notificationService.ts`,
// which is the only caller of this file (Clean Architecture, AGENTS.md §2: Controller → Service →
// Repository, no Prisma access outside `src/repositories/**`).
//
// Every function here takes `userId`, never `tenantId`: `Notification` has no `tenantId` column
// (see the schema comment directly above `model Notification` in prisma/schema.prisma). Filtering
// by `userId` alone is tenant-safe *only* as long as callers always derive `userId` from
// `req.user.id` (never from a client-supplied payload) — the same invariant already documented
// there and enforced by notificationService/notification.controller, never repeated or relaxed
// here.
import { Notification, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export function createNotification(input: {
  userId: string;
  title: string;
  message: string;
}): Promise<Notification> {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      title: input.title,
      message: input.message,
    },
  });
}

export function findNotificationsForUser(
  userId: string,
  { page, pageSize }: { page: number; pageSize: number }
): Promise<[Notification[], number]> {
  const skip = (page - 1) * pageSize;
  return Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.notification.count({ where: { userId } }),
  ]);
}

export function countUnreadForUser(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

export function findNotificationByIdForUser(id: string, userId: string): Promise<Notification | null> {
  // `userId` is part of the where-clause itself (not checked after the fact) so a notification
  // belonging to another user resolves to `null` here — the same 404-not-403 fallback the
  // tenant-isolation convention elsewhere in the codebase uses, so a caller can never learn a
  // notification with that id merely exists for someone else (AGENTS.md §15).
  return prisma.notification.findFirst({ where: { id, userId } });
}

// `Notification`'s only unique field is `id`, so a Prisma `update` where-clause cannot also carry
// `userId` (no compound unique constraint exists for that per the schema) — ownership must be
// verified with a separate read first, same shape as findNotificationByIdForUser above. This is
// two round-trips instead of one atomic statement, but each is a single-row primary-key lookup and
// the alternative (encoding ownership into a raw query) would bypass Prisma's typed API for no
// real benefit here.
export async function markNotificationAsRead(id: string, userId: string): Promise<Notification | null> {
  const existing = await prisma.notification.findFirst({ where: { id, userId } });
  if (!existing) return null;
  return prisma.notification.update({ where: { id: existing.id }, data: { isRead: true } });
}

export function markAllAsReadForUser(userId: string): Promise<Prisma.BatchPayload> {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}
