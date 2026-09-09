import express from 'express';
import authRoutes from './auth.routes.js';
import workflowRoutes from './workflow.routes.js';
import callLogRoutes from './callLog.routes.js';
import onboardingRoutes from './onboarding.routes.js';
import brandColorRoutes from './brandColor.routes.js';
import voiceRuntimeRoutes from './voiceRuntime.routes.js';
import voiceOutboundRoutes from './voiceOutbound.routes.js';
import metricsRoutes from './metrics.routes.js';
import sessionRoutes from './session.routes.js';
import settingsRoutes from './settings.routes.js';
import agentRoutes from './agent.routes.js';
import organizationRoutes from './organization.routes.js';
import userRoutes from './user.routes.js';
import aiRoutes from './ai.routes.js';
import observabilityRoutes from './observability.routes.js';
import auditLogRoutes from './auditLog.routes.js';
import billingRoutes from './billing.routes.js';
import notificationRoutes from './notification.routes.js';
import apiKeyRoutes from './apiKey.routes.js';
import webhookEndpointRoutes from './webhookEndpoint.routes.js';
// atlasgrRoutes is intentionally NOT mounted here — it is a server-to-server webhook
// (authenticated by shared secret, not by session cookie) and is mounted directly in server.ts
// before csrfProtection, the same way telephonyRoutes is. See server.ts for the rationale.

const router = express.Router();

router.use(authRoutes);
router.use(workflowRoutes);
router.use(callLogRoutes);
router.use(onboardingRoutes);
router.use(brandColorRoutes);
router.use(voiceRuntimeRoutes);
router.use(voiceOutboundRoutes);
router.use(metricsRoutes);
router.use(sessionRoutes);
router.use(settingsRoutes);
router.use(agentRoutes);
router.use(organizationRoutes);
router.use(userRoutes);
router.use(aiRoutes);
router.use(observabilityRoutes);
router.use(auditLogRoutes);
router.use(billingRoutes);
router.use(notificationRoutes);
router.use(apiKeyRoutes);
router.use(webhookEndpointRoutes);

export default router;
