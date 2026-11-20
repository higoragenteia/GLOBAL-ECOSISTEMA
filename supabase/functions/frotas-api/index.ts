// GVG & ARTEFAL — Frotas / Supabase. Nenhuma chamada ao Apps Script.
// Acesso via sessao Supabase do Painel GLOBAL, autorizacao a cada requisicao.
import {createClient} from 'npm:@supabase/supabase-js@2.119.1';
const url=Deno.env.get('SUPABASE_URL')!, key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json; charset=utf-8'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const q=<T>(r:{data:T,error:any}):T=>{if(r.error)throw Error(r.error.message);return r.data;};
const allowed=['Base de Dados','Seguros','Vencimentos','Vencimentos Extras','Pagamentos','Registros de KM','Abastecimentos','Manutenções','Fotos Veículos','Documentos Frota'];
const clean=(v:unknown,n=100)=>String(v??'').trim().slice(0,n);
function level(u:any){
 if(u.perfil==='SUPERADMIN')return 'GERENCIAR';
 const x=clean(u.permissoes?.frotas,30).toUpperCase();
 const v=x==='ADMIN'?'GERENCIAR':x==='OPERADOR'?'OPERAR':x;
 if(!['VISUAL','OPERAR','GERENCIAR'].includes(v))return '';
 return u.perfil==='OPERADOR'&&v==='GERENCIAR'?'OPERAR':v;
}
async function actor(req:Request) {
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 if(!token)throw Error('Acesse pelo painel principal.');
 const res=await db.auth.getUser(token);
 if(res.error||!res.data.user)throw Error('Sessão inválida ou expirada.');
 const u=q(await db.from('pedidos_usuarios').select('id,nome,perfil,status,permissoes').eq('id',res.data.user.id).maybeSingle());
 if(!u||u.status!=='ATIVO')throw Error('Usuário sem acesso ativo.');
 const lvl=level(u);if(!lvl)throw Error('Permissão de Frotas não concedida no GLOBAL.');
 return {id:u.id,nome:u.nome,perfil:u.perfil,nivel:lvl};
}
async function audit(user:any,action:string,collection:string,before:unknown,after:unknown,order:number){
 const d={ator_id:user.id,modulo:'frotas',acao:action,referencia:collection+':'+order,detalhes:{antes:before,depois:after}};
 q(await db.from('global_auditoria').insert(d));
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return json({error:'Método não permitido'},405);
 try {
  const user=await actor(req);
  const raw=await req.text();if(raw.length>35000)return json({error:'Requisição muito extensa'},413);
  const input=JSON.parse(raw),fn=clean(input.fn,60);
  if(fn==='bootstrap'){
   const collections=q(await db.from('global_colecoes').select('nome,colunas,cabecalho').eq('modulo','frotas').order('nome'));
   const records=q(await db.from('global_registros').select('colecao,ordem,dados').eq('modulo','frotas').order('ordem').limit(5000));
   const map=collections.map((c:any)=>({nome:c.nome,colunas:c.colunas,cabecalho:c.cabecalho,registros:records.filter((r:any)=>r.colecao===c.nome).map((r:any)=>({ordem:r.ordem,dados:r.dados}))}));
   return json({data:{colecoes:map,usuario:user,fonte:'Supabase PostgreSQL',firebase:'NAO_VALIDADO',servidorEm:new Date().toISOString()}});
  }
  if(fn==='salvar'){
   if(!['OPERAR','GERENCIAR'].includes(user.nivel))return json({error:'Sem permissão para editar.'},403);
   const col=clean(input.colecao),ord=Number(input.ordem||0),data=input.dados;
   if(!allowed.includes(col)||!data||typeof data!=='object'||Array.isArray(data))return json({error:'Registro inválido.'},400);
   const spec=q(await db.from('global_colecoes').select('colunas').eq('modulo','frotas').eq('nome',col).maybeSingle());
   if(!spec)throw Error('Coleção indisponível.');
   const keys=spec.colunas as string[],fields=Object.keys(data);
   if(fields.length>40||fields.some((k:string)=>!keys.includes(k)))return json({error:'Campos não permitidos'},400);
   const row:any={};for(const k of keys){const v=(data as any)[k];row[k]=v==null?'':typeof v==='string'?v.slice(0,4000):typeof v==='number'||typeof v==='boolean'?v:String(v).slice(0,4000);}
   if(col==='Base de Dados'&&!clean(row.Placa,12))return json({error:'A placa do veículo é obrigatória'},400);
   let order=ord,before=null;
   if(ord>0){
    const old=q(await db.from('global_registros').select('dados').match({modulo:'frotas',colecao:col,ordem:ord}).maybeSingle());
    if(!old)return json({error:'O registro não existe. Atualize e tente novamente.'},409);
    before=old.dados;
    q(await db.from('global_registros').update({dados:row}).match({modulo:'frotas',colecao:col,ordem:ord}));
   }else{
    const all=q(await db.from('global_registros').select('ordem').match({modulo:'frotas',colecao:col}).order('ordem',{ascending:false}).limit(1));
    order=Math.max(1,Number(all?.[0]?.ordem||1))+1;
    q(await db.from('global_registros').insert({modulo:'frotas',colecao:col,ordem:order,dados:row}));
   }
   await audit(user,'SALVAR',col,before,row,order);
   return json({data:{ok:true,ordem:order}});
  }
  if(fn==='excluir'){
   if(user.nivel!=='GERENCIAR')return json({error:'Apenas Gestão pode excluir registros.'},403);
   const col=clean(input.colecao),ord=Number(input.ordem);
   if(!allowed.includes(col)||col==='Base de Dados'||!Number.isInteger(ord)||ord<2)return json({error:'Exclusão não permitida.'},400);
   const old=q(await db.from('global_registros').select('dados').match({modulo:'frotas',colecao:col,ordem:ord}).maybeSingle());
   if(!old)return json({error:'Registro não encontrado.'},404);
   q(await db.from('global_registros').delete().match({modulo:'frotas',colecao:col,ordem:ord}));
   await audit(user,'EXCLUIR',col,old.dados,null,ord);
   return json({data:{ok:true}});
  }
  return json({error:'Ação desconhecida.'},400);
 }catch(e){console.error('frotas-api',String((e as Error)?.message||e));return json({error:clean((e as Error)?.message||'Erro no Frotas',300)},400);}
});