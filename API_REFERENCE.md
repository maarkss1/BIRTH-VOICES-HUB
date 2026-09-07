# API Reference

Welcome to the Birth Voices Hub API reference. Our API is organized around REST. Our API has predictable resource-oriented URLs, accepts JSON-encoded request bodies, returns JSON-encoded responses, and uses standard HTTP response codes, authentication, and verbs.

## Base URL

All API requests should be made to the base URL of your deployed environment.
Locally: `http://localhost:5001/api`

## Authentication

The API uses JWT (JSON Web Tokens) for authentication.
Tokens must be passed in the `Authorization` header as a Bearer token.

```http
Authorization: Bearer <your_token>
```

## Detailed Specifications

For comprehensive details on endpoints, request parameters, response schemas, and examples, please consult the generated specifications:

- [OpenAPI Specification (docs/api/openapi.yaml)](./docs/api/openapi.yaml) — the source of truth; audited directly against `src/routes/**`.
- [Postman Collection (docs/api/postman_collection.json)](./docs/api/postman_collection.json)
- [Insomnia Workspace (docs/api/insomnia_workspace.json)](./docs/api/insomnia_workspace.json)
- [TypeScript SDK (packages/sdk/)](./packages/sdk) — generated from the OpenAPI spec above, see [docs/sdk/index.md](./docs/sdk/index.md).

## Rate Limiting

The API implements Redis-backed rate limiting. Exceeding limits will result in a `429 Too Many Requests` response.

## Error Handling

The API returns standard HTTP status codes. Error responses generally follow this structure:

```json
{
  "error": "Error message description",
  "details": [] // Optional validation details
}
```
