# Workflows Example

There is exactly one `Workflow` per tenant (single-flow model) — `POST /workflow` (singular)
creates/saves it, there is no `/workflows` collection endpoint. See
`docs/patterns/workflow-execution-contract.md` for the real `nodes`/`edges` shape per node type
and the publish/validation gate; the example below uses a minimal, schema-accurate `start` → `end`
graph instead of illustrative node types that do not exist in the platform (`trigger`/`action`).

```javascript
const API_URL = 'http://localhost:5001/api';
const TOKEN = 'your_jwt_token';

async function saveWorkflow() {
  const payload = {
    name: 'Customer Onboarding Workflow',
    nodes: [
      {
        id: 'node-1',
        type: 'start',
        position: { x: 50, y: 300 },
        data: { label: 'Início', category: 'trigger', config: { channel: 'Telefone', language: 'pt-BR' } },
      },
      {
        id: 'node-2',
        type: 'end',
        position: { x: 450, y: 300 },
        data: { label: 'Fim', category: 'terminal', config: {} },
      },
    ],
    edges: [{ id: 'edge-1', source: 'node-1', target: 'node-2' }],
  };

  const response = await fetch(`${API_URL}/workflow`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  return response.json(); // { success: true, workflow: Workflow }
}

// A saved workflow starts as `status: "draft"`. It only becomes executable by the real phone
// runtime after a separate, explicit publish call that runs server-side validation:
async function publishWorkflow() {
  const response = await fetch(`${API_URL}/workflow/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
  });

  if (response.status === 422) {
    const { error, issues } = await response.json();
    throw new Error(`Publish rejected: ${error} — ${JSON.stringify(issues)}`);
  }

  return response.json(); // { success: true, workflow: Workflow } with status: "active"
}
```
