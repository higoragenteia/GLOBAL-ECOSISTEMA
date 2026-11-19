CREATE OR REPLACE FUNCTION public.global_aplicar(p_modulo text, p_revisao bigint, p_ator uuid, p_request text, p_acao text, p_colecoes jsonb, p_resultado jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c jsonb;cached jsonb;newrev bigint;u public.pedidos_usuarios;
begin
 select * into u from public.pedidos_usuarios where id=p_ator for share;
 if u.id is null or u.status<>'ATIVO' or not (u.perfil='SUPERADMIN' or coalesce(u.permissoes->>p_modulo='GERENCIAR',false)) then raise exception 'Acesso administrativo obrigatório';end if;
 select resultado into cached from public.global_operacoes where modulo=p_modulo and ator_id=p_ator and request_id=p_request;
 if found then return jsonb_build_object('repeticao',true,'resultado',cached);end if;
 update public.global_modulos set revisao=revisao+1,atualizado_em=now() where id=p_modulo and revisao=p_revisao returning revisao into newrev;
 if not found then raise exception 'CONCORRENCIA: os dados foram alterados. Atualize e tente novamente.';end if;
 -- A single transaction includes every affected record and the durable idempotency result.
 for c in select value from jsonb_array_elements(p_colecoes) loop
  if c->>'nome' in ('USUARIOS','SESSOES') then raise exception 'Autenticação pertence ao Supabase Auth';end if;
  insert into public.global_colecoes(modulo,nome,colunas,cabecalho) values(p_modulo,c->>'nome',c->'colunas',(c->>'cabecalho')::int) on conflict(modulo,nome) do update set colunas=excluded.colunas,cabecalho=excluded.cabecalho;
  delete from public.global_registros where modulo=p_modulo and colecao=c->>'nome';
  insert into public.global_registros(modulo,colecao,ordem,dados) select p_modulo,c->>'nome',(x->>'ordem')::int,x->'dados' from jsonb_array_elements(c->'registros') x;
 end loop;
 insert into public.global_operacoes(modulo,ator_id,request_id,resultado) values(p_modulo,p_ator,p_request,p_resultado);
 insert into public.global_auditoria(ator_id,modulo,acao,detalhes) values(p_ator,p_modulo,p_acao,jsonb_build_object('revisao',newrev));
 return jsonb_build_object('repeticao',false,'resultado',p_resultado);
end;$function$
;
CREATE OR REPLACE FUNCTION public.pedidos_conferir(p_editor uuid, p_pedido text, p_token uuid, p_linhas jsonb, p_chave text, p_finalizar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare o pedidos_ordens; item pedidos_itens; linha jsonb; q numeric; anteriores jsonb; rev integer; estado text; changes jsonb:='[]';
begin
 if not exists(select 1 from pedidos_usuarios where id=p_editor and status='ATIVO' and (perfil='SUPERADMIN' or permissoes->>'pedidos'='GERENCIAR')) then raise exception 'Acesso administrativo obrigatório.'; end if;
 select * into strict o from pedidos_ordens where id=p_pedido for update;
 if p_token is distinct from o.token then raise exception 'Link inválido.'; end if;
 if length(coalesce(p_chave,'')) not between 1 and 120 then raise exception 'Chave de proteção inválida.'; end if;
 select revisao into rev from pedidos_revisoes where pedido_id=p_pedido and chave=p_chave;
 if found then return jsonb_build_object('revisao',rev,'repeticao',true); end if;
 if o.entregue_em is not null then raise exception 'Este pedido já teve a entrega confirmada.'; end if;
 if jsonb_array_length(p_linhas)<>(select count(*) from pedidos_itens where pedido_id=p_pedido) then raise exception 'Itens divergentes.'; end if;
 for item in select * from pedidos_itens where pedido_id=p_pedido loop
 if (select count(*) from jsonb_array_elements(p_linhas) x where x->>'codigo'=item.codigo and x->>'unidade'=item.unidade)<>1 then raise exception 'Item ausente ou duplicado.'; end if;
 select x into linha from jsonb_array_elements(p_linhas) x where x->>'codigo'=item.codigo and x->>'unidade'=item.unidade;
 q:=(linha->>'qtd')::numeric;
 if q is null or q<0 or q<>trunc(q) or q>item.quantidade then raise exception 'Quantidade confirmada inválida.'; end if;
 changes:=changes||jsonb_build_array(jsonb_build_object('codigo',item.codigo,'unidade',item.unidade,'antes',item.entregue,'depois',q));
 update pedidos_itens set entregue=q,entregue_equivalentes=q*equivalentes/quantidade,nota=left(coalesce(linha->>'nota',''),200)
 where pedido_id=p_pedido and codigo=item.codigo and unidade=item.unidade;
 end loop;
 rev:=o.revisao+1;
 if p_finalizar then
 select case when sum(entregue)=0 then 'NÃO ENTREGUE' when bool_and(entregue=quantidade) then 'ENTREGUE' else 'ENTREGUE PARCIAL' end into estado from pedidos_itens where pedido_id=p_pedido;
 else estado:='ATUALIZADO — REVISÃO '||rev; end if;
 update pedidos_ordens set revisao=rev,situacao=estado,entregue_em=case when p_finalizar then now() else null end where id=p_pedido;
 insert into pedidos_revisoes(pedido_id,revisao,editor_id,chave,alteracoes) values(p_pedido,rev,p_editor,p_chave,changes);
 insert into pedidos_auditoria(ator_id,acao,referencia,detalhes) values(p_editor,case when p_finalizar then 'ENTREGA' else 'CONFERENCIA' end,p_pedido,jsonb_build_object('revisao',rev,'alteracoes',changes));
 return jsonb_build_object('revisao',rev,'situacao',estado);
end $function$
;
CREATE OR REPLACE FUNCTION public.pedidos_criar(p_usuario uuid, p_dados jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u pedidos_usuarios; p pedidos_produtos; item jsonb; q numeric; unidade text; fator numeric;
 novo text := 'PED-' || to_char(clock_timestamp(),'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
begin
 select * into strict u from pedidos_usuarios where id=p_usuario and status='ATIVO' for share;
 if not (u.perfil='SUPERADMIN' or coalesce(u.permissoes->>'pedidos' in ('OPERAR','GERENCIAR'),false)) then raise exception 'Seu acesso ao Pedidos não permite solicitar.'; end if;
 if jsonb_array_length(p_dados->'itens') not between 1 and 500 then raise exception 'Escolha de 1 a 500 itens.'; end if;
 if not exists(select 1 from pedidos_obras where nome=p_dados->>'obra' and ativa) then raise exception 'Obra inválida.'; end if;
 insert into pedidos_ordens(id,usuario_id,solicitante,obra,observacoes,canal)
 values(novo,u.id,u.nome,p_dados->>'obra',left(coalesce(p_dados->>'observacao',''),2000),left(coalesce(p_dados->>'canal','group'),30));
 for item in select * from jsonb_array_elements(p_dados->'itens') loop
 select * into strict p from pedidos_produtos where id=item->>'id' and ativo='SIM';
 q := (item->>'quantidade')::numeric; unidade:=item->>'unidade';
 if q is null or q<=0 or q<>trunc(q) or q>1000000 then raise exception 'Quantidade inválida.'; end if;
 if unidade not in ('Unidade','Caixa','Pacote','Litro','Quilo',p.unidade) then raise exception 'Unidade inválida.'; end if;
 fator:=case when unidade in ('Caixa','Pacote') then p.por_caixa else 1 end;
 insert into pedidos_itens(pedido_id,codigo,nome,unidade,quantidade,equivalentes) values(novo,p.id,p.nome,unidade,q,q*fator);
 end loop;
 insert into pedidos_auditoria(ator_id,acao,referencia) values(u.id,'SOLICITACAO',novo);
 return novo;
end $function$
;
update public.pedidos_usuarios set permissoes=jsonb_set(permissoes,'{pedidos}','"GERENCIAR"'::jsonb) where perfil='ADMIN';
