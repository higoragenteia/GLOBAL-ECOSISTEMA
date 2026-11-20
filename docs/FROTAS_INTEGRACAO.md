# Frotas no GLOBAL ECOSISTEMA

Atualizado em 20/11/2026.

## O que foi integrado

O módulo **Frotas** deixou de ser uma página reduzida e passou a ser a interface
original completa, executada dentro do GLOBAL ECOSISTEMA. A versão de origem é o
commit `e844395` (v199) do repositório `gvg-artefal`; a análise completa está em
`docs/ANALISE_FROTAS_VERSOES_2026-11-20.md`.

- `source-original/FrotasIndex.html` preserva a tela original (layout, navegação,
  veículos, seguros, vencimentos, manutenções, documentos, KM, abastecimentos,
  pagamentos, relatórios, central de notificações, configurações e auditoria).
  As fotos reais que estavam embutidas por placa foram removidas do repositório
  público; a coleção `Fotos Veículos` e a ilustração genérica continuam sendo
  usadas pela interface.
- `frotas.html` é gerado por `scripts/build-frotas.py` a partir dessa tela.
  O gerador troca somente a camada de transporte (`google.script.run` → adaptador
  Supabase), os deep links e os textos de operação.
- `frotas-compat.js` mantém os contratos de `getBootstrap`, `getData`,
  `getTables`, `saveRecord`, `deleteRecord`, `getAudit`, `importarSheets` e das
  funções de conta usadas pela interface.
- `supabase/functions/frotas-api/index.ts` é o backend do módulo. Ele valida a
  sessão Supabase, a permissão central de Frotas, grava em `global_registros` e
  registra a auditoria em `global_auditoria`.
- `supabase/functions/frotas-api/import-data.js` lê a planilha histórica uma
  única vez, no servidor, e converte as abas para as coleções do Supabase.

O painel abre o Frotas na mesma origem (`./frotas.html`), com a sessão já
existente. Não há segundo login. O painel também aceita deep links
`?view=frotas&alerta=...` e o Frotas aceita `?alerta=...`.

## Permissões

A permissão vem de `pedidos_usuarios.permissoes.frotas` e é aplicada no servidor:

| Nível | Leitura | Criar/editar | Excluir | Importar | Auditoria |
| --- | --- | --- | --- | --- | --- |
| VISUAL | sim | não | não | não | não |
| OPERAR | sim | sim | não | não | não |
| GERENCIAR | sim | sim | sim | sim | sim |

`SUPERADMIN` recebe GERENCIAR. O backend mapeia os valores antigos `ADMIN` →
GERENCIAR e `OPERADOR` → OPERAR. Contas e senhas são administradas no painel
central; a tela de usuários do Frotas usa a API do painel e só aparece para
Superadministrador.

## Status da implantação

Em 20/11/2026, no projeto `krjudhqlpgdnjzrdmtyf`:

- `database/frotas.sql` aplicado com sucesso.
- `frotas-api` e `global-api` deployadas e ativas (`verify_jwt=false`).
- Segredo `FROTAS_SHEET_ID` configurado.
- Importação concluída: **13 coleções, 87 registros**, backup
  `c469174d-51cc-4753-98c1-fe5c59ea6472` e auditoria `IMPORTAR_FROTAS`.
- CRUD, permissões VISUAL/OPERAR/GERENCIAR, auditoria e métrica do painel
  validados com sessão real.
- Interface Frotas e painel + iframe validados em Chromium contra o Supabase
  real, sem erros de console.
- Usuário temporário de teste removido; nenhum registro de teste permaneceu.

A coleção pré-existente **`Notificações de Vencimentos`** (4 registros) foi
preservada. Ela não é usada pela interface atual e não é alterada pela
importação; uma limpeza futura pode ser avaliada separadamente.

## Banco e migração

1. Em uma base nova, execute `database/global.sql`.
2. Execute `database/frotas.sql`. Ele é idempotente: cria o módulo `frotas`,
   ajusta o check de `global_modulos` e define as 13 coleções com os cabeçalhos
   originais, incluindo abas vazias.
3. Nenhum dado de veículo, pessoa, foto por placa ou histórico é incluído no
   repositório.
4. A planilha de origem é configurada pelo segredo **`FROTAS_SHEET_ID`** no
   Supabase. O ID não fica no código. A importação lê o endpoint público gviz;
   use uma cópia de importação somente leitura e não publique a planilha
   operacional com dados sensíveis.

### Importação única

No painel, com um usuário GERENCIAR, abra Frotas e clique no botão **⇩** ao lado
do botão de atualização. A importação:

- busca as 13 abas no Google Sheets;
- aborta se qualquer aba falhar ou se `Base de Dados` vier sem veículos;
- grava um backup do estado anterior em `global_backups`;
- substitui as coleções do módulo em uma transação com revisão otimista;
- registra `IMPORTAR_FROTAS` em `global_auditoria`;
- não mantém dependência de Sheets em tempo de execução.

### Rollback da importação

Liste o backup mais recente:

