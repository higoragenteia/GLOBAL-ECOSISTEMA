-- GVG & ARTEFAL — Frotas no GLOBAL ECOSISTEMA (Supabase)
-- Migração idempotente: módulo + definições das coleções. NENHUM dado de veículo ou pessoa é incluído aqui.
-- Os registros são importados uma única vez pelo botão "Importar dados" (edge function frotas-api).

-- Idempotente. Pode ser executado novamente sem duplicar módulo ou coleções.
do $$ declare c text; begin
  for c in
    select conname from pg_constraint
    where conrelid='public.global_modulos'::regclass
      and contype='c'
      and pg_get_constraintdef(oid) like '%gastos%'
  loop
    execute format('alter table public.global_modulos drop constraint %I',c);
  end loop;
end $$;
alter table public.global_modulos drop constraint if exists global_modulos_id_check;
alter table public.global_modulos add constraint global_modulos_id_check check(id in ('gastos','fornecedores','maquinas','frotas'));
insert into public.global_modulos(id) values('frotas') on conflict (id) do nothing;

insert into public.global_colecoes(modulo,nome,colunas,cabecalho) values
('frotas','Base de Dados','["ID","Tipo","Marca / Modelo","Placa","Chassi","RENAVAM","Ano Fab/Mod","Cor","Proprietário (CRLV)","CPF/CNPJ","Condutor / Responsável","CRLV (exercício)","CRLV emitido em","Valor de compra","Observações"]'::jsonb,1),
('frotas','Seguros','["ID Veículo","Placa","Seguradora","Nº Apólice / Proposta","Tipo documento","Vigência início","Vigência fim","Dias para vencer","Situação","Prêmio total (R$)","Parcelas","Valor da parcela","Observação / Arquivo"]'::jsonb,1),
('frotas','Vencimentos','["ID","Placa","Categoria","Descrição","Data de vencimento","Status pagamento","Pago em","Valor (R$)","Comprovante URL","Observações"]'::jsonb,1),
('frotas','Vencimentos Extras','["ID","Placa","Tipo","Descrição","Vencimento","Valor","Pago/Regularizado","Observação"]'::jsonb,1),
('frotas','Pagamentos','["ID","Placa","Data","Tipo","Descrição","Valor","Comprovante URL"]'::jsonb,1),
('frotas','Registros de KM','["ID","Placa","Data","Quilometragem","Observação"]'::jsonb,1),
('frotas','Abastecimentos','["ID","Placa","Data","Combustível","Litros","Valor (R$)","Quilometragem","Posto","Comprovante URL","Observação","Motorista"]'::jsonb,1),
('frotas','Manutenções','["ID","Placa","Data","Serviço","Quilometragem","Valor (R$)","Próxima revisão (data)","Próxima revisão (km)","Status","Prestador","Comprovante URL","Observação"]'::jsonb,1),
('frotas','Fotos Veículos','["ID","Placa","Foto URL","Legenda"]'::jsonb,1),
('frotas','Documentos Frota','["ID","Placa","Tipo","Documento URL","Emissão","Vencimento","Status","Observação","Valor do IPVA"]'::jsonb,1),
('frotas','Histórico de Alterações','["Data/Hora","Usuário","Operação","Aba","ID / Placa","Campo","Valor anterior","Novo valor"]'::jsonb,1),
('frotas','Alertas Automáticos App','["Chave","Placa","Veículo","Tipo","Vencimento","Dias restantes","Status","Alerta -10","Alerta -5","Pago/Regularizado","Última verificação","Observação"]'::jsonb,1),
('frotas','Histórico Push Frota','["Data/Hora","Placa","Tipo","Status"]'::jsonb,1)
on conflict (modulo,nome) do update set colunas=excluded.colunas,cabecalho=excluded.cabecalho;

-- A Edge Function frotas-api usa service_role e valida o usuário/permissão antes de importar/gravar.
