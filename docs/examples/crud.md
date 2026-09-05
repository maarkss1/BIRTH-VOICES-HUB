# Basic CRUD Operations Example (Node.js/fetch)

This example demonstrates reading, writing, and deleting the tenant's Workflow. Note there is
exactly one `Workflow` per tenant (`GET/POST/PUT/DELETE /workflow`, singular) — there is no
`/workflows` collection endpoint.

```javascript
const API_URL = 'http://localhost:5001/api';
const TOKEN = 'your_jwt_token'; // Obtain this via POST /auth/login

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TOKEN}`,
};

async function saveWorkflow(name) {
  const response = await fetch(`${API_URL}/workflow`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, nodes: [], edges: [] }),
  });
  return response.json(); // { success: true, workflow }
}

async function getWorkflow() {
  const response = await fetch(`${API_URL}/workflow`, { headers });
  return response.json(); // { workflow: Workflow | null }
}

async function updateWorkflow(name) {
  const response = await fetch(`${API_URL}/workflow`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ name }),
  });
  return response.json(); // { success: true, workflow } — 404 if none exists yet
}

async function deleteWorkflow() {
  const response = await fetch(`${API_URL}/workflow`, { method: 'DELETE', headers });
  return response.json(); // { success: true, message }
}
```

Every other resource in the API follows the same shape (`GET`/`POST`/`PUT`/`DELETE` on a plural
path, e.g. `/call-logs`, `/sessions/{id}`, `/agents/{id}`) — see `docs/api/openapi.yaml` for the
full, audited list of paths and their request/response schemas.
