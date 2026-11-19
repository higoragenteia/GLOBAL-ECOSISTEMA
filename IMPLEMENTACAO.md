# Revisão da migração — 19/11/2026

Repositório renomeado de `higorteste` para `GLOBAL-ECOSISTEMA`; continua privado.

## Entrega para homologação

Painel original preservado com rotas estáticas para Pedidos, Gastos, Fornecedores e Máquinas. Supabase Auth compartilhado e autorização por módulo no servidor. Frotas está pendente, sem tabelas, importação ou backend novo. Domínio atual não alterado.

Dados migrados das bases operacionais do projeto original, sem gravações na origem: Gastos (11 lançamentos), Fornecedores (24 fornecedores, 18 produtos e 17 cotações), Máquinas (50 equipamentos, 12 categorias, 19 colaboradores, 23 empréstimos, 27 movimentos e 2 manutenções). O Pedidos mantém os 327 produtos, 17 obras e pedidos já existentes na réplica.

As contas antigas não foram convertidas: seus hashes não são credenciais Supabase Auth. Criar/aprovar contas no novo painel. Fotos antigas do Pedidos continuam dependendo do Drive.

## Validação realizada

- Seis testes locais passaram: leitura de dados, CRUD e saldos, auditoria, bloqueio de escrita por consulta e ciclo de equipamento criado/entregue/transferido/devolvido, com rejeição de saldo insuficiente.
- Testes SQL executados dentro de transação revertida: resultado idempotente, revisão obsoleta rejeitada, usuário inexistente rejeitado, acesso direto ao banco negado para anon/authenticated.
- HTTP sem sessão na `global-api`: 401.
- Verificação sintática dos arquivos de servidor e de todos os scripts inline das cinco páginas.
- Navegador da publicação, usando a sessão existente de Higor: painel carregou 4 apps; Gastos exibiu orçamento de R$ 26.000,00, despesas de R$ 3.235,09 e saldo de R$ 22.764,91; Fornecedores exibiu 24/18/17; Máquinas exibiu os 50 equipamentos e 2 manutenções; Pedidos abriu os 327 produtos com a mesma sessão; gestão central listou a conta e suas permissões. Não apareceram erros de console nessas aberturas.

Não foram feitas gravações operacionais pelo navegador na base publicada. Os testes de escrita usaram cópias locais e transações revertidas. Usuários finais ainda devem homologar seus fluxos antes da virada do domínio. Não foi produzido benchmark numérico de velocidade.

## Limites e próxima etapa

As regras de negócio foram adaptadas sobre registros JSONB e transações PostgreSQL. A camada de compatibilidade ainda carrega as coleções do módulo e substitui coleções alteradas; crescimento significativo requer paginação e atualizações específicas por registro. A cópia não sincroniza alterações posteriores feitas na origem; conciliar dados antes da entrada em produção.

**Parar aqui e solicitar os pontos específicos de Frotas ao Higor.** O domínio próprio é suportado pela hospedagem e sua configuração fica para a conclusão e homologação.
