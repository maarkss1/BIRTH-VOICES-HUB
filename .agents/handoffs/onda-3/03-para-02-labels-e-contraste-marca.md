- De: Agente 03 (Design System e Acessibilidade)
- Para: Agente 02 (Produto, Navegação e UX)
- Onda: 3
- Status: aberto
- Prioridade: normal

## Problema
Auditoria de acessibilidade da Onda 3 encontrou dois padrões recorrentes em arquivos de propriedade
exclusiva do Agente 02 (`/AGENTS.md` §11: `Login.tsx`, `Register.tsx`, `Landing.tsx`). Não alterei
os arquivos diretamente — ver "Protocolo de falha fora do escopo" em
`.agents/prompts/03-design-a11y.md`.

### 1. `<label>` sem `htmlFor`/`id` nos formulários de autenticação
`Login.tsx` e `Register.tsx` são exatamente os formulários citados na minha missão de Onda 3
("labels associados a todo input... nos formulários de Onboarding/Preferences/Admin") — são o
primeiro contato de um usuário novo com o produto.

- `pages/Login.tsx` linhas ~65-72 (Email) e ~75-82 (Senha): `<label>` solto + `<input>`, sem
  `htmlFor`/`id`.
- `pages/Register.tsx` linhas ~69-77 (Nome da Empresa), ~80-87 (Email Profissional) e ~90-98
  (Senha): mesmo padrão.

Corrigi exatamente este problema em `components/design-system/index.tsx` (`Input`/`Textarea`/
`Select` agora usam `React.useId()` + `htmlFor`/`id` + `aria-invalid`/`aria-describedby`) — dá para
either (a) trocar os `<input>` brutos destas duas páginas pelo componente `Input` do design system
(reaproveitando o fix e ganhando `error`/`helperText` de graça), ou (b) só adicionar `htmlFor`/`id`
manualmente nesses 5 campos, se preferir não mudar a estrutura da página agora.

### 2. `bg-brand text-white` (contraste com cor de marca dinâmica)
Este produto é white-label por tenant (`brandColor.controller.ts`/`useSessionStore.setBrandColor`),
então um `text-white` fixo sobre `bg-brand` falha o contraste WCAG (4.5:1) sempre que um tenant
escolhe uma cor de marca clara. Corrigi esse padrão dentro de `components/design-system/**`
(`Button`, `Badge`, `Avatar`, `CommandPalette`) e também em `components/Sidebar.tsx` (não é meu, mas
o fix ali era uma troca de cor 100% visual, sem lógica — coberto pelo protocolo de "correção trivial
fora do escopo"). Fiquei fora dos arquivos abaixo por serem de propriedade exclusiva sua com mudança
um pouco menos trivial (formulário de auth ainda não montado/logado, então não dá pra usar
`useSessionStore` da mesma forma direta que usei no Sidebar sem verificar o fluxo de branding
pré-login):

- `pages/Login.tsx` linha ~87 (botão "Entrar"): `bg-brand ... text-white`.
- `pages/Register.tsx` linha ~103 (botão "Criar conta"/submit): `bg-brand ... text-white`.
- `pages/Landing.tsx` linha ~518 (bolha de chat do usuário na demo) e linha ~940 (case de uso ativo
  no carrossel): `bg-brand text-white`.

A função pronta para reaproveitar é `getAccessibleTextOnBrand(brandColor)` em
`components/design-system/tokens.ts` — importa a cor de marca atual (via `useSessionStore` quando
aplicável, ou o valor de `--brand-color` computado, dependendo se a tela já tem uma tenant
identificada ou ainda está no fluxo de marketing/pré-login) e escolhe `#ffffff`/`#000000` com
contraste mínimo de ~4.58:1 garantido matematicamente para qualquer cor. Ver os testes em
`components/design-system/tokens.test.ts` para exemplos (inclusive com uma cor de marca não-padrão
bem clara, o caso que realmente quebra `text-white` fixo).

## Arquivo(s) envolvido(s)
- `pages/Login.tsx`
- `pages/Register.tsx`
- `pages/Landing.tsx`

## Alteração necessária
Ver os dois itens acima, por arquivo.

## Teste esperado
- `screen.getByLabelText('Email')` / `getByLabelText('Senha')` / `getByLabelText('Nome da Empresa')`
  / `getByLabelText('Email Profissional')` devem resolver os inputs corretos em
  `Login.tsx`/`Register.tsx`.
- Um teste de contraste (mesmo padrão de `tokens.test.ts`) para o botão de submit com uma cor de
  marca não-padrão clara, se este fluxo já ler `brandColor` de algum lugar antes do login.

## Contexto adicional
Nenhum destes itens é bloqueador de release. Achados de severidade moderada (os campos continuam
utilizáveis, o problema é robustez para leitor de tela e para tenants com marca clara).
