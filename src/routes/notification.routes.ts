import express from 'express';
import { requireTenant } from '../middlewares/rbac.js';
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
router.get('/notifications', requireTenant, listNotificationsHandler);
router.post('/notifications/:id/read', requireTenant, markNotificationReadHandler);
router.post('/notifications/read-all', requireTenant, markAllNotificationsReadHandler);

export default router;
