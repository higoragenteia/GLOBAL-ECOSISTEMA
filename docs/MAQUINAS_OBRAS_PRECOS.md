# Máquinas — Obras e Preços

Adicionado em 21/11/2026 ao Controle de Máquinas do GLOBAL ECOSISTEMA.

## O que foi adicionado

### Obras (onde o material está)

- Novo menu **Obras** na visão geral, ao lado dos menus existentes.
- Cadastro de obras/locais: criar, editar, inativar, reativar e excluir.
- A ficha do equipamento ganhou o campo **Obra / local** com seleção das obras
  cadastradas.
- A tabela, os cartões, a busca e a ficha exibem a obra do equipamento.
- Filtro por obra na tela de equipamentos.
- Regras: nomes duplicados são bloqueados; excluir obra só é permitido quando
  nenhum equipamento está vinculado; inativar mantém o vínculo dos
  equipamentos existentes.

### Preços (quanto em dinheiro de maquinários)

- Novo menu **Preços** com um preço por equipamento.
- Subtotal por equipamento = preço × quantidade total.
- **Total geral** de todos os equipamentos ativos e total do filtro.
- Filtro por categoria na tela de Preços.
- A ficha do equipamento também aceita o **Preço de compra (R$)**.
- O painel da visão geral mostra o **Patrimônio** total.

## Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `source-original/Maquinas.gs` | coleção `OBRAS`, colunas `OBRA_ID` e `PRECO_UNITARIO` em `EQUIPAMENTOS`, funções criar/editar/inativar/reativar/excluir obra, validação e gravação de obra/preço no equipamento |
| `supabase/functions/global-api/maquinas.js` | regenerado a partir do `.gs` |
| `supabase/functions/global-api/index.ts` | ações `criarObra`, `editarObra`, `inativarObra`, `reativarObra`, `excluirObra` no `writeNames.maquinas` |
| `dist/maquinas.html` | menus Obras e Preços, cadastro de obras, select de obra e preço na ficha, filtros e total |
| `database/maquinas-obras.sql` | migração idempotente da estrutura |
| `tests/global.test.js` | testes de obras, preços, permissões e integridade da interface |

## Banco (Supabase)

Execute `database/maquinas-obras.sql` e publique a Edge Function `global-api`:

```bash
# SQL Editor do Supabase: database/maquinas-obras.sql
supabase functions deploy global-api --no-verify-jwt --yes
```

A migração:

1. cria a coleção `OBRAS` (`ID`, `NOME`, `ATIVO`, `CRIADO_EM`, `ATUALIZADO_EM`);
2. adiciona `OBRA_ID` e `PRECO_UNITARIO` em `EQUIPAMENTOS` (registros existentes
   ficam sem obra e com preço zero; podem ser editados depois).

Nenhum dado real é incluído na migração.

## Limpeza da interface (21/11/2026)

- Removido o menu **Usuários** do Controle de Máquinas: contas e permissões são
  administradas no painel central do GLOBAL ECOSISTEMA.
- Removido o botão **Instalar aplicativo** do menu lateral e todo o fluxo de
  instalação PWA do app.
- Ajuda reescrita sem as instruções de instalação; permanecem atualização de
  dados, permissões, histórico/exclusão e recuperação de senha.
- Removidas as opções **Sair do sistema** e **Alterar minha senha** deste
  módulo; sessão e senha são gerenciadas no painel central.
- A foto de perfil continua sendo exibida no topo do módulo, igual à do
  painel; apenas a opção de clicar para trocar/baixar a foto foi desativada
  nesse módulo.
- Tema visual do módulo alterado para **preto com laranja** (#F06020): fundo
  preto profundo, cartões escuros, botões e destaques em laranja com brilhos
  sutis. Os demais módulos e o painel mantêm o visual anterior.

## Status live (21/11/2026)

- `database/maquinas-obras.sql` aplicado no Supabase (coleção `OBRAS` criada e
  colunas `OBRA_ID`/`PRECO_UNITARIO` adicionadas; 164 registros preservados).
- `global-api` redeployada com as novas funções.
- Teste live com usuário temporário: bootstrap com `obras`, criação de obra,
  bloqueio de duplicidade, vínculo de obra e preço no equipamento, bloqueio de
  exclusão com vínculo, restauração do equipamento e exclusão da obra.
- Frontend publicado no GitHub Pages (workflow 44977138620); produção idêntica
  ao `dist/` local e já com os menus Obras e Preços.

## Testes

- `npm test`: 25 testes, incluindo criação/renomeação/exclusão de obra,
  vínculo de obra ao equipamento, bloqueio de duplicidade/exclusão com
  vínculos, gravação de preço e bloqueio para perfil de consulta.
- Teste de interface em Chromium com backend simulado: menu Obras, criação de
  obra, menu Preços, total geral e filtro por categoria, select de obra e campo
  de preço na ficha — sem erros de console.
