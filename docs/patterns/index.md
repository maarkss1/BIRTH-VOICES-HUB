# Architecture Patterns

Birth Voices Hub strictly adheres to several software design patterns to maintain a clean, scalable codebase.

See also: [Workflow Execution Contract](./workflow-execution-contract.md) — the Studio ↔ Voice
Runtime contract for `Workflow.nodes`/`edges` (which node types execute for real, the
publish/validation gate, `StudioEdge` routing).

## Clean Architecture & Dependency Rules

Dependencies must point inward.
`Routes -> Controllers -> Services -> Repositories`

- **Repositories** know about Prisma and the Database.
- **Services** know about Repositories and Business Logic.
- **Controllers** know about Services and HTTP (Express, Req/Res).
- **Routes** know about Controllers and Middleware.

A Repository *must never* parse an Express `req` object. A Service *must never* return an HTTP 404 directly (it should throw an error or return null, which the Controller translates).

## SOLID Principles

- **Single Responsibility Principle (SRP)**: Each class/file should have one reason to change. Example: Data validation is done in Controllers (via Zod), not Services.
- **Dependency Inversion Principle (DIP)**: High-level modules (Services) should not depend on low-level modules (Repositories directly). They should depend on abstractions (interfaces). *Note: We currently use concrete Repository classes, but they are injected/imported at the top level to facilitate mocking.*

## Repository Pattern

All database access is centralized in Repository classes.
**Why?**
1. To enforce Multi-Tenancy (the `tenantId` is always required).
2. To allow mocking the database easily in Service unit tests.

## Controller Pattern

Controllers have a standard structure:
1. Validate input using Zod schemas.
2. Extract required data (including `req.user.tenantId`).
3. Call the appropriate Service method.
4. Format the output and return an HTTP response.
5. Catch errors and pass them to the global error handler via `next(error)`.

## Error Handling

Do not return `res.status(500)` manually scattered throughout the code. Throw semantic errors (e.g., `NotFoundError`, `UnauthorizedError`) and let the global Express error handler catch and format them.

## Logging & Observability

- Use structured logging (JSON format).
- Always include `tenantId` and `userId` in log contexts when available.
- For complex flows, implement OpenTelemetry spans to trace execution times.
