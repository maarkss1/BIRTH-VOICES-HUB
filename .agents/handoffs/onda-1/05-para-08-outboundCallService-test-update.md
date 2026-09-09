- De: Agente 05 (Telefonia, Chamadas e Webhooks)
- Para: Agente 08 (QA, Testes e Segurança)
- Onda: 1
- Status: resolvido
- Prioridade: alto

## Problema

`outboundCallService.initiateOutboundCall` tinha uma race condition real de double-submit: a
verificação "já existe uma chamada ativa para este número?" (`findActiveOutboundSessionToNumber`)
e a criação da nova sessão (`createPhoneSession`) eram duas chamadas separadas ao banco. Duas
requisições quase simultâneas para o mesmo tenant+número (duplo clique no botão de ligar em
`Telephony.tsx`, ou um retry de automação após timeout sem saber se a primeira tentativa emplacou)
podiam ambas observar "nenhuma chamada em andamento" antes de qualquer uma delas escrever sua
própria sessão — e as duas discavam de verdade para o mesmo lead. Isso é exatamente o risco descrito
na minha missão da Onda 1 (item 3, `outboundCallService.ts`) e no bloqueador #11 de `/AGENTS.md`.

Corrigi isso dentro do meu escopo (`src/services/outboundCallService.ts`,
`src/repositories/sessionRepository.ts`) substituindo o padrão "check, depois create" por uma
única transação `Serializable` do Postgres via Prisma
(`sessionRepository.createOutboundPhoneSessionIfNoneInFlight`). Duas transações concorrentes que
tentem criar sessão para o mesmo tenant+número agora nunca podem as duas ler "livre": o Postgres
aborta uma delas com falha de serialização (Prisma `P2034`), que o serviço converte em
`DuplicateCallError` — o mesmo erro 409 que a UI/automação já tratava para o caso não concorrente.

Essa correção muda o contrato interno que `__tests__/outboundCallService.test.ts` mocka
(`sessionRepository.findActiveOutboundSessionToNumber` + `sessionRepository.createPhoneSession`
deixam de ser chamados por `initiateOutboundCall`; o novo caminho chama
`sessionRepository.createOutboundPhoneSessionIfNoneInFlight` uma única vez). Isso é uma mudança
estrutural inevitável — uma correção real de atomicidade não pode continuar sendo duas chamadas
mockadas independentemente, ela precisa virar uma. `__tests__/**` é propriedade exclusiva do
Agente 08 (`/AGENTS.md` seção 11), então não editei o arquivo — só rodei a suíte para confirmar
exatamente o que quebra e preparei a substituição pronta abaixo.

## Arquivo(s) envolvido(s)

- `__tests__/outboundCallService.test.ts` (edição necessária — só o Agente 08 pode editar)
- Referência (já corrigidos, não mexer): `src/services/outboundCallService.ts`,
  `src/repositories/sessionRepository.ts` (nova função `createOutboundPhoneSessionIfNoneInFlight`)

## Alteração necessária

Rodei `npx vitest run __tests__/outboundCallService.test.ts` após a correção: 5 de 7 testes falham,
todos pelo mesmo motivo — o mock do módulo não expõe mais `createOutboundPhoneSessionIfNoneInFlight`
(as duas funções antigas que ele mockava não são mais chamadas pelo service). Nenhuma lógica nova
ficou sem cobertura equivalente; é puramente atualização de mock + duas asserções + um teste novo
para o caminho de conflito.

Substituição sugerida, pronta para colar em `__tests__/outboundCallService.test.ts` (mantém a mesma
cobertura de comportamento de antes, mais um teste novo para a falha de serialização P2034):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../src/repositories/agentRepository.js', () => ({
  getAgent: vi.fn(),
}));

