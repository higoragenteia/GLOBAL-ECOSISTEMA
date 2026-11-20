# GLOBAL ECOSISTEMA — GVG&ARTEFAL

Painel integrado em migração de Google Sheets/Apps Script para PostgreSQL e Supabase. Repositório público `higoragenteia/GLOBAL-ECOSISTEMA`. O sistema original e seu domínio continuam intactos.

> Este repositório está público no GitHub. Não adicione dados reais de clientes,
> veículos, fornecedores, pessoas, fotos, credenciais ou IDs de planilhas.
> O histórico anterior também deve ser revisado antes de qualquer divulgação.

## Estado em 20/11/2026

- Pedidos: catálogo, carrinho, histórico, conferência e gestão da réplica Supabase existente.
- Gastos: 11 lançamentos, orçamentos por mês/pessoa, ajustes, cadastros, auditoria e relatórios da interface original.
- Fornecedores: 24 fornecedores, 18 produtos, 17 cotações, históricos de preços/ações; compras, relatórios e backup JSON pelo novo backend.
- Máquinas: 50 equipamentos, 12 categorias, 19 colaboradores, 23 empréstimos, 27 movimentos e 2 manutenções. Regras de estoque, entrega, devolução, transferência e manutenção preservadas.
- **Frotas: interface original completa integrada ao painel**, com SSO Supabase, backend próprio e importação única da planilha histórica. Interface atualizada para a v199 do repositório `gvg-artefal` (commit `e844395`), com as fotos oficiais de alta qualidade restauradas para os veículos cadastrados. Migração, funções e importação aplicadas no Supabase e frontend completo publicado no domínio em 20/11/2026. Ver `docs/FROTAS_INTEGRACAO.md` e `docs/ANALISE_FROTAS_VERSOES_2026-11-20.md`.

Publicação oficial: https://global-ecosistema.higoragenteia.chatgpt.site . O endereço foi atualizado para a identificação oficial GLOBAL ECOSISTEMA. A hospedagem oferece domínio próprio; o domínio atual só deve ser transferido depois da conclusão e homologação.

## Identidade e acesso

Supabase Auth é a fonte única de credenciais. O cadastro compartilhado continua na tabela `pedidos_usuarios`, agora com `permissoes` por módulo. Superadministrador tem acesso aos cinco módulos; Admin recebe acesso por aplicativo; Operador pode visualizar/operar os aplicativos liberados. Operador não pode receber GERENCIAR no formulário central. Todas as chamadas validam o token e o status atual do perfil no servidor.

As contas e senhas antigas dos outros apps não foram copiadas. Não são compatíveis diretamente com Supabase Auth. Os novos usuários devem cadastrar-se ou ser criados/aprovados pelo Superadministrador no painel. A conta Supabase do Higor foi preservada. Colaboradores de Máquinas são dados operacionais, não contas de login.

## Persistência e compatibilidade

Pedidos mantém suas tabelas próprias `pedidos_*` e RPCs de criação/conferência. Gastos, Fornecedores, Máquinas e Frotas usam registros JSONB individuais em `global_registros`, identificados por módulo/coleção/ordem, e metadados em `global_colecoes`. Há índice GIN para consulta de campos JSONB. Não há gravação ou leitura operacional de Sheets; o Frotas só consulta a planilha na importação administrativa única.

`source-original/` preserva a origem e `scripts/build-global.py` gera as regras de negócio do servidor com substituição de identidade e persistência. `records.js` adapta chamadas de linhas/colunas em memória para os registros PostgreSQL, preservando os contratos da interface. É uma camada de transição: as leituras carregam a base do módulo e as escritas substituem as coleções alteradas. Não é ainda uma remodelagem relacional específica por entidade; com crescimento significativo deve-se migrar para consultas paginadas e atualizações por registro.

