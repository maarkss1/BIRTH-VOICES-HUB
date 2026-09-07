# JavaScript / TypeScript SDK

`@birth-voices/sdk` (`packages/sdk/`) is generated directly from `docs/api/openapi.yaml` via
`swagger-typescript-api` — it is **not** a hand-written client, and it is **not published to a
registry** today (there is no publish step in `.github/workflows/**`; it exists as an npm
workspace package, `packages/*`, consumed from inside this monorepo or built and copied by
whoever needs it). The class is `Api`, grouped into one property per OpenAPI tag
(`auth`, `workflows`, `workflowCollaboration`, `callLogs`, `agents`, `ai`, `telephony`,
`webhooks`, `health`, …) — method names follow `swagger-typescript-api`'s
`operationId`-from-path convention (`workflowList`, `workflowCreate`, `agentsList`,
`agentsCreate`, `chatCreate`, …), not a hand-designed fluent API.

## Regenerating

```bash
cd packages/sdk
npm run generate   # runs swagger-typescript-api against ../../docs/api/openapi.yaml -> src/Api.ts
npm run build      # tsc; prebuild already runs generate
```

`src/Api.ts` is fully generated (`@ts-nocheck`, "THIS FILE WAS GENERATED" banner at the top) —
never hand-edit it, the next `npm run generate` overwrites it silently. If you need
non-generated helpers (retry wrapper, a friendlier constructor, pagination helpers), add them in
a separate file in `packages/sdk/src/` that imports from `Api.ts` — `swagger-typescript-api` only
ever writes `Api.ts`, so a sibling file survives regeneration untouched.

## Initializing the Client

```typescript
import { Api } from '@birth-voices/sdk';

const api = new Api({
  baseUrl: 'https://api.birthvoiceshub.com/api', // or http://localhost:5001/api locally
  securityWorker: (token) =>
    token ? { headers: { Authorization: `Bearer ${token}` } } : {},
});
api.setSecurityData('your_jwt_or_access_token');
```

## Example Usage (TypeScript)

### Reading the tenant's workflow

```typescript
async function fetchWorkflow() {
  const { data } = await api.workflows.workflowList();
  console.log(data.workflow?.name ?? '(no workflow saved yet)');
}
```

Note: there is exactly one `Workflow` per tenant today (`GET /workflow`, singular) — there is no
`GET /workflows` collection endpoint. See `docs/patterns/workflow-execution-contract.md` for the
`nodes`/`edges` shape and the publish/validation gate.

### Listing agents

```typescript
async function listAgents() {
  const { data } = await api.agents.agentsList();
  console.log(data.agents.map((a) => a.name));
}
```

### Placing an outbound call

```typescript
async function callLead(agentId: string, targetNumber: string) {
  const { data } = await api.voiceOutbound.outboundCreate({ agentId, targetNumber });
  console.log('queued as', data.sessionId);
  // The conversation's outcome arrives later via the `agent.call.ended` webhook —
  // see docs/webhooks/index.md — not as a return value of this call.
}
```

### Reading the caller's effective permissions

```typescript
async function whoAmI() {
  const { data } = await api.auth.getAuth();
  // permissions is resolved live server-side (never trusted from the JWT) — use it only to
  // decide what to show in the UI. Every permission-gated action is still enforced
  // authoritatively server-side; do not treat this array as an authorization check.
  console.log(data.user?.role, data.user?.permissions);
}
```

### Paging the audit trail (admin-only)

```typescript
async function listAuditLog(page = 1) {
  const { data } = await api.auditLog.auditLogList({ page, pageSize: 20 });
  console.log(`page ${data.page}/${data.totalPages}`, data.items?.length, 'of', data.total);
}
```

## Current limitations (honest state, not aspirational)

- **No automatic retries.** `swagger-typescript-api`'s generated `HttpClient` makes a single
  `fetch` per call; a caller that needs retry-on-429/5xx must wrap the call itself today.
- **Pagination exists on exactly one endpoint.** `GET /audit-log` is `page`/`pageSize`-paginated
  (`{items, page, pageSize, total, totalPages}`); every other list endpoint (`GET /agents`,
  `GET /call-logs`, etc.) still returns the tenant's full list — there is nothing else for the
  SDK to paginate yet.
- **Types come straight from the OpenAPI schemas**, which are intentionally loose on Prisma
  `Json` fields (`Workflow.nodes`/`edges`, `Agent.configuration`, `Session.metadata`) — see the
  schema `description` fields in `openapi.yaml` for why, and `docs/patterns/` for the real shape
  where one is documented.
