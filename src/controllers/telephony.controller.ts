import { Request, Response } from 'express';
import twilio from 'twilio';
import * as telephonyService from '../services/telephonyService.js';
import type { TransferDetails, VoiceOverride } from '../services/workflowRuntimeService.js';
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

type DialAttributes = Parameters<InstanceType<typeof VoiceResponse>['dial']>[0];

/**
 * Builds the attributes for the `<Dial>` a `TransferDetails` (see
 * `.agents/handoffs/onda-6/04-para-05-transferDetails-contrato.md`) produces. `timeoutSec`/
 * `record` are already validated/defaulted on the runtime side (Agente 04) — this only maps them
 * onto Twilio's own attribute names/values (`record: true` → the `'record-from-answer'` TwiML
 * value; `false` omits the attribute, matching Twilio's own default of not recording).
 */
function dialOptionsFor(transferDetails: TransferDetails): DialAttributes {
  return {
    timeout: transferDetails.timeoutSec,
    record: transferDetails.record ? 'record-from-answer' : undefined,
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

  // A published `human_handoff` node (see
  // `.agents/handoffs/onda-6/04-para-05-transferDetails-contrato.md`) has no workflow resumption —
  // a real telephony bridge takes over the call, so this speaks `transferDetails.message` and
  // dials `transferDetails.to` for real instead of opening another `<Gather>`, regardless of
  // `result.shouldEnd` (the runtime always reports `false` there since it never marks the workflow
  // itself "ended" on a transfer — see the contract doc).
  if (result.transferDetails) {
    twiml.say(sayOptions, result.reply);
    twiml.dial(dialOptionsFor(result.transferDetails), result.transferDetails.to);
    // No `action` URL: Twilio simply ends the `<Response>` once the `<Dial>` attempt finishes
    // (answered-and-hung-up, no-answer, busy, or failed all behave the same way here) — there is
    // no path back into the workflow after a transfer. Returning to the original conversation on a
    // failed/unanswered transfer (via `action` + a `DialCallStatus` callback route) is a real
    // telephony UX improvement, deliberately not implemented in this round — see
    // `.agents/handoffs/onda-6/05-para-00-transfer-dial-outcome-followup.md`.
    return sendTwiml(res, twiml);
  }

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