vi.mock('../src/repositories/sessionRepository.js', () => ({
  createOutboundPhoneSessionIfNoneInFlight: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock('../src/services/telephonyProvider.js', async () => {
  const actual = await vi.importActual<typeof import('../src/services/telephonyProvider.js')>(
    '../src/services/telephonyProvider.js',
  );
  return { ...actual, getTelephonyProvider: vi.fn() };
});

import { getAgent } from '../src/repositories/agentRepository.js';
import {
  createOutboundPhoneSessionIfNoneInFlight,
  updateSession,
} from '../src/repositories/sessionRepository.js';
import { getTelephonyProvider } from '../src/services/telephonyProvider.js';
import { TwilioNotConfiguredError } from '../src/services/twilioClient.js';
import {
  initiateOutboundCall,
  AgentNotFoundError,
  DuplicateCallError,
} from '../src/services/outboundCallService.js';

const mockGetAgent = vi.mocked(getAgent);
const mockCreateClaim = vi.mocked(createOutboundPhoneSessionIfNoneInFlight);
const mockUpdateSession = vi.mocked(updateSession);
const mockGetTelephonyProvider = vi.mocked(getTelephonyProvider);

const mockPlaceCall = vi.fn();
const mockAssertConfigured = vi.fn();

type Agent = Awaited<ReturnType<typeof getAgent>>;
type Session = NonNullable<Awaited<ReturnType<typeof createOutboundPhoneSessionIfNoneInFlight>>['session']>;

function agent(overrides: Partial<NonNullable<Agent>> = {}): NonNullable<Agent> {
  return {
    id: 'agent-1',
    tenantId: 'tenant-1',
    userId: null,
    name: 'Catarina SDR',
    model: 'gemini',
    configuration: {},
    phoneNumber: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as NonNullable<Agent>;
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    tenantId: 'tenant-1',
    userId: null,
    agentId: 'agent-1',
    channel: 'phone',
    status: 'active',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as Session;
}

function request(overrides: Partial<Parameters<typeof initiateOutboundCall>[0]> = {}) {
  return {
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    targetNumber: '+5511999998888',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertConfigured.mockImplementation(() => {});
  mockGetTelephonyProvider.mockReturnValue({
    name: 'test-provider',
    assertConfigured: mockAssertConfigured,
    placeCall: mockPlaceCall,
  });
  mockGetAgent.mockResolvedValue(agent());
  mockCreateClaim.mockResolvedValue({ session: session(), inFlight: false });
  mockPlaceCall.mockResolvedValue({ callId: 'CA999', status: 'queued', from: '+5511333333333' });
});

describe('outboundCallService.initiateOutboundCall', () => {
  it('rejects an agent belonging to another tenant without dialing', async () => {
    mockGetAgent.mockResolvedValue(null);

    await expect(initiateOutboundCall(request())).rejects.toBeInstanceOf(AgentNotFoundError);
    expect(mockPlaceCall).not.toHaveBeenCalled();
    expect(mockCreateClaim).not.toHaveBeenCalled();
  });

  it('refuses to dial a number that already has a call in flight', async () => {
    mockCreateClaim.mockResolvedValue({ session: null, inFlight: true });

    await expect(initiateOutboundCall(request())).rejects.toBeInstanceOf(DuplicateCallError);
    expect(mockPlaceCall).not.toHaveBeenCalled();
  });

  // The double-submit guard now lives in a Serializable DB transaction: two concurrent requests
  // for the same tenant+number can no longer both observe "free" — Postgres aborts the losing
  // transaction with a serialization failure (Prisma P2034) instead of letting it write a second
  // session. The service must treat that failure exactly like `inFlight: true`.
  it('treats a lost concurrent-transaction race (Prisma P2034) as a duplicate call, not a 500', async () => {
    mockCreateClaim.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict or a deadlock.', {
        code: 'P2034',
        clientVersion: '5.22.0',
      }),
    );

    await expect(initiateOutboundCall(request())).rejects.toBeInstanceOf(DuplicateCallError);
    expect(mockPlaceCall).not.toHaveBeenCalled();
  });

  it('does not create a session when the deployment cannot place calls', async () => {
    mockAssertConfigured.mockImplementation(() => {
      throw new TwilioNotConfiguredError('faltando TWILIO_FROM_NUMBER');
    });

    await expect(initiateOutboundCall(request())).rejects.toBeInstanceOf(TwilioNotConfiguredError);
    expect(mockCreateClaim).not.toHaveBeenCalled();
  });

  it('asks the provider to dial, threading the session id through for the media callback', async () => {
    const result = await initiateOutboundCall(request({ context: { name: 'João' } }));

    expect(result).toEqual({ sessionId: 'sess-1', callSid: 'CA999', status: 'queued' });
    expect(mockPlaceCall).toHaveBeenCalledWith({ to: '+5511999998888', sessionId: 'sess-1' });
  });

  it('claims the session with the call context and callback URL before dialing', async () => {
    await initiateOutboundCall(request({ context: { leadId: 'lead-9' }, callbackUrl: 'https://crm.example.com/hook' }));

    expect(mockCreateClaim).toHaveBeenCalledWith(
      'tenant-1',
      'agent-1',
      '+5511999998888',
      expect.objectContaining({
        direction: 'outbound',
        to: '+5511999998888',
        context: { leadId: 'lead-9' },
        callbackUrl: 'https://crm.example.com/hook',
      }),
    );
  });

  // Without this the status callback cannot resolve the session, and an unanswered call would
  // never be reported back to the caller.
  it('persists the call id and caller ID as soon as the provider accepts the call', async () => {
    await initiateOutboundCall(request());

    expect(mockUpdateSession).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({
        metadata: expect.objectContaining({ callSid: 'CA999', from: '+5511333333333' }),
      }),
    );
  });

  it('releases the session when the provider rejects the call, so the number is not blocked', async () => {
    mockPlaceCall.mockRejectedValue(new Error('provider: invalid destination'));

    await expect(initiateOutboundCall(request())).rejects.toThrow('provider: invalid destination');
    expect(mockUpdateSession).toHaveBeenCalledWith('sess-1', { status: 'failed' });
  });
});
```

## Teste esperado

`npx vitest run __tests__/outboundCallService.test.ts` com o arquivo acima deve passar 8/8 (os 7
testes originais reescritos para o novo mock, mais o novo teste de `P2034`). Já validei manualmente
(fora do arquivo de teste, por não poder editá-lo) que `initiateOutboundCall` com o novo código:
rejeita `inFlight: true` como `DuplicateCallError`; converte `PrismaClientKnownRequestError` com
`code: 'P2034'` em `DuplicateCallError`; e preserva todo o resto do comportamento (persistência do
`callSid`/`from`, liberação da sessão em caso de erro do provedor).

## Contexto adicional

- Não é possível fechar essa race 100% sem também considerar uma constraint de banco (índice único
  parcial em `Session` por `tenantId` + `status='active'` + `metadata->>'direction'='outbound'` +
  `metadata->>'to'`), que seria a defesa definitiva contra duplicidade mesmo sob falha do
  isolamento de aplicação. Isso exige mudança em `prisma/schema.prisma`/migração — fora do meu
  escopo (Agente 01). Não abri handoff separado para isso agora porque a transação `Serializable`
  já fecha a janela de corrida para o caminho real (uma única instância de app falando com um único
  Postgres, como é o deploy atual no Cloud Run); registrando aqui para o Coordenador decidir se vale
  a pena pedir a constraint como reforço de defesa em profundidade em onda futura.
- Rodei a suíte completa (`npm run test`) após a correção: **1 arquivo com falhas**
  (`__tests__/outboundCallService.test.ts`, 5/7 testes), 100% explicado por este handoff — nenhuma
  outra regressão. Todos os outros arquivos de teste (`telephonyService.test.ts`,
  `telephony.controller.test.ts`, `sessionRepository.test.ts`, e o restante da suíte) continuam
  verdes sem alteração.

## Resolução

Onda 3, Agente 08. Ao iniciar a Onda 3 (branch criada a partir de `integracao/onda-3`, que já
carrega as Ondas 1 e 2), `__tests__/outboundCallService.test.ts` já havia sido atualizado por commit
anterior à minha execução (`ee9f3f6`, mesclado antes desta onda) para mockar
`createOutboundPhoneSessionIfNoneInFlight` em vez do par antigo `findActiveOutboundSessionToNumber`
+ `createPhoneSession` — os 7 testes originais já passavam (`npm run test`: 288 passed, 1 skipped,
0 failed nesta execução; não há mais as 5 falhas registradas na Onda 1/2). Faltava apenas o teste
explícito do caminho de conflito de serialização do Postgres (`Prisma P2034`) pedido neste handoff.
Adicionei:
1. teste `treats a lost concurrent-transaction race (Prisma P2034) as a duplicate call, not a 500`
   — confirma que `PrismaClientKnownRequestError` com `code: 'P2034'` vira `DuplicateCallError`,
   não uma exceção genérica;
2. teste `propagates an unrelated database error instead of masking it as a duplicate call` — confirma
   que um erro de banco não relacionado ao P2034 não é silenciosamente convertido em duplicata;
3. limpeza dos mocks mortos (`createPhoneSession`, `findActiveOutboundSessionToNumber`) que não são
   mais chamados por `initiateOutboundCall` — mantê-los mockados sem uso mascarava o fato de que o
   contrato real do serviço já mudou.

`npx vitest run __tests__/outboundCallService.test.ts`: 9/9 testes verdes. Typecheck e lint limpos.

Achado secundário, fora do meu escopo: `findActiveOutboundSessionToNumber`
(`src/repositories/sessionRepository.ts`) não tem mais nenhum chamador em `src/` além da própria
definição — parece código morto pós-migração para `createOutboundPhoneSessionIfNoneInFlight`.
Registrado em `.agents/handoffs/onda-3/08-para-05-dead-code-sessionRepository.md` (prioridade
normal, não bloqueador) para o Agente 05 avaliar remoção.
