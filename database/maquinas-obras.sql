-- GVG & ARTEFAL — Controle de Máquinas: Obras e localização dos equipamentos.
-- Migração idempotente. Não inclui nenhum dado real; apenas a estrutura.

-- 1. Coleção OBRAS (nome da obra/local).
insert into public.global_colecoes(modulo,nome,colunas,cabecalho) values
('maquinas','OBRAS','["ID","NOME","ATIVO","CRIADO_EM","ATUALIZADO_EM"]'::jsonb,1)
on conflict (modulo,nome) do update set colunas=excluded.colunas,cabecalho=excluded.cabecalho;

-- 2. Colunas OBRA_ID e PRECO_UNITARIO na coleção EQUIPAMENTOS.
-- Registros existentes ficam sem obra (vazio) e sem preço (0) e podem ser
-- editados depois.
update public.global_colecoes
set colunas = colunas || '["OBRA_ID"]'::jsonb
where modulo='maquinas'
  and nome='EQUIPAMENTOS'
  and not (colunas ? 'OBRA_ID');

update public.global_colecoes
set colunas = colunas || '["PRECO_UNITARIO"]'::jsonb
where modulo='maquinas'
  and nome='EQUIPAMENTOS'
  and not (colunas ? 'PRECO_UNITARIO');

-- A Edge Function global-api (módulo maquinas) valida obra e preço em
-- criar/editar equipamento e oferece criarObra/editarObra/inativarObra/
-- reativarObra/excluirObra.
