# UAT de Voz — Matriz de Homologação Real

Use esta matriz antes do primeiro go-live e novamente após mudanças de telefonia, workflow runtime, consentimento, providers ou webhooks.

## Pré-condições

- tenant UAT dedicado, sem dados de clientes reais;
- um agente UAT com número Twilio de teste;
- workflow publicado contendo `start → question → condition/switch → prompt/llm → end`;
- consentimento de IA configurado explicitamente para o tenant quando o cenário exigir provider externo;
- `BLAND_RECORD_CALLS=false` na rodada inicial;
- destino de webhook UAT controlado e capaz de registrar headers/body sem expor secrets;
- relógio do ambiente sincronizado e logs com correlation/session IDs.

## Evidência mínima por teste

Guardar apenas evidência não sensível:

- timestamp;
- session/call ID;
- tenant UAT;
- status final;
- provider usado;
- workflow/version;
- webhook recebido ou erro esperado;
- resultado PASS/FAIL.

Não copiar tokens, auth headers, números pessoais, prompts com PII ou transcript completo para issues públicas.

## Matriz

| ID | Cenário | Execução | Resultado esperado | Criticidade |
|---|---|---|---|---|
| V01 | Inbound válido | Ligar para o número Twilio associado ao agente UAT | Sessão criada uma vez, saudação correta, tenant correto | Crítica |
| V02 | Assinatura Twilio inválida | Reproduzir request sem assinatura válida em ambiente controlado | Request rejeitado, nenhuma sessão criada | Crítica |
| V03 | Outbound básico | Disparar chamada para número UAT permitido | Uma única chamada, session ligada ao tenant/agente correto | Crítica |
| V04 | Replay de CallSid | Reenviar callback/TwiML com o mesmo CallSid | Reutiliza sessão/saudação; não duplica transcript/workflow | Crítica |
| V05 | Question válida | Responder valor que atende regex | Variável salva e fluxo avança uma única vez | Alta |
| V06 | Question inválida | Responder fora da regex | Re-prompt; cursor não avança antes do limite | Alta |
| V07 | Condition verdadeira | Dar resposta que satisfaz condition | Branch verdadeira executada | Alta |
| V08 | Condition falsa/fallback | Dar resposta que não satisfaz condition | Branch fallback executada | Alta |
| V09 | Switch | Exercitar ao menos dois handles do switch | Roteamento determinístico para o handle correto | Alta |
| V10 | Nó end | Alcançar `end` | TwiML encerra chamada; sessão fica terminal | Crítica |
| V11 | Usuário desliga antes do fim | Encerrar ligação no meio | Status final coerente, sem worker preso/reprocessamento infinito | Alta |
| V12 | Silêncio/timeout | Permanecer em silêncio conforme janela configurada | Tratamento previsível, sem loop infinito | Alta |
| V13 | IA sem consentimento | Remover consentimento do tenant e provocar etapa LLM | Provider externo não recebe chamada; workflow não avança indevidamente | Crítica |
| V14 | Provider primário falha | Induzir indisponibilidade do provider primário em UAT | Fallback configurado assume e é reportado como provider real | Alta |
| V15 | Todos providers falham | Induzir falha total em UAT | Resultado indica `NONE`/falha real; nenhum sucesso/custo fictício | Crítica |
| V16 | Isolamento de tenant | Tenant A e Tenant B consultam sessões/workflows próprios | Nenhum dado cruza tenants | Crítica |
| V17 | Webhook final assinado | Finalizar chamada com callback configurado | Evento chega com assinatura HMAC válida e tenant correto | Crítica |
| V18 | Callback duplicado | Reenviar o mesmo callback AtlasGR/Bland | Segundo processamento vira no-op/duplicado; CRM não recebe duplicata | Crítica |
| V19 | Callback em processamento | Concorrência controlada do mesmo call ID | Uma execução detém lock; concorrente recebe resposta retryable | Alta |
| V20 | Falha CRM conhecida | Forçar destino AtlasGR a falhar em UAT | Lock liberado para retry; não marca como concluído | Alta |
| V21 | Gravação padrão | Executar chamada com `BLAND_RECORD_CALLS=false` | Nenhuma gravação ativada pelo Birth Voices | Crítica |
| V22 | Gravação sem aprovação | Tentar configurar recording sem approval gate | Preflight/deploy bloqueia antes de produção | Crítica |
| V23 | Login UAT público | Rodar `scripts/uat-public-smoke.mjs` | Health, login, sessão, tenant, workflow read e logout passam | Alta |
| V24 | CORS origem não autorizada | Request mutável com Origin fora da allowlist | Rejeitado/não recebe credenciais CORS | Alta |
| V25 | Health pós-release | Consultar `/api/health` depois da promoção | HTTP 2xx e status `ok`/`healthy` | Crítica |

## Fluxo funcional mínimo obrigatório

O primeiro release deve homologar uma conversa real contendo:

1. chamada recebida ou originada;
2. saudação;
3. pergunta com persistência de variável;
4. uma decisão `condition` ou `switch`;
5. uma resposta orientada por prompt/LLM;
6. término `end`;
7. persistência de sessão/transcript;
8. webhook final assinado;
9. consulta posterior no tenant correto.

## Critério de severidade

- **P0**: vazamento de tenant/PII/secret, chamada sem controle, autenticação quebrada, corrupção/perda de dados, deploy impossível de reverter.
- **P1**: fluxo principal de chamada quebrado, consentimento ignorado, idempotência falhando, webhook crítico duplicado/perdido, provider reportado incorretamente.
- **P2**: falha funcional com workaround, UX inconsistente, observabilidade incompleta sem impacto de segurança.
- **P3**: cosmético/documentação.

Go-live exige **zero P0 e zero P1**.

## Registro de execução

| Data/hora | SHA | Ambiente | IDs executados | PASS | FAIL | Responsável | Decisão |
|---|---|---|---|---:|---:|---|---|
|  |  | production-preflight/UAT |  |  |  |  | GO / NO-GO |
