- De: Agente 00 (Coordenador)
- Para: Agente 04 (Voice Runtime, Motor de IA e Gateway)
- Onda: 6
- Status: aberto
- Prioridade: alta

## Contexto

Três achados adiados da Onda 5 ficam sob sua propriedade de arquivo. O Coordenador já decidiu a
direção de arquitetura para os dois que cruzavam domínio (evitando nova rodada de handoff só para
escolher opção) — implemente conforme especificado abaixo.

## Tarefa 1 — Nó `tool` no meio da chamada (era `04-para-05-tool-node-async-continuation.md`)

Decisão do Coordenador: **Opção B (continuação assíncrona)**, não a Opção A (`prepareWorkflowTurn`
virar `async`) — Opção B não quebra as ~3 asserções síncronas de `__tests__/workflowRuntimeService.test.ts`
(Agente 08, fora do seu escopo de edição), enquanto a Opção A exigiria coordenar edição simultânea
em três donos de arquivo diferentes.

Implementação esperada em `src/services/workflowRuntimeService.ts` (seu, exclusivo):
- `advanceUntilInteraction` (síncrono, já existente) continua exatamente como está para todo grafo
  que não passa por um nó `tool` fora do segmento inicial determinístico.
- Quando o próximo nó alcançado é `tool` e o turno não está mais no segmento inicial (ou seja, o
  caminho síncrono chegaria a um `tool` fora de `start -> ... -> primeira interação`), devolva um
  novo modo `mode: 'tool_pending'` em vez de cair no fallback atual — preserve o `state` suficiente
  para retomar depois (o mesmo `WorkflowRuntimeState` que `advanceUntilInteractionAsync` já usa).
- Exporte uma nova função `resumeAfterTool(state: WorkflowRuntimeState, node: WorkflowNode):
  Promise<PreparedWorkflowTurn>` que executa a chamada HTTP real do nó `tool` (reaproveitando
  `executeToolNodeAsync`/`HttpToolExecutor.ts`/o gate de consentimento já implementados na Onda 5)
  e então continua o avanço do grafo a partir do node seguinte, devolvendo o `PreparedWorkflowTurn`
  final (a próxima interação real, ou outro `tool_pending` se houver outro `tool` em sequência).
- `mode: 'tool_pending'` nunca deve ser devolvido por `advanceUntilInteraction` para chamadores que
  não sabem tratá-lo — só é seguro introduzir esse modo porque você vai escrever um handoff
  (`04-para-05-tool-pending-contrato.md`) descrevendo exatamente o contrato antes do Agente 05
  consumir (ver Onda 6, rodada 2 — o Coordenador vai disparar o Agente 05 depois que você terminar).
- Contrato de falha: igual ao já garantido — timeout/erro HTTP do `tool` nunca derruba a chamada,
  sempre degrada via `applyToolFallback` dentro de `resumeAfterTool` antes de continuar o grafo.

Teste esperado (adicione a `src/services/workflowRuntimeService.knowledgeTool.test.ts` ou novo
arquivo do mesmo padrão): um workflow `start -> question -> tool -> prompt` publicado, ao ser
avançado com `advanceUntilInteraction` até o `question`, e então com `resumeAfterTool` a partir do
`tool`, efetivamente chama a URL configurada com uma variável coletada no `question` anterior — hoje
isso cai direto no fallback, depois da sua mudança deve chamar de verdade.

## Tarefa 2 — Nó `voice`: proposta de design vira MVP (era `04-para-05-voice-human-handoff-design.md`)

Decisão do Coordenador: **Opção 1 do seu próprio handoff** (TTS nomeado do próprio Twilio, não
ElevenLabs+`<Play>`) — cobre menos da configuração do nó (`stability`/`clarity`/`speechRate` do
ElevenLabs ficam sem efeito), mas não introduz dependência de `objectStorage.ts`/cache/latência de
síntese extra nesta rodada. É um MVP que desbloqueia o nó — uma Onda futura pode migrar para
Opção 2 se o produto priorizar.

