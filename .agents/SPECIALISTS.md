# Especialistas internos adicionais — BIRTH-VOICES-HUB

O roster oficial 00–12 continua intacto. Estes perfis são especializações internas acionadas pelo Coordenador quando o trabalho cruza responsabilidades demais para um prompt genérico. Eles NÃO aumentam a concorrência: cada especialista ocupa o mesmo slot do agente-pai e nunca roda simultaneamente com ele.

## 10A — Runtime, Filas e Jobs
Pai: Agente 10 (Infraestrutura, Observabilidade e Deploy).

Justificativa: o repositório possui BullMQ/Redis em fila de áudio, auditoria, webhooks e scheduler de retenção. A confiabilidade de job assíncrono é um domínio transversal diferente de provisionar Cloud Run/infra.

## 01A — Privacidade, Consentimento e Retenção
Pai: Agente 01 (Plataforma, Segurança, Tenancy e Dados).

Justificativa: gravações, transcrições, contatos e envio de PII a provedores de IA exigem validação ponta a ponta de consentimento, retenção, exclusão e minimização. O perfil especializa a responsabilidade de LGPD já existente sem criar um novo dono de schema.

## Regra de propriedade
- 10A não toma posse de telefonia (05), Voice Runtime/IA (04), telemetria de UI (11) nem infraestrutura declarativa (10). Ele coordena a confiabilidade operacional das filas e entrega handoff ao dono do arquivo quando necessário.
- 01A não edita `prisma/schema.prisma` em paralelo com 01. Mudança de schema continua sendo executada pelo slot 01. O especialista audita o fluxo de dados e define requisitos/testes de privacidade.

Prompts: `.agents/prompts/10A-runtime-filas-jobs.md` e `.agents/prompts/01A-privacidade-consentimento-retencao.md`.