Uma escrita passa por `global_aplicar`: revisão otimista, todos os registros/histórico na mesma transação e identificador de operação persistido para evitar duplicação em reenvios. Conflitos concorrentes pedem atualização, sem sobrescrever dados. As tabelas têm RLS e acesso direto negado a anon/authenticated. Somente Edge Functions autenticadas usam service_role. O aviso RLS sem políticas é intencional neste modelo. A proteção de senhas vazadas do Supabase permanece com o ajuste preexistente; ver https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .

As datas de Gastos foram convertidas dos números de série do Sheets para ISO preservando a data exibida. Imagens e arquivos locais da interface foram copiados. Fotos antigas do Pedidos ainda usam URLs da origem; não apagar a pasta original do Drive.

## Desenvolvimento e publicação

- `python3 scripts/build-global.py`: gera os três módulos do servidor.
- `python3 scripts/build-frotas.py`: gera `frotas.html` a partir da interface original, trocando o transporte Apps Script pelo adaptador Supabase.
- `python3 scripts/patch-panel.py`: aplica patches idempotentes do Frotas no painel existente, sem regenerar o snapshot antigo.
- `python3 scripts/build-frontend.py`: atualiza o painel e o Frotas em `dist/`, preservando as páginas já publicadas de Gastos/Fornecedores/Máquinas (os snapshots antigos não devem sobrescrevê-las).
- `npm test`: testes de regras de negócio, permissões, importação e integração do Frotas.
- `database/global.sql`, `database/global-permissoes.sql` e `database/frotas.sql`: estrutura, permissões e módulo Frotas.
- `database/importacao/*-records.json`: cópia de dados usada na migração; sem sessões, senhas ou códigos de recuperação. **Não adicionar dados do Frotas aqui.**
- Edge Functions: `global-api`, `pedidos-api` e `frotas-api`, com autenticação explícita por `auth.getUser` (gateway JWT desativado para permitir o preflight e o cadastro pendente no Pedidos).
- A importação do Frotas exige o segredo `FROTAS_SHEET_ID` no Supabase; o ID da planilha não é versionado. O botão de importação só aparece para GERENCIAR e grava backup/auditoria.
- `.openai/hosting.json` mantém a publicação de revisão privada existente. `dist/` contém somente frontend público.

Não reexecutar os seeds em uma base já importada. Novas gravações na origem após a cópia não são sincronizadas automaticamente. Antes da virada do domínio, conciliar as alterações feitas durante a homologação.

Nunca incluir a chave de serviço, senhas, IDs de planilha ou dados reais no frontend ou repositório. O repositório está público; tornar privado antes de publicar qualquer conteúdo operacional é recomendado.

## Verificação

Passaram os 21 testes locais (`npm test`), incluindo os 10 preexistentes de Pedidos/Gastos/Fornecedores/Máquinas e 11 novos de Frotas: importação gviz, adaptador, permissões, CRUD, auditoria e integridade estática. O parser também leu a planilha real (13 abas, 87 registros). O teste de fumaça em Chromium headless (`npm run test:ui`) passou nos fluxos GERENCIAR, VISUAL, deep link, sem sessão e painel + iframe + logout. **No Supabase live** foram aplicados `database/frotas.sql`, deployadas `frotas-api` e `global-api`, configurado `FROTAS_SHEET_ID` e executada a importação (13 coleções, 87 registros, backup e auditoria). Também passaram, com sessão real: bootstrap, criação/exclusão de registro, bloqueio de escrita para VISUAL, bloqueio de exclusão para OPERAR, métrica do painel e interface Frotas/painel + iframe. O usuário temporário de teste foi removido. O frontend foi publicado no domínio (workflow 44713873183) e os arquivos de produção conferem com o `dist/` local. A validação de FCM em dispositivo físico **não foi executada**.

A limpeza antiga dos objetos alheios ao Pedidos foi concluída antes desta implementação; a configuração dos schemas expostos foi corrigida para `public,graphql_public`. A estrutura de Frotas está definida em `database/frotas.sql`, mas ainda não foi aplicada no ambiente live.