Implementação esperada:
- Estenda `PreparedWorkflowTurn` (seu tipo, `src/services/workflowRuntimeService.ts`) com um campo
  opcional `voiceOverride?: { voice: string; language?: string }` — resolvido a partir do nó `voice`
  mais próximo antes da próxima interação (mapeie `provider`/`voiceId` do nó Studio para um nome de
  voz Polly/Amazon suportado pelo Twilio; se não houver mapeamento conhecido, omita o campo — nunca
  invente um nome de voz).
- Remova `voice` de `UNSUPPORTED_REASON`/`SUPPORTED_TYPES` bloqueio — ele passa a ser executável
  (nó passivo: só define o override e segue para o próximo nó do grafo, não é uma interação em si).
- Documente em `docs/patterns/workflow-execution-contract.md` §3 que a implementação é TTS nomeado
  do Twilio (não a config completa de `stability`/`clarity`/`speechRate`), e que campos não
  suportados são ignorados silenciosamente (não é um erro de validação — não bloqueie `publish`).
- Escreva um handoff curto para o Agente 05 (`04-para-05-voiceOverride-contrato.md`) descrevendo o
  campo `voiceOverride` — ele consome em `telephony.controller.ts` (`twiml.say({voice: ...}, texto)`
  em vez do padrão fixo hoje usado). Não implemente o lado do Twilio você mesmo (fora do seu
  domínio).

## Tarefa 3 — Endpoint de upload para base de conhecimento (era `04-para-06-knowledge-upload-antivirus.md`, Onda 2)

Decisão do Coordenador sobre escopo (para evitar dependência nova sem aprovação — `package.json`
exige aprovação explícita do Coordenador, `AGENTS.md` §11): **sem `multer`/parsing de PDF/DOCX
nesta rodada.** Implemente como upload de texto simples via JSON (reaproveitando o
`express.json()` já montado em `server.ts`), não `multipart/form-data`:

- Novo endpoint `POST /api/agents/:id/knowledge/upload` em `knowledge.controller.ts` (seu,
  `AGENTS.md` não lista este arquivo como exclusivo de outro agente — já é seu domínio de fato, ver
  handoff original).
- Corpo: `{ name: string; keyword: string; fileName: string; contentBase64: string }`.
- Decodifique `contentBase64` para `Buffer`, chame `scanBufferForViruses(buffer, fileName)`
  (`src/infrastructure/antivirus.ts`, Agente 06, só leitura) **antes** de qualquer outra coisa.
  `InfectedFileError`/`AntivirusUnavailableError` → responda 422/503 respectivamente, nunca prossiga.
- Após scan limpo: decodifique o buffer como UTF-8 e valide que é texto plano/Markdown genuíno
  (heurística simples: rejeite se contiver um alto percentual de bytes não imprimíveis — um binário
  como PDF/DOCX real vai falhar essa checagem). Se não for texto válido, responda 422 com mensagem
  honesta ("apenas arquivos de texto simples (.txt, .md) são suportados nesta versão — PDF/DOCX
  ainda não têm pipeline de extração"). **Nunca finja extrair texto de um binário.**
- Se válido: mesmo caminho de `addKnowledgeDocumentHandler` (push em `config.knowledge`, `content` =
  texto decodificado).
- Rota nova em `src/routes/agent.routes.ts` (ou onde as rotas de `knowledge.controller.ts` já
  estiverem montadas) — sem rota nova em arquivo de outro dono.

Teste esperado: EICAR test string em base64 → rejeitado 422/503, nunca aparece em
`config.knowledge`. Texto `.md` válido → aparece em `config.knowledge` com o conteúdo correto.
Binário disfarçado de `.txt` (bytes não-UTF-8/não-imprimíveis) → rejeitado 422, nunca indexado.

## Validação obrigatória antes de eu integrar

`npx prisma generate && npm run typecheck && npm run lint && npx vitest run && npm run build` —
todos limpos. Documente em `.agents/handoffs/onda-6/04-para-00-*.md` (ou direto no PR, como preferir)
qualquer desvio necessário desta especificação.
