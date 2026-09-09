import express from 'express';
import { requireTenant } from '../middlewares/rbac.js';
import { createRateLimiter } from '../middlewares/rateLimit.js';
import {
  listNotificationsHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
} from '../controllers/notification.controller.js';

const router = express.Router();

// Notifications are a per-user feed, not an admin-only resource like /api/billing/* — any
// authenticated member of a tenant reads and manages only their own notifications (`requireTenant`
// establishes req.user/req.tenantId; no `requireRole` gate on top, unlike billing.routes.ts, since
// there is no elevated action here — a user can only ever touch their own rows, enforced in
// notificationService/notificationRepository, never trusted from the request).
// Additional per-IP limiter on top of server.ts's general 200 req/min — kept high enough for a
// NotificationCenter that legitimately polls, while still bounding a runaway/scripted client.
const notificationRateLimiter = createRateLimiter('notifications', 120, 60);

router.get('/notifications', requireTenant, notificationRateLimiter, listNotificationsHandler);
router.post('/notifications/:id/read', requireTenant, notificationRateLimiter, markNotificationReadHandler);
router.post('/notifications/read-all', requireTenant, notificationRateLimiter, markAllNotificationsReadHandler);

export default router;
