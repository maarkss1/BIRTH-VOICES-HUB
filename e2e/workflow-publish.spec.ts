import { test, expect } from '@playwright/test';

// Covers AGENTS.md bloqueador #13 (Studio publicando/ativando workflow que não passou pelo
// ValidationEngine) at the real HTTP boundary of the compiled build. `__tests__/
// workflowPublishGate.test.ts` already proves this at the service layer; this spec proves the
// same invariant through the actual route + controller + service + repository wiring.
const ORIGIN = 'http://127.0.0.1:3000';
const mutationHeaders = { Origin: ORIGIN };

test('an invalid workflow (no start node) is refused publish; a valid one activates', async ({ request }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = 'E2E-Strong-Password-2026';

  const register = await request.post('/api/auth/register', {
    headers: mutationHeaders,
    data: { email: `e2e-workflow-${unique}@birthvoices.test`, password, companyName: `E2E Workflow Tenant ${unique}` },
  });
  expect(register.status()).toBe(200);

  // Invalid: a single dead-end node with no start node at all — ValidationEngine must reject it.
  const saveInvalid = await request.post('/api/workflow', {
    headers: mutationHeaders,
    data: {
      name: `E2E invalid workflow ${unique}`,
      nodes: [{ id: 'n1', type: 'prompt', data: { config: {} } }],
      edges: [],
    },
  });
  expect(saveInvalid.status()).toBe(200);

  const publishInvalid = await request.post('/api/workflow/publish', { headers: mutationHeaders });
  expect(publishInvalid.status()).toBe(422);
  const invalidBody = await publishInvalid.json() as { issues?: Array<{ id: string }> };
  expect(invalidBody.issues?.some((i) => i.id === 'err-no-start')).toBe(true);

  // The workflow itself must remain in `draft` — a rejected publish must never sneak the workflow
  // into `active`.
  const afterInvalidAttempt = await request.get('/api/workflow');
  const draftWorkflow = (await afterInvalidAttempt.json()) as { workflow?: { status?: string } };
  expect(draftWorkflow.workflow?.status).toBe('draft');

  // Valid: start -> end is the minimal graph the production telephony runtime can execute.
  const saveValid = await request.put('/api/workflow', {
    headers: mutationHeaders,
    data: {
      name: `E2E valid workflow ${unique}`,
      nodes: [
        { id: 'start-1', type: 'start', data: { config: {} } },
        { id: 'end-1', type: 'end', data: { config: {} } },
      ],
      edges: [{ id: 'e1', source: 'start-1', target: 'end-1' }],
    },
  });
  expect(saveValid.status()).toBe(200);

  const publishValid = await request.post('/api/workflow/publish', { headers: mutationHeaders });
  expect(publishValid.status()).toBe(200);
  const validBody = await publishValid.json() as { workflow?: { status?: string } };
  expect(validBody.workflow?.status).toBe('active');

  // A further structural edit must roll the now-active workflow back to `draft` (closes the
  // reopen-bypass called out in the Onda 2 report) rather than letting an unreviewed edit run in
  // production silently.
  const editAfterPublish = await request.put('/api/workflow', {
    headers: mutationHeaders,
    data: {
      nodes: [
        { id: 'start-1', type: 'start', data: { config: {} } },
        { id: 'prompt-1', type: 'prompt', data: { config: {} } },
        { id: 'end-1', type: 'end', data: { config: {} } },
      ],
      edges: [
        { id: 'e1', source: 'start-1', target: 'prompt-1' },
        { id: 'e2', source: 'prompt-1', target: 'end-1' },
      ],
    },
  });
  expect(editAfterPublish.status()).toBe(200);
  const editedBody = await editAfterPublish.json() as { workflow?: { status?: string } };
  expect(editedBody.workflow?.status).toBe('draft');
});