```sql
select id, criado_em
from public.global_backups
where modulo = 'frotas'
order by criado_em desc
limit 5;
```

Restaure em uma transação (substitua o UUID do backup e o UUID de um
Superadministrador ativo):

```sql
do $$
declare
  b public.global_backups;
  s jsonb;
begin
  select * into b from public.global_backups where id = '00000000-0000-0000-0000-000000000000';
  if b.id is null then raise exception 'Backup não encontrado'; end if;
  select public.global_snapshot('frotas') into s;
  perform public.global_aplicar(
    'frotas',
    (s->>'revisao')::bigint,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'rollback-' || gen_random_uuid(),
    'RESTAURAR_BACKUP_FROTAS',
    b.conteudo->'colecoes',
    jsonb_build_object('ok', true, 'backup', b.id)
  );
end $$;
```

A restauração também gera auditoria. Antes de executar, confirme que o usuário
informado em `p_ator` existe, está ATIVO e é Superadministrador ou GERENCIAR em
Frotas.

## Implantação

```bash
# banco (SQL Editor do Supabase)
# database/global.sql  (somente base nova)
# database/frotas.sql

# segredo da planilha de importação
supabase secrets set FROTAS_SHEET_ID=<id-da-planilha>

# funções
supabase functions deploy frotas-api --no-verify-jwt
supabase functions deploy global-api --no-verify-jwt

# frontend
npm test
python3 scripts/build-frontend.py
```

O build atualiza painel e Frotas e **preserva** as páginas já publicadas de
Gastos/Fornecedores/Máquinas. Os snapshots desses módulos em `source-original/`
são anteriores a correções feitas no `dist/` e não devem ser usados para
sobrescrevê-las sem uma reconciliação separada.

Não publique em produção sem autorização e sem testar a importação em um
projeto Supabase de homologação.

### Depois da homologação

- Revogue ou restrinja a implantação antiga do Apps Script e o compartilhamento
  público da planilha operacional.
- Remova ou rotacione o segredo `FROTAS_SHEET_ID` depois que a importação não
  for mais necessária.
- Mantenha o repositório privado ou revise o histórico antes de publicá-lo; já
  existem dados de outros módulos em `database/importacao/`.

### Teste de interface (opcional)

```bash
npm install --no-save playwright
npx playwright install chromium
npm run test:ui
```

O teste sobe um servidor estático local, intercepta `frotas-api` e usa somente
uma fixture sintética. Ele não acessa o Supabase nem a planilha real.

## Testes executados nesta revisão

**PASSOU**

- `npm test`: 21 testes locais, incluindo:
  - leitura do envelope gviz, cabeçalhos de contingência, contagem e falha de aba;
  - contratos do adaptador para VISUAL/OPERAR/GERENCIAR;
  - geração de IDs, normalização de seguro, datas, valores e bloqueio de placa
    ausente/duplicada;
  - exclusão, importação, auditoria, senha e usuários pelo painel central;
  - integridade estática da página, da API e da migração;
  - os 10 testes preexistentes de Pedidos/Gastos/Fornecedores/Máquinas.
- Leitura real da planilha pelo parser, sem gravar dados: 13 abas e 87 registros
  retornados (6 veículos, 5 seguros, 4 vencimentos, 3 manutenções e históricos).
- `python3 scripts/build-frontend.py` gerou painel e `dist/` com Frotas.
- Verificação sintática com Node (`frotas-compat.js`) e esbuild
  (`frotas-api/index.ts` e `global-api/index.ts`).
- Teste de fumaça em Chromium headless (`npm run test:ui`, com `frotas-api` e
  `global-api` interceptadas e dados sintéticos):
  - GERENCIAR, VISUAL, deep link, sem sessão e painel + iframe + logout.
- **Testes live no Supabase real:**
  - migração aplicada;
  - `frotas-api` e `global-api` ativas;
  - importação 13/87 com backup e auditoria;
  - bootstrap autenticado;
  - criação e exclusão de registro de teste;
  - bloqueio de escrita para VISUAL;
  - bloqueio de exclusão para OPERAR;
  - auditoria de SALVAR/EXCLUIR;
  - métrica do painel retornando 6 veículos;
  - interface Frotas live com 6 veículos e tabela administrativa;
  - painel + iframe live com a mesma sessão, sem erros de console.

**FALHOU**

- Nenhuma falha nos testes executados.

**NÃO EXECUTADO**

- Publicar o frontend no domínio de produção (o `dist/` está pronto, mas o
  deploy estático não foi feito nesta revisão).
- Validar entrega de push/FCM em dispositivo físico.
- Revogar a implantação antiga do Apps Script e o compartilhamento público da
  planilha (recomendado após a virada).
- Revisar o histórico do repositório público e os dados preexistentes de outros
  módulos em `database/importacao/`.

## Firebase/FCM

O app externo `gvg-controle-de-frotas.web.app` e o gatilho diário do Apps Script
foram preservados. A interface Frotas continua exibindo a central de alertas e
oferece o link para ativar/gerenciar o dispositivo. O envio de push não foi
revalidado nesta máquina.
