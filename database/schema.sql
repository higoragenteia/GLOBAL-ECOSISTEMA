-- Pedidos isolado. Nenhuma alteração nas tabelas dos aplicativos anteriores.
create table public.pedidos_usuarios (
 id uuid primary key references auth.users(id), nome text not null, login text not null unique,
 email text not null, perfil text not null default 'OPERADOR' check(perfil in ('SUPERADMIN','ADMIN','OPERADOR')),
 status text not null default 'PENDENTE' check(status in ('PENDENTE','ATIVO','BLOQUEADO','EXCLUIDO')),
 foto text not null default '', voz boolean not null default false, criado_em timestamptz not null default now()
);
create table public.pedidos_produtos (
 id text primary key, nome text not null, categoria text not null, unidade text not null default 'Unidade',
 descricao text not null default '', por_caixa numeric not null default 1 check(por_caixa > 0),
 ativo text not null default 'SIM' check(ativo in ('SIM','NÃO','EM FALTA')),
 imagem text not null default '', referencia text not null default '', ordem integer not null default 0
);
create table public.pedidos_obras (nome text primary key, ativa boolean not null default true, ordem integer not null default 0);
create table public.pedidos_config (chave text primary key, valor text not null);
create table public.pedidos_ordens (
 id text primary key, usuario_id uuid not null references public.pedidos_usuarios(id),
 solicitante text not null, obra text not null references public.pedidos_obras(nome), observacoes text not null default '',
 canal text not null, situacao text not null default 'SOLICITADO', criado_em timestamptz not null default now(),
 entregue_em timestamptz, token uuid not null default gen_random_uuid(), revisao integer not null default 0
);
create index pedidos_ordens_usuario_data on public.pedidos_ordens(usuario_id,criado_em desc);
create table public.pedidos_itens (
 pedido_id text not null references public.pedidos_ordens(id) on delete cascade,
 codigo text not null references public.pedidos_produtos(id), nome text not null, unidade text not null,
 quantidade numeric not null check(quantidade > 0), equivalentes numeric not null check(equivalentes > 0),
 entregue numeric check(entregue >= 0 and entregue <= quantidade), entregue_equivalentes numeric not null default 0,
 nota text not null default '', primary key(pedido_id,codigo,unidade)
);
create table public.pedidos_favoritos (
 usuario_id uuid not null references public.pedidos_usuarios(id), produto_id text not null references public.pedidos_produtos(id),
 primary key(usuario_id,produto_id)
);
create table public.pedidos_revisoes (
 pedido_id text not null references public.pedidos_ordens(id) on delete cascade, revisao integer not null,
 editor_id uuid not null references public.pedidos_usuarios(id), chave text not null,
 alteracoes jsonb not null, criado_em timestamptz not null default now(), compartilhado_em timestamptz,
 primary key(pedido_id,revisao), unique(pedido_id,chave)
);
create index pedidos_revisoes_editor on public.pedidos_revisoes(editor_id);
create table public.pedidos_auditoria (
 id bigint generated always as identity primary key, ator_id uuid references public.pedidos_usuarios(id),
 acao text not null, referencia text, detalhes jsonb not null default '{}', criado_em timestamptz not null default now()
);
create index pedidos_auditoria_ator on public.pedidos_auditoria(ator_id);
create table public.pedidos_limites (chave text primary key, inicio timestamptz not null default now(), total integer not null default 1);

-- Somente a Edge Function autenticada acessa os dados; acesso direto pela chave pública é negado.
do $$ declare t text; begin
 foreach t in array array['pedidos_usuarios','pedidos_produtos','pedidos_obras','pedidos_config','pedidos_ordens','pedidos_itens','pedidos_favoritos','pedidos_revisoes','pedidos_auditoria','pedidos_limites'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant usage,select on sequence public.pedidos_auditoria_id_seq to service_role;

create function public.pedidos_criar(p_usuario uuid,p_dados jsonb) returns text
language plpgsql security invoker set search_path=public as $$
declare u pedidos_usuarios; p pedidos_produtos; item jsonb; q numeric; unidade text; fator numeric;
 novo text := 'PED-' || to_char(clock_timestamp(),'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
begin
 select * into strict u from pedidos_usuarios where id=p_usuario and status='ATIVO';
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
end $$;
revoke all on function public.pedidos_criar(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pedidos_criar(uuid,jsonb) to service_role;

create function public.pedidos_conferir(p_editor uuid,p_pedido text,p_token uuid,p_linhas jsonb,p_chave text,p_finalizar boolean default false)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare o pedidos_ordens; item pedidos_itens; linha jsonb; q numeric; anteriores jsonb; rev integer; estado text; changes jsonb:='[]';
begin
 if not exists(select 1 from pedidos_usuarios where id=p_editor and status='ATIVO' and perfil in ('ADMIN','SUPERADMIN')) then raise exception 'Acesso administrativo obrigatório.'; end if;
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
end $$;
revoke all on function public.pedidos_conferir(uuid,text,uuid,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.pedidos_conferir(uuid,text,uuid,jsonb,text,boolean) to service_role;

create function public.pedidos_limitar(p_chave text) returns boolean language plpgsql security invoker set search_path=public as $$
declare n integer; begin
 insert into pedidos_limites(chave) values(p_chave) on conflict(chave) do update set
 total=case when pedidos_limites.inicio<now()-interval '1 hour' then 1 else pedidos_limites.total+1 end,
 inicio=case when pedidos_limites.inicio<now()-interval '1 hour' then now() else pedidos_limites.inicio end returning total into n;
 return n<=10;
end $$;
revoke all on function public.pedidos_limitar(text) from public,anon,authenticated;
grant execute on function public.pedidos_limitar(text) to service_role;

insert into public.pedidos_usuarios(id,nome,login,email,perfil,status)
 select id,'Higor José',email,email,'SUPERADMIN','ATIVO' from auth.users where lower(email)='higoragenteia@gmail.com';
insert into public.pedidos_config(chave,valor) values ('TITULO_APP','GVG&ARTEFAL | Pedidos'),('AMBIENTE','TESTE'),('WHATSAPP_DESTINO','');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('pedidos-fotos','pedidos-fotos',true,1500000,array['image/jpeg','image/png','image/webp']);
