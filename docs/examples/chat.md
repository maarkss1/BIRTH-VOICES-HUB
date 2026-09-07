# Chat Example

`POST /chat` (the Playground endpoint) does not take a `sessionId` in the URL — there is no
`/chat/sessions/{sessionId}/messages` route today. It takes the whole message history in the
body and returns through `LLMGateway`'s provider-failover chain (see `docs/ai/index.md`).

```javascript
const API_URL = 'http://localhost:5001/api';
const TOKEN = 'your_jwt_token';

async function sendMessage(history, newUserMessage) {
  const currentMessages = [...history, { role: 'user', text: newUserMessage }];

  const response = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ currentMessages }),
  });

  if (!response.ok) {
    const { error } = await response.json();
    throw new Error(error);
  }

  const { text, providerUsed, blockedByConsent } = await response.json();
  if (blockedByConsent) {
    // No provider was ever called — tenant AI-provider consent has not been granted yet.
    console.warn('Blocked: AI-provider consent not granted for this tenant.');
  } else if (providerUsed === 'NONE') {
    console.warn('Every configured LLM provider failed for this request.');
  }
  console.log(`Reply (via ${providerUsed}):`, text);
  return text;
}
```

Note: `POST /chat` does not reject the request with `403` when consent is missing — `LLMGateway`
checks consent internally and returns `200` with `blockedByConsent: true` and a user-facing
explanation as `text`, without ever calling an external provider. Grant consent via
`POST /ai/consent`, `{ "granted": true }` — see the LGPD note in `docs/ai/index.md` and
`AGENTS.md` §16.
