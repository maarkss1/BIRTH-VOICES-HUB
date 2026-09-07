import { Request, Response } from 'express';
import twilio from 'twilio';
import * as telephonyService from '../services/telephonyService.js';
import type { VoiceOverride } from '../services/workflowRuntimeService.js';
import { logger } from '../lib/logger.js';

const { VoiceResponse } = twilio.twiml;

// Twilio's own generated typings (`VoiceResponse.SayAttributes`) narrow `language`/`voice` to
// large-but-closed literal unions of names Twilio actually recognizes. `VoiceOverride` (see
// `.agents/handoffs/onda-6/04-para-05-voiceOverride-contrato.md`) only ever carries a value drawn
// from `workflowRuntimeService.ts`'s own `KNOWN_TWILIO_VOICE_NAMES` table — i.e. a genuine Twilio
// voice name — so this alias plus the narrowing casts in `sayOptionsFor` below just bridge two
// string types that are runtime-compatible by construction; it is not a blind `any`/`unknown`
// escape hatch.
type SayAttributes = Parameters<InstanceType<typeof VoiceResponse>['say']>[0];

function sendTwiml(res: Response, twiml: InstanceType<typeof VoiceResponse>) {
  res.type('text/xml').send(twiml.toString());
}

function gatherActionUrl(sessionId: string): string {
  return `/api/telephony/twilio/gather?sessionId=${encodeURIComponent(sessionId)}`;
}

/**
 * Builds the attributes for a `<Say>`/`<Gather><Say>` from an optional `voiceOverride` produced by
 * `prepareWorkflowTurn`/`resumeAfterTool` (see
 * `.agents/handoffs/onda-6/04-para-05-voiceOverride-contrato.md`). Falls back to the fixed
 * `pt-BR` default Twilio voice used everywhere else in this controller when no override is
 * present (no `voice` node reached yet, or its configured voice has no known Twilio mapping).
 */
function sayOptionsFor(voiceOverride?: VoiceOverride): SayAttributes {
  if (!voiceOverride) return { language: 'pt-BR' };
  return {
    language: (voiceOverride.language ?? 'pt-BR') as SayAttributes['language'],
    voice: voiceOverride.voice as SayAttributes['voice'],
  };
}

export async function incomingCallHandler(req: Request, res: Response) {
  const callSid = String(req.body.CallSid || '');
  const from = String(req.body.From || '');
  const to = String(req.body.To || '');

  const twiml = new VoiceResponse();
  const result = await telephonyService.startCall({ callSid, from, to });

  if (!result.configured) {
    twiml.say({ language: 'pt-BR' }, 'Este número ainda não está configurado para atendimento. Por favor, tente novamente mais tarde.');
    twiml.hangup();
    return sendTwiml(res, twiml);
  }

  const gather = twiml.gather({
    input: ['speech'],
    action: gatherActionUrl(result.sessionId),
    method: 'POST',
    language: 'pt-BR',
    speechTimeout: 'auto',
  });
  gather.say({ language: 'pt-BR' }, result.greeting);

  // Reached if the caller never speaks and Twilio falls through the <Gather> without redirecting.
  twiml.say({ language: 'pt-BR' }, telephonyService.messages.goodbye);
  sendTwiml(res, twiml);
}

/**
 * TwiML for a call we placed ourselves. Twilio requests this once the prospect picks up; the
 * session was created before dialing, so its id travels in the query string (the same trick the
 * gather flow uses) instead of being looked up by CallSid.
 */
export async function outboundCallHandler(req: Request, res: Response) {
  const sessionId = String(req.query.sessionId || '');
  const callSid = String(req.body.CallSid || '');
  const twiml = new VoiceResponse();

  const result = await telephonyService.startOutboundCall({ sessionId, callSid });

  if (!result.found) {
    logger.warn('Outbound TwiML requested for an unknown session', { sessionId, callSid });
    twiml.hangup();
    return sendTwiml(res, twiml);
  }

  const gather = twiml.gather({
    input: ['speech'],
    action: gatherActionUrl(sessionId),
    method: 'POST',
    language: 'pt-BR',
    speechTimeout: 'auto',
  });
  gather.say({ language: 'pt-BR' }, result.greeting);

  // Reached when the person never speaks — e.g. an answering machine picked up.
  twiml.say({ language: 'pt-BR' }, telephonyService.messages.goodbye);
  sendTwiml(res, twiml);
}

export async function gatherHandler(req: Request, res: Response) {
  const sessionId = String(req.query.sessionId || '');
  const speechResult = String(req.body.SpeechResult || '').trim();
  const twiml = new VoiceResponse();

  if (!sessionId) {
    twiml.say({ language: 'pt-BR' }, telephonyService.messages.goodbye);
    twiml.hangup();
    return sendTwiml(res, twiml);
  }

  if (!speechResult) {
    const gather = twiml.gather({
      input: ['speech'],
      action: gatherActionUrl(sessionId),
      method: 'POST',
      language: 'pt-BR',
      speechTimeout: 'auto',
    });
    gather.say({ language: 'pt-BR' }, telephonyService.messages.reprompt);
    twiml.say({ language: 'pt-BR' }, telephonyService.messages.goodbye);
    return sendTwiml(res, twiml);
  }

  const result = await telephonyService.handleTurn({ sessionId, speechResult });
  if (!result.found) {
    twiml.say({ language: 'pt-BR' }, telephonyService.messages.goodbye);
    twiml.hangup();
    return sendTwiml(res, twiml);
  }

  const sayOptions = sayOptionsFor(result.voiceOverride);

  // A published Studio `end` node is a real termination boundary. Do not create another Gather
  // after it; speak the final response once and close the call deterministically.
  if (result.shouldEnd) {
    twiml.say(sayOptions, result.reply);
    twiml.hangup();
    return sendTwiml(res, twiml);
  }

  const gather = twiml.gather({
    input: ['speech'],
    action: gatherActionUrl(sessionId),
    method: 'POST',
    language: 'pt-BR',
    speechTimeout: 'auto',
  });
  gather.say(sayOptions, result.reply);
  sendTwiml(res, twiml);
}

export async function statusCallbackHandler(req: Request, res: Response) {
  const callSid = String(req.body.CallSid || '');
  const status = String(req.body.CallStatus || '');
  const durationSeconds = Number(req.body.CallDuration || 0);

  try {
    if (callSid && status) {
      await telephonyService.endCall({ callSid, status, durationSeconds });
    }
  } catch (err) {
    logger.error('Failed to finalize call from status callback', err);
  }

  res.status(200).send();
}
