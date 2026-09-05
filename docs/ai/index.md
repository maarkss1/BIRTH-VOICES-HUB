# AI Capabilities

Birth Voices Hub integrates deeply with AI providers to power intelligent agents and voice runtimes.

## Supported Providers

`lib/voice-runtime/providers/LLMGateway.ts` (`llmProviderGateway`) already implements multi-provider
failover, not a single-provider integration:

- **Google Gemini** (via `@google/genai`) — the guaranteed final fallback; every provider chain
  ends here regardless of the preferred provider requested.
- **OpenAI** — `https://api.openai.com/v1/chat/completions`, tried when requested as the
  preferred provider.
- **Anthropic (Claude)** — `https://api.anthropic.com/v1/messages`, tried when requested as the
  preferred provider.

Callers go through `llmProviderGateway.processRequest(text, preferredProvider, systemPrompt, tenantId)`
(see `POST /chat` in `docs/api/openapi.yaml`) and get back `providerUsed` plus
`allProvidersFailed`, so a client can tell which provider actually served the request.

**Known gap** (tracked in `docs/AUDIT.md`): most handlers in `src/controllers/ai.controller.ts`
(`generate-music`, `generate-video`, `video-status`, `ai/refactor`, `ai/generate-workflow`) call
`GoogleGenAI` **directly**, bypassing `LLMGateway` — so those specific endpoints have no
failover and depend solely on `GEMINI_API_KEY` being configured. Only `POST /chat` goes through
the full gateway today.

## Core Features

### Prompt Manager
Prompts are not hardcoded. They are managed dynamically in the database per Agent, allowing non-technical users to tweak system instructions without deploying code.

### Memory
Agents maintain conversational context (Memory) during active Sessions.
- **Short-term Memory**: Stored in Redis for active, fast-paced voice sessions.
- **Long-term Memory**: Summarized and stored in PostgreSQL (`Session.metadata`) when a session concludes.

### Retrieval-Augmented Generation (RAG)
Agents can be configured with a knowledge base (`POST /agents/{id}/knowledge` appends documents
to `AgentConfiguration.knowledge[]`), queryable via `POST /agents/{id}/rag/test`. **Today this is
an in-memory keyword-match simulation** (`lib/voice-runtime/intelligence/KnowledgeConfidenceEngine.ts`,
explicitly commented as a simulator in the source) — substring matching against `keyword`/
`content`, not a real embeddings/vector search. There is no `pgvector`/Qdrant integration yet
(tracked in `docs/AUDIT.md` §3.5). Every result carries `isLowConfidence`/`confidence`, and a
low-confidence snippet is prefixed with an explicit warning — callers must branch on
`isLowConfidence`, never infer certainty from `confidence` alone.

### Function Calling (Tools)
Agents can be given access to platform tools. For example, an Agent can decide to execute a "book_appointment" function during a conversation, which triggers a webhook to an external scheduling system.

### Streaming
To minimize latency (especially critical for the Voice Runtime), responses from the AI providers can be streamed chunk-by-chunk to the client or voice synthesizer.

### Voice Runtime
The Voice Runtime connects AI Agents to telephony or WebSocket clients. It handles:
- **Speech-to-Text (STT)**: Converting user audio to text.
- **Reasoning**: Routing text through the Agent.
- **Text-to-Speech (TTS)**: Converting Agent responses back to audio dynamically.
