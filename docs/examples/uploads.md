# Uploads Example

**There is no generic file-upload REST endpoint today.** `src/infrastructure/objectStorage.ts`
(S3/MinIO pre-signed URLs) and `src/infrastructure/antivirus.ts` (ClamAV scanning) exist and are
used internally, but no route in `src/routes/**` currently accepts a multipart/binary upload and
wires it through antivirus scanning to object storage — grep for `objectStorage`/`antivirus`
usage across `src/` confirms both modules are only imported by each other, not by any controller.
A previous version of this document illustrated a fictitious `POST /uploads` endpoint; that
endpoint does not exist and calling it will 404.

## What exists instead: text-based knowledge documents

The only way to add content to an agent's knowledge base today is
`POST /agents/{id}/knowledge` — plain JSON with the document's text content, not a file upload:

```javascript
const API_URL = 'http://localhost:5001/api';
const TOKEN = 'your_jwt_token';

async function addKnowledgeDocument(agentId, name, keyword, content) {
  const response = await fetch(`${API_URL}/agents/${agentId}/knowledge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ agentId, name, keyword, content }),
  });

  return response.json(); // { success: true, message }
}
```

Matching is a keyword-based, in-memory simulation, not a real embeddings/vector search — see
`docs/ai/index.md` and `POST /agents/{id}/rag/test` in `docs/api/openapi.yaml`.

If your integration needs to upload an actual file (PDF, audio, image) and have it scanned and
stored, that capability is not exposed over the public API yet — this is a real product gap, not
a documentation gap, tracked for the domain owner of `src/infrastructure/objectStorage.ts`/
`antivirus.ts` (Agent 06) to wire a route to when prioritized.
