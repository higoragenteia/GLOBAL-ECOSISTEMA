# Revisão da migração — 20/11/2026

Repositório público `higoragenteia/GLOBAL-ECOSISTEMA`. O sistema original e seu domínio continuam intactos.

## Entrega para homologação

Painel original preservado com rotas estáticas para Pedidos, Gastos, Fornecedores, Máquinas e Frotas. Supabase Auth compartilhado e autorização por módulo no servidor. O Frotas usa a interface original completa (`FrotasIndex.html`), o adaptador `frotas-compat.js` e a Edge Function `frotas-api`; não há segundo login.

Dados migrados das bases operacionais do projeto original, sem gravações na origem: Gastos (11 lançamentos), Fornecedores (24 fornecedores, 18 produtos e 17 cotações), Máquinas (50 equipamentos, 12 categorias, 19 colaboradores, 23 empréstimos, 27 movimentos e 2 manutenções). O Pedidos mantém os 327 produtos, 17 obras e pedidos já existentes na réplica. O Frotas foi aplicado no Supabase live em 20/11/2026 e importou 13 coleções/87 registros, com backup e auditoria.

As contas antigas não foram convertidas: seus hashes não são credenciais Supabase Auth. Criar/aprovar contas no novo painel. Fotos antigas do Pedidos continuam dependendo do Drive.

## Frotas — o que mudou

- A página reduzida anterior foi substituída pela interface original completa, gerada por `scripts/build-frotas.py`.
- `frotas-compat.js` implementa `getBootstrap`, `getData`, `getTables`, `saveRecord`, `deleteRecord`, `getAudit`, `importarSheets`, alteração de senha e gestão de contas pelo painel.
- `supabase/functions/frotas-api/index.ts` valida sessão/permissão, grava, exclui, audita, importa e cria backup antes da importação.
- `database/frotas.sql` define o módulo e as 13 coleções, sem dados reais.
- O painel mantém o menu/cartão Frotas, o iframe same-origin, o deep link `?view=frotas&alerta=...` e o carregamento sem overlay preso.
- O Firebase/FCM externo foi preservado; a entrega em dispositivo não foi revalidada.

## Validação realizada

**PASSOU**

- `npm test`: 21 testes locais. Os 11 novos cobrem importação gviz, adaptador, permissões VISUAL/OPERAR/GERENCIAR, geração de IDs, seguro, datas/valores, exclusão, backup/importação, auditoria, contas pelo painel e integridade estática.
- Parser executado contra a planilha real em modo somente leitura: 13 abas e 87 registros (6 veículos, 5 seguros, 4 vencimentos, 3 manutenções e históricos). A gravação foi feita depois, pela importação administrativa.
- `python3 scripts/build-frontend.py` gerou painel e `dist/` com Frotas.
- Verificação sintática de `frotas-compat.js` e, com esbuild, de `frotas-api/index.ts` e `global-api/index.ts`.
- Teste de fumaça em Chromium headless (`npm run test:ui`, Playwright, `frotas-api`/`global-api` interceptadas com dados sintéticos): GERENCIAR (SSO, estatísticas, tabela administrativa, criação de veículo e acionamento da importação), VISUAL (importação/administração ocultas e escrita bloqueada), deep link de alerta, sem sessão e painel + iframe (carregamento do módulo e logout propagado). Sem erros de console.
- **Live Supabase (20/11/2026):** `database/frotas.sql` aplicado; `frotas-api` (v3) e `global-api` (v8) ativas com `verify_jwt=false`; `FROTAS_SHEET_ID` configurado; importação 13/87 concluída, backup `c469174d-51cc-4753-98c1-fe5c59ea6472` e auditoria `IMPORTAR_FROTAS`; bootstrap autenticado; criação/exclusão de registro; bloqueio de escrita para VISUAL; bloqueio de exclusão para OPERAR; auditoria de SALVAR/EXCLUIR; métrica do painel com 6 veículos; interface Frotas e painel + iframe com dados reais, sem erros de console. Usuário temporário de teste removido.

**FALHOU**

- Nenhuma falha nos testes executados.

**NÃO EXECUTADO**

- Publicar o frontend no domínio de produção (o `dist/` está pronto, mas o deploy estático não foi feito).
- Validar push/FCM em dispositivo físico.
- Revogar a implantação antiga do Apps Script e o compartilhamento público da planilha (recomendado após a virada).
- Revisar o histórico do repositório público e os dados preexistentes de outros módulos em `database/importacao/`.

O backend Frotas está live no Supabase; a interface ainda não foi publicada no domínio. A coleção pré-existente `Notificações de Vencimentos` (4 registros) foi preservada e não é usada pela interface atual.

## Limites e próxima etapa

A camada de compatibilidade carrega as coleções do módulo e substitui a coleção alterada; crescimento significativo exige paginação e atualizações específicas por registro. A importação do Frotas é administrativa e única; depois dela, o runtime lê somente o Supabase. A cópia não sincroniza alterações posteriores feitas na planilha.

O repositório está público e já contém dados de outros módulos em `database/importacao/`. Antes de qualquer divulgação, revisar o histórico e tornar o repositório privado. O ID da planilha do Frotas não é versionado; a importação usa o segredo `FROTAS_SHEET_ID`.

Consulte `docs/FROTAS_INTEGRACAO.md` para implantação, importação, rollback e detalhes de segurança. O domínio próprio é suportado pela hospedagem e sua configuração fica para a conclusão e homologação.

## Histórico — 19/11/2026

A revisão anterior entregou Pedidos, Gastos, Fornecedores e Máquinas, com testes locais e verificação sintática. O Frotas estava pendente. Os dados de Gastos/Fornecedores/Máquinas foram migrados sem gravações na origem; as contas antigas não foram convertidas. A limpeza dos objetos alheios ao Pedidos foi concluída antes desta implementação; os schemas expostos foram corrigidos para `public,graphql_public`.
