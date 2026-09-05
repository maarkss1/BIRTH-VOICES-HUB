import { test, expect } from '@playwright/test';

// Covers AGENTS.md bloqueador #2 (vazamento cross-tenant) at the real HTTP boundary of the
// compiled build. `__tests__/tenant-isolation.test.ts` already proves this at the
// service/repository layer with mocks; this spec proves the same invariant end-to-end through the
// actual session cookie + route + controller + repository wiring, using two real tenants created
// via the public registration flow.
const ORIGIN = 'http://127.0.0.1:3000';
const mutationHeaders = { Origin: ORIGIN };

test('a user from tenant A can never read or list an agent created in tenant B', async ({ request }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = 'E2E-Strong-Password-2026';

  // Tenant A creates an agent.
  const registerA = await request.post('/api/auth/register', {
    headers: mutationHeaders,
    data: { email: `e2e-tenantA-${unique}@birthvoices.test`, password, companyName: `E2E Tenant A ${unique}` },
  });
  expect(registerA.status()).toBe(200);

  const createAgent = await request.post('/api/agents', {
    headers: mutationHeaders,
    data: { name: `Agente Tenant A ${unique}`, model: 'gemini' },
  });
  expect(createAgent.status()).toBe(200);
  const { agent } = await createAgent.json() as { agent: { id: string } };
  expect(agent.id).toBeTruthy();

  await request.post('/api/auth/logout', { headers: mutationHeaders });

  // Tenant B is a completely separate organization.
  const registerB = await request.post('/api/auth/register', {
    headers: mutationHeaders,
    data: { email: `e2e-tenantB-${unique}@birthvoices.test`, password, companyName: `E2E Tenant B ${unique}` },
  });
  expect(registerB.status()).toBe(200);

  // Direct lookup by id must not confirm the resource exists in another tenant (404, not a
  // generic 403 that would still leak existence, and never the actual agent payload).
  const crossTenantGet = await request.get(`/api/agents/${agent.id}`);
  expect(crossTenantGet.status()).toBe(404);
  const crossTenantBody = await crossTenantGet.json() as { agent?: unknown };
  expect(crossTenantBody.agent).toBeUndefined();

  // Tenant B's own list must never contain tenant A's agent.
  const listB = await request.get('/api/agents');
  expect(listB.status()).toBe(200);
  const { agents } = await listB.json() as { agents: Array<{ id: string }> };
  expect(agents.some((a) => a.id === agent.id)).toBe(false);
});
