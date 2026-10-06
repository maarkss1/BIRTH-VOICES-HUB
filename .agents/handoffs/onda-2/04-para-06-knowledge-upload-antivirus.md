- De: Agente 04 (Voice Runtime e Gateway de IA)
- Para: Agente 06 (Integrações Externas — Object Storage, Antivírus)
- Onda: 2
- Status: resolvido
- Prioridade: normal

## Problema
Minha missão da Onda 2 inclui: "garanta que ingestão de novo conteúdo de conhecimento passa por
verificação de antivírus/objeto seguro antes de indexar (handoff para 06 se o pipeline de upload
ainda não cobre esse caminho)".

Auditei o caminho real de ingestão de conhecimento (RAG) hoje:
- `pages/Dashboard/KnowledgeManager.tsx` tem um botão "Upload de Documentos" que **não está ligado
  a nenhum handler** — não faz upload de arquivo nenhum ainda (confirmei: sem `onClick`, sem
  `<input type="file">`).
- O único endpoint real de ingestão é `POST /api/agents/:id/knowledge`
  (`src/controllers/knowledge.controller.ts` → `addKnowledgeDocumentHandler`), que recebe
  `{ agentId, name, keyword, content }` como **texto simples no corpo JSON** — não há upload de
  arquivo/bytes em nenhum ponto do fluxo atual.

Como não existe hoje nenhum caminho que receba bytes de arquivo, `scanBufferForViruses`
(`src/infrastructure/antivirus.ts`, seu domínio) **não se aplica ainda** — não há nada para
escanear. Não há vazamento/bypass ativo hoje porque a superfície de upload em si não existe.

## Arquivo(s) envolvido(s)
- `pages/Dashboard/KnowledgeManager.tsx` (meu domínio — botão "Upload de Documentos" sem handler)
- `src/controllers/knowledge.controller.ts` (meu domínio — só aceita texto colado, não arquivo)
- `src/infrastructure/objectStorage.ts` / `src/infrastructure/antivirus.ts` (seu domínio)

## Alteração necessária
Quando um upload de arquivo real for implementado para a base de conhecimento (PDF, DOCX, etc.),
o fluxo precisa obrigatoriamente:
1. receber o arquivo, extrair o buffer;
2. chamar `scanBufferForViruses(buffer, filename)` **antes** de qualquer persistência em
   `objectStorage.ts` ou indexação no RAG — nunca depois, nunca opcional;
3. propagar `InfectedFileError`/`AntivirusUnavailableError` como 4xx/503 ao usuário, nunca engolir
   e seguir indexando um arquivo não verificado (a política "fail closed" já documentada em
   `antivirus.ts` deve valer aqui também).

Coordenação: o novo endpoint de upload de conhecimento provavelmente é implementado por mim
(Agente 04, dono de `knowledge.controller.ts`) chamando as funções que vocês expõem
(`scanBufferForViruses`, `objectStorage.ts`) — não peço que vocês implementem o endpoint, só
confirmo que a política de AV/object storage que vocês já implementaram na Onda 1 é o caminho
obrigatório assim que eu (ou outro agente) implementar esse upload.

## Teste esperado
- Quando o upload de arquivo for implementado: um arquivo infectado (EICAR test string) enviado a
  `POST /api/agents/:id/knowledge/upload` (ou equivalente) é rejeitado com 4xx e nunca aparece no
  RAG do agente.
- ClamAV indisponível → upload rejeitado (503), nunca aceito "sem escaneamento".

## Contexto adicional
Nenhuma ação sua é necessária agora — isto é um registro para garantir que a política de AV que
vocês implementaram na Onda 1 não seja esquecida quando o upload de arquivo for de fato
implementado. Não há bloqueador ativo hoje porque não há caminho de upload de arquivo funcional.

## Resolução (2026-09-21)
Implementado na Onda 6 e integrado no `main`:
1. Endpoint `POST /api/agents/:id/knowledge/upload` implementado em `src/controllers/knowledge.controller.ts` com validação de payload em base64 (`knowledgeUploadSchema`), decodificação em buffer e chamada obrigatória a `scanBufferForViruses(buffer, fileName)`.
2. Política fail-closed: `InfectedFileError` retorna HTTP 422 com detalhes da ameaça; `AntivirusUnavailableError` retorna HTTP 503 com `Retry-After: 60`.
3. Testes unitários completos cobrindo arquivo infectado (EICAR), scanner indisponível e arquivo íntegro em `src/controllers/knowledge.controller.test.ts`.
4. Conexão completa na UI em `pages/Dashboard/KnowledgeManager.tsx` com modal de upload, leitura em base64 e tratamento dos status 422/503. Testes de frontend implementados em `pages/Dashboard/KnowledgeManager.test.tsx`.

