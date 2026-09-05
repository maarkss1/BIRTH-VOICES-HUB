# Webhook Receiver Example (Express.js)

This example shows how to set up an endpoint to receive and verify webhooks from Birth Voices
Hub. See `docs/webhooks/index.md` for the full event catalog, payload envelope, and signature
details — this file only shows a minimal working receiver. `agent.call.ended` and
`call.completed` are the only events actually emitted today; `workflow.completed` and
`contact.onboarded` are planned, not yet sent by any code path.

```javascript
const express = require('express');
const crypto = require('crypto');
const app = express();

const WEBHOOK_SECRET = 'your_configured_webhook_secret'; // WEBHOOK_SIGNING_SECRET on the server

// Important: we need the raw body to compute the HMAC signature accurately — JSON.parse followed
// by JSON.stringify can reorder keys and produce a string that no longer matches.
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-birthvoices-signature'];

  if (!signature) {
    // If WEBHOOK_SIGNING_SECRET is unset server-side, events are sent unsigned and this header
    // is absent — decide deliberately whether your receiver accepts that in your environment.
    return res.status(400).send('Missing signature');
  }

  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(req.body).digest('hex');
  const received = Buffer.from(String(signature), 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');

  // Length check first: timingSafeEqual throws on a length mismatch rather than returning false.
  const valid = received.length === expectedBuf.length && crypto.timingSafeEqual(received, expectedBuf);
  if (!valid) {
    return res.status(401).send('Invalid signature');
  }

  // Parse the verified JSON
  const event = JSON.parse(req.body.toString());

  console.log(`Received verified event: ${event.type}`);

  // Handle specific events — see docs/webhooks/index.md for the full payload shape of each.
  if (event.type === 'agent.call.ended') {
    console.log('Call outcome:', event.data.outcome, 'context:', event.data.context);
  } else if (event.type === 'call.completed') {
    console.log('Voice-runtime session ended:', event.data);
  }

  // Acknowledge receipt immediately (2xx response) — a non-2xx or a timeout (5s) triggers
  // exponential-backoff retries, up to 5 attempts, then the Dead Letter Queue.
  res.status(200).send('OK');
});

app.listen(3000, () => console.log('Webhook receiver listening on port 3000'));
```
