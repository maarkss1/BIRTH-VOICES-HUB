import { test, expect } from '@playwright/test';

// The webServer process (server.ts, via `process.loadEnvFile()`) loads `.env` itself when it
// starts; this test-runner process does not inherit that automatically since it's a separate
// Node process. Mirror the same load here so `process.env.ATLASGR_WEBHOOK_SECRET` below reflects
// what the running server actually enforces, without ever hardcoding a secret value in source.
try {
  process.loadEnvFile();
} catch {
  // No .env file in this environment (e.g. CI providing real env vars directly) — safe to ignore.
}

// `POST /api/webhook/atlasgr/outbound` is a server-to-server webhook mounted before
// `csrfProtection` (see AGENTS.md bloqueador #5 and `.agents/handoffs/onda-1/
// 06-para-00-csrf-bloqueia-webhooks-servidor-servidor.md`). This spec proves, against the real
// compiled build, that the route is reachable without an `Origin` header (so real AtlasGR traffic
// is never rejected by CSRF) while still requiring its own shared-secret authentication — the
// fail-closed contract from `.agents/handoffs/onda-1/06-para-00-...` and AGENTS.md bloqueador #3.
// Unit-level coverage of the payload/idempotency logic itself lives in
// `src/features/prospecting/routes/atlasgr.routes.test.ts` (Agent 06's own scope); this spec only
// proves the route is actually mounted and reachable end-to-end, which a fully-mocked unit test
// cannot.

test('rejects a request with no shared secret, and the rejection is never the CSRF error', async ({ request }) => {
  const res = await request.post('/api/webhook/atlasgr/outbound', {
    // Deliberately no Origin header — this is how the real AtlasGR CRM calls it.
    data: { lead_id: 'lead-e2e', name: 'Fulano', company: 'Acme', phone_number: '+5511999998888' },
  });

  expect(res.status()).toBe(401);
  const body = await res.json() as { error?: string };
  expect(body.error).not.toMatch(/Validação de origem/i);
});

test('rejects a request with a wrong shared secret the same way as a missing one', async ({ request }) => {
  const res = await request.post('/api/webhook/atlasgr/outbound', {
    headers: { 'x-atlasgr-webhook-secret': 'definitely-not-the-real-secret' },
    data: { lead_id: 'lead-e2e', name: 'Fulano', company: 'Acme', phone_number: '+5511999998888' },
  });

  expect(res.status()).toBe(401);
});

test('an authenticated but malformed payload is rejected with a validation error, not a 500', async ({ request }) => {
  // The webServer process (npm run start under NODE_ENV=e2e) loads the same .env this test
  // process does, so process.env here mirrors what the server actually enforces. If the local
  // environment has no ATLASGR_WEBHOOK_SECRET configured, the server correctly fails closed with
  // 503 before ever inspecting the payload (AGENTS.md: never accept a webhook whose secret isn't
  // configured) — either outcome proves the route is reachable pre-CSRF and never leaks past its
  // own authentication into an unhandled crash.
  const configuredSecret = process.env.ATLASGR_WEBHOOK_SECRET;
  const res = await request.post('/api/webhook/atlasgr/outbound', {
    headers: configuredSecret ? { 'x-atlasgr-webhook-secret': configuredSecret } : {},
    data: { unexpected_field: true },
  });

  if (configuredSecret) {
    expect(res.status()).toBe(400);
  } else {
    expect(res.status()).toBe(503);
  }
});
