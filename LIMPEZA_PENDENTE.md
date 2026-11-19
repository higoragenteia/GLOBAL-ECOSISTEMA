# Limpeza pendente — GVG CONTROLE DE GASTOS

Projeto Supabase: `krjudhqlpgdnjzrdmtyf`.

A revisão automática bloqueou a exclusão definitiva e o arquivamento reversível por envolverem estruturas compartilhadas. Nenhuma das estruturas abaixo foi alterada. A confirmação solicitada refere-se somente aos objetos listados neste documento, no schema `public`; não inclui as tabelas novas com prefixo `pedidos_`, contas de autenticação, arquivos, nem outros schemas.

| Tabela antiga | Registros em 19/11/2026 |
|---|---:|
| categorias | 4 |
| funcionarios | 5 |
| comprovantes | 2 |
| agente_memoria | 0 |
| agente_conversas | 0 |
| n8n_chat_histories | 36 |
| configuracoes | 4 |
| notificacoes | 0 |
| agente_acoes | 0 |
| memoria_chat | 148 |
| contas | 2 |
| conta_competencias | 2 |
| **Total** | **203** |

Visualizações antigas incluídas no escopo: `vw_painel_orcamento`, `vw_agente`, `aba1_registros`, `aba2_resumo`, `aba3_comparativo` e `aba4_categoria`.

Excluir esses objetos remove definitivamente os registros listados e pode interromper integrações antigas que ainda os consultem. A réplica nova do Pedidos usa somente suas próprias tabelas e não depende deles.

**Decisão pendente:** confirmar a exclusão definitiva destas 12 tabelas, seus 203 registros e destas seis visualizações.
