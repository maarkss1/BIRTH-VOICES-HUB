import express, { Request, Response, NextFunction } from 'express';
import twilio from 'twilio';
import { incomingCallHandler, outboundCallHandler, gatherHandler, statusCallbackHandler, dialStatusHandler } from '../controllers/telephony.controller.js';
import { logger } from '../lib/logger.js';

const router = express.Router();

// Twilio webhooks post `application/x-www-form-urlencoded`, not JSON — the global express.json()
// parser in server.ts never sees this body, so this router parses its own.
router.use(express.urlencoded({ extended: false }));

// These endpoints are unauthenticated by the app's own JWT (Twilio is the caller, not a logged-in
// user) — instead, every request must carry a valid Twilio request signature. PUBLIC_BASE_URL must
// exactly match what's registered as the webhook URL in the Twilio console, so the signature
// (computed by Twilio against that exact URL) verifies correctly regardless of proxy headers.
function validateTwilioSignature(req: Request, res: Response, next: NextFunction) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const baseUrl = process.env.PUBLIC_BASE_URL;
  const signature = req.headers['x-twilio-signature'];

  if (!authToken || !baseUrl) {
    logger.error('Telephony webhook rejected: TWILIO_AUTH_TOKEN or PUBLIC_BASE_URL not configured');
    return res.status(503).send();
  }
  if (typeof signature !== 'string') {
    return res.status(403).send();
  }

  const fullUrl = `${baseUrl.replace(/\/$/, '')}${req.originalUrl}`;
  const isValid = twilio.validateRequest(authToken, signature, fullUrl, req.body);
  if (!isValid) {
    logger.warn('Telephony webhook rejected: invalid Twilio signature', { url: fullUrl });
    return res.status(403).send();
  }

  next();
}

router.post('/telephony/twilio/voice', validateTwilioSignature, incomingCallHandler);
router.post('/telephony/twilio/outbound', validateTwilioSignature, outboundCallHandler);
router.post('/telephony/twilio/gather', validateTwilioSignature, gatherHandler);
router.post('/telephony/twilio/status', validateTwilioSignature, statusCallbackHandler);
router.post('/telephony/twilio/dial-status', validateTwilioSignature, dialStatusHandler);

export default router;
