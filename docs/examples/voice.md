# Voice Runtime Example

Real-time voice conversation happens over the telephony webhooks (Twilio-signed, not
JWT-authenticated — see `docs/api/openapi.yaml` → `Telephony` tag), not over a client-callable
REST endpoint. The one REST action a client actually triggers is **placing an outbound call**:
`POST /voice/outbound`. It returns as soon as the call is queued — the conversation itself and
its final outcome happen afterwards and are delivered asynchronously via the
`agent.call.ended` webhook (see `docs/webhooks/index.md`), not as the return value of this call.

```javascript
const API_URL = 'http://localhost:5001/api';
const TOKEN = 'your_jwt_token';

async function initiateVoiceCall(agentId, targetNumber) {
  const payload = {
    agentId,
    targetNumber, // E.164, e.g. "+5511999998888"
    context: { contactId: '12345' }, // echoed back on the agent.call.ended webhook
  };

  const response = await fetch(`${API_URL}/voice/outbound`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 202) {
    const { sessionId, callSid } = await response.json();
    console.log('Call queued', { sessionId, callSid });
    return;
  }

  // 400 invalid payload, 404 unknown agent, 409 duplicate in-flight call to this number,
  // 502 provider rejected the call, 503 outbound calling not configured on this deployment.
  const error = await response.json();
  throw new Error(error.error);
}
```

## Configuring the voice runtime

Per-tenant TTS/LLM/voice defaults are configured separately via
`GET/POST/PUT/DELETE /voice-runtime` (see `docs/api/openapi.yaml`) — they are read by the runtime
when a call starts, not passed on every outbound-call request.
