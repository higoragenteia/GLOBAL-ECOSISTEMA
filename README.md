# GLOBAL ECOSISTEMA — GVG&ARTEFAL

Painel integrado em migração de Google Sheets/Apps Script para PostgreSQL e Supabase. Repositório privado `higoragenteia/GLOBAL-ECOSISTEMA` (anteriormente `higorteste`). O sistema original e seu domínio continuam intactos.

## Estado em 19/11/2026

- Pedidos: catálogo, carrinho, histórico, conferência e gestão da réplica Supabase existente.
- Gastos: 11 lançamentos, orçamentos por mês/pessoa, ajustes, cadastros, auditoria e relatórios da interface original.
- Fornecedores: 24 fornecedores, 18 produtos, 17 cotações, históricos de preços/ações; compras, relatórios e backup JSON pelo novo backend.
- Máquinas: 50 equipamentos, 12 categorias, 19 colaboradores, 23 empréstimos, 27 movimentos e 2 manutenções. Regras de estoque, entrega, devolução, transferência e manutenção preservadas.
- **Frotas não iniciado. Aguardar os pontos específicos do Higor antes de implementar.** O botão do novo painel informa essa pendência.

Publicação oficial: https://global-ecosistema.higoragenteia.chatgpt.site . O endereço foi atualizado para a identificação oficial GLOBAL ECOSISTEMA. A hospedagem oferece domínio próprio; o domínio atual só deve ser transferido depois da conclusão e homologação.

## Identidade e acesso

Supabase Auth é a fonte única de credenciais. O cadastro compartilhado continua na tabela `pedidos_usuarios`, agora com `permissoes` por módulo. Superadministrador tem acesso aos quatro módulos; Admin recebe acesso por aplicativo; Operador pode visualizar/operar os aplicativos liberados. Operador não pode receber GERENCIAR no formulário central. Todas as chamadas validam o token e o status atual do perfil no servidor.

As contas e senhas antigas dos outros apps não foram copiadas. Não são compatíveis diretamente com Supabase Auth. Os novos usuários devem cadastrar-se ou ser criados/aprovados pelo Superadministrador no painel. A conta Supabase do Higor foi preservada. Colaboradores de Máquinas são dados operacionais, não contas de login.

## Persistência e compatibilidade

Pedidos mantém suas tabelas próprias `pedidos_*` e RPCs de criação/conferência. Os demais módulos usam registros JSONB individuais em `global_registros`, identificados por módulo/coleção/ordem, e metadados em `global_colecoes`. Há índice GIN para consulta de campos JSONB. Não há gravação ou leitura operacional de Sheets.

`source-original/` preserva a origem e `scripts/build-global.py` gera as regras de negócio do servidor com substituição de identidade e persistência. `records.js` adapta chamadas de linhas/colunas em memória para os registros PostgreSQL, preservando os contratos da interface. É uma camada de transição: as leituras carregam a base do módulo e as escritas substituem as coleções alteradas. Não é ainda uma remodelagem relacional específica por entidade; com crescimento significativo deve-se migrar para consultas paginadas e atualizações por registro.

Uma escrita passa por `global_aplicar`: revisão otimista, todos os registros/histórico na mesma transação e identificador de operação persistido para evitar duplicação em reenvios. Conflitos concorrentes pedem atualização, sem sobrescrever dados. As tabelas têm RLS e acesso direto negado a anon/authenticated. Somente Edge Functions autenticadas usam service_role. O aviso RLS sem políticas é intencional neste modelo. A proteção de senhas vazadas do Supabase permanece com o ajuste preexistente; ver https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .

As datas de Gastos foram convertidas dos números de série do Sheets para ISO preservando a data exibida. Imagens e arquivos locais da interface foram copiados. Fotos antigas do Pedidos ainda usam URLs da origem; não apagar a pasta original do Drive.

## Desenvolvimento e publicação

- `python3 scripts/build-global.py`: gera os três módulos do servidor.
- `python3 scripts/build-frontend.py`: gera painel e rotas estáticas em `dist/`.
- `npm test`: testes de regras de negócio e permissões de leitura.
- `database/global.sql` e `database/global-permissoes.sql`: estrutura e adaptações das RPCs.
- `database/importacao/*-records.json`: cópia de dados usada na migração; sem sessões, senhas ou códigos de recuperação.
- Edge Functions: `global-api` e `pedidos-api`, com autenticação explícita por `auth.getUser` (gateway JWT desativado para permitir o preflight e o cadastro pendente no Pedidos).
- `.openai/hosting.json` mantém a publicação de revisão privada existente. `dist/` contém somente frontend público.

Não reexecutar os seeds em uma base já importada. Novas gravações na origem após a cópia não são sincronizadas automaticamente. Antes da virada do domínio, conciliar as alterações feitas durante a homologação.

Nunca incluir a chave de serviço no frontend ou repositório.

## Verificação

Passaram testes locais de CRUD/saldos de Gastos, importação/CRUD de produtos de Fornecedores e ciclo de equipamento com entrega, transferência e devolução (incluindo bloqueio de saldo insuficiente). No banco, testes em transação revertida verificaram idempotência, rejeição de revisão obsoleta, usuário não autorizado e negação de leitura direta. As verificações pelo navegador são registradas no relatório de implementação; uma publicação não equivale à homologação completa pelos usuários.

A limpeza antiga dos objetos alheios ao Pedidos foi concluída antes desta implementação; a configuração dos schemas expostos foi corrigida para `public,graphql_public`. Nenhuma estrutura de Frotas foi criada.
