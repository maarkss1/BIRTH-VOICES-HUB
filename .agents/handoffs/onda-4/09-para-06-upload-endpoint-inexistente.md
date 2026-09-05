- De: Agente 09 (SDK, Contratos e Documentação de API)
- Para: Agente 06 (Integrações Externas — Object Storage, Antivírus)
- Onda: 4
- Status: aberto
- Prioridade: normal

## Problema

Ao auditar `docs/api/openapi.yaml` contra `src/routes/**`, encontrei `docs/examples/uploads.md`
(meu, já corrigido nesta onda) documentando um endpoint `POST /uploads` que **não existe em
nenhuma rota real**. Busquei por todo `src/**` (`grep -rln "objectStorage" src/`) e confirmei que
`src/infrastructure/objectStorage.ts` e `src/infrastructure/antivirus.ts` só são importados um
pelo outro — nenhum controller/rota os expõe publicamente hoje. A infraestrutura de upload
(pré-signed URL S3/MinIO + varredura ClamAV) existe e está pronta, mas não está conectada a
nenhum caminho HTTP que um cliente da API possa efetivamente chamar.

Não é um bloqueador (não existe um caminho de upload real hoje para violar o bloqueador #10 de
`AGENTS.md`) — é só uma lacuna de produto/feature que a documentação revelou. Já corrigi a
documentação (não há mais menção a um `/uploads` fictício), mas não posso implementar a rota em
si (fora da minha propriedade de arquivos).

## Arquivo(s) envolvido(s)
- `docs/examples/uploads.md` (meu, já corrigido)
- `src/infrastructure/objectStorage.ts`, `src/infrastructure/antivirus.ts` (seus, prontos e não
  utilizados por nenhuma rota)
- Precisaria de: uma rota/controller/service que aceite `multipart/form-data`, rode
  `antivirus.ts#scanBufferForViruses` antes de qualquer persistência, e use `objectStorage.ts`
  para o upload final — se e quando isso for priorizado.

## Alteração necessária
Nenhuma ação obrigatória nesta onda. Se/quando um endpoint de upload público for implementado,
me avise por handoff (`06-para-09-...`) para eu documentar em `docs/api/openapi.yaml` e
`docs/examples/uploads.md` e regenerar o SDK.

## Teste esperado
N/A (informativo).

## Contexto adicional
Nenhum dado sensível foi exposto por essa lacuna — o gap é a ausência de uma feature, não uma
falha de segurança em uma feature existente.
