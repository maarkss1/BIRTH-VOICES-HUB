import { test, expect } from '@playwright/test';

// Covers AGENTS.md bloqueador #1 (bypass de RBAC em rota administrativa) at the real HTTP
// boundary of the compiled build — not a mocked middleware unit test. `POST /api/users` is
// `requireRole(['admin'])`; a non-admin member of the same tenant must be refused, not merely
// hidden in the UI.
const ORIGIN = 'http://127.0.0.1:3000';
const mutationHeaders = { Origin: ORIGIN };

test('a non-admin user is refused an admin-only action (POST /api/users), not just hidden in the UI', async ({ request }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const adminEmail = `e2e-rbac-admin-${unique}@birthvoices.test`;
  const memberEmail = `e2e-rbac-member-${unique}@birthvoices.test`;
  const password = 'E2E-Strong-Password-2026';

  // The first user of a freshly registered tenant is always admin (see auth.spec.ts).
  const register = await request.post('/api/auth/register', {
    headers: mutationHeaders,
    data: { email: adminEmail, password, companyName: `E2E RBAC Tenant ${unique}` },
  });
  expect(register.status()).toBe(200);

  // Admin provisions a second, non-admin member of the same tenant.
  const createMember = await request.post('/api/users', {
    headers: mutationHeaders,
    data: { email: memberEmail, password, role: 'user' },
  });
  expect(createMember.status()).toBe(200);

  await request.post('/api/auth/logout', { headers: mutationHeaders });

  // Log in as the non-admin member.
  const memberLogin = await request.post('/api/auth/login', {
    headers: mutationHeaders,
    data: { email: memberEmail, password },
  });
  expect(memberLogin.status()).toBe(200);
  const memberSession = await (await request.get('/api/auth/me')).json() as { user?: { role?: string } };
  expect(memberSession.user?.role).toBe('user');

  // The non-admin member must be refused, not silently allowed, when calling an admin-only route.
  const deniedList = await request.get('/api/users');
  expect(deniedList.status()).toBe(403);

  const deniedCreate = await request.post('/api/users', {
    headers: mutationHeaders,
    data: { email: `e2e-rbac-blocked-${unique}@birthvoices.test`, password },
  });
  expect(deniedCreate.status()).toBe(403);
});
