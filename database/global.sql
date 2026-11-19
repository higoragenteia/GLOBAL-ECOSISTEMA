alter table public.pedidos_usuarios add column if not exists permissoes jsonb not null default '{"pedidos":"OPERAR"}'::jsonb;
create table public.global_modulos(id text primary key check(id in ('gastos','fornecedores','maquinas')),revisao bigint not null default 0,atualizado_em timestamptz not null default now());
create table public.global_colecoes(modulo text not null references public.global_modulos(id),nome text not null,colunas jsonb not null check(jsonb_typeof(colunas)='array'),cabecalho int not null default 1 check(cabecalho>0),primary key(modulo,nome));
create table public.global_registros(modulo text not null,colecao text not null,ordem int not null check(ordem>0),dados jsonb not null check(jsonb_typeof(dados)='object'),primary key(modulo,colecao,ordem),foreign key(modulo,colecao) references public.global_colecoes(modulo,nome));
create index global_registros_dados_gin on public.global_registros using gin(dados);
create table public.global_operacoes(modulo text not null references public.global_modulos(id),request_id text not null,ator_id uuid not null references public.pedidos_usuarios(id),resultado jsonb not null,criado_em timestamptz not null default now(),primary key(modulo,ator_id,request_id));
create index global_operacoes_ator_idx on public.global_operacoes(ator_id);
create table public.global_auditoria(id bigint generated always as identity primary key,ator_id uuid not null references public.pedidos_usuarios(id),modulo text not null,acao text not null,referencia text not null default '',detalhes jsonb not null default '{}',criado_em timestamptz not null default now());
create index global_auditoria_ator_idx on public.global_auditoria(ator_id);
create index global_auditoria_modulo_data_idx on public.global_auditoria(modulo,criado_em desc);
create table public.global_backups(id uuid primary key default gen_random_uuid(),modulo text not null,ator_id uuid not null references public.pedidos_usuarios(id),conteudo jsonb not null,criado_em timestamptz not null default now());
create index global_backups_ator_idx on public.global_backups(ator_id);
alter table public.global_modulos enable row level security;
alter table public.global_colecoes enable row level security;
alter table public.global_registros enable row level security;
alter table public.global_operacoes enable row level security;
alter table public.global_auditoria enable row level security;
alter table public.global_backups enable row level security;
revoke all on public.global_modulos,public.global_colecoes,public.global_registros,public.global_operacoes,public.global_auditoria,public.global_backups from anon,authenticated;
grant all on public.global_modulos,public.global_colecoes,public.global_registros,public.global_operacoes,public.global_auditoria,public.global_backups to service_role;
grant usage,select on sequence public.global_auditoria_id_seq to service_role;
create function public.global_snapshot(p_modulo text) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('revisao',m.revisao,'colecoes',coalesce((select jsonb_agg(jsonb_build_object('nome',c.nome,'colunas',c.colunas,'cabecalho',c.cabecalho,'registros',coalesce((select jsonb_agg(jsonb_build_object('ordem',r.ordem,'dados',r.dados) order by r.ordem) from public.global_registros r where r.modulo=c.modulo and r.colecao=c.nome),'[]'::jsonb))) from public.global_colecoes c where c.modulo=m.id),'[]'::jsonb)) from public.global_modulos m where m.id=p_modulo;
$$;
create function public.global_aplicar(p_modulo text,p_revisao bigint,p_ator uuid,p_request text,p_acao text,p_colecoes jsonb,p_resultado jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
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
end;$$;
revoke all on function public.global_snapshot(text),public.global_aplicar(text,bigint,uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.global_snapshot(text),public.global_aplicar(text,bigint,uuid,text,text,jsonb,jsonb) to service_role;
insert into public.global_modulos(id) values('gastos'),('fornecedores'),('maquinas');
