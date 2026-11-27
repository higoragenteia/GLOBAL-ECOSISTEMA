// GVG & ARTEFAL — Frotas / Supabase. Nenhuma chamada ao Apps Script em tempo de execução.
// Acesso via sessão Supabase do Painel GLOBAL, com autorização e auditoria a cada requisição.
import {createClient} from 'npm:@supabase/supabase-js@2.119.1';
import {mfaMessage,mfaSatisfied} from '../_shared/mfa.js';
import {fetchCollections, counts} from './import-data.js';
const url=Deno.env.get('SUPABASE_URL')!, key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json; charset=utf-8'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const q=<T>(r:{data:T,error:any}):T=>{if(r.error)throw Error(r.error.message);return r.data;};
const BASE='Base de Dados';
const allowed=['Base de Dados','Seguros','Vencimentos','Vencimentos Extras','Pagamentos','Registros de KM','Abastecimentos','Manutenções','Fotos Veículos','Documentos Frota'];
const numeric:Record<string,number[]>={'Base de Dados':[13],'Seguros':[9,10,11],'Vencimentos':[7],'Vencimentos Extras':[5],'Pagamentos':[5],'Registros de KM':[3],'Abastecimentos':[4,5,6],'Manutenções':[4,5,7],'Documentos Frota':[8]};
const dates:Record<string,number[]>={'Seguros':[5,6],'Vencimentos':[4,6],'Vencimentos Extras':[4],'Pagamentos':[2],'Registros de KM':[2],'Abastecimentos':[2],'Manutenções':[2,6],'Documentos Frota':[4,5]};
const clean=(v:unknown,n=100)=>String(v??'').trim().slice(0,n);
const norm=(v:unknown)=>clean(v,300).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const todayYmd=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Recife'}).format(new Date());
function ymd(value:unknown){
 const s=clean(value,40),br=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/),iso=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
 return br?br[3]+'-'+br[2]+'-'+br[1]:iso?iso[1]+'-'+iso[2]+'-'+iso[3]:'';
}
function addDays(value:unknown,amount:number){
 const d=ymd(value);if(!d)return '';
 const date=new Date(d+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+amount);
 return date.toISOString().slice(0,10);
}
function validYmd(value:unknown){
 const s=ymd(value);if(!s)return false;
 const d=new Date(s+'T12:00:00Z');
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;
}
function daysFromToday(value:unknown){
 const d=ymd(value);if(!d)return NaN;
 return Math.round((Date.parse(d+'T12:00:00Z')-Date.parse(todayYmd()+'T12:00:00Z'))/86400000);
}
function insuranceStatus(id:unknown,documentType:unknown,to:unknown){
 const vehicle=clean(id,80),doc=norm(documentType),finish=ymd(to);
 if(!vehicle)return {days:'',label:''};
 const delta=finish?daysFromToday(finish):NaN;
 if(doc.includes('nenhum'))return {days:finish?String(delta):'',label:'SEM SEGURO'};
 if(!finish)return {days:'',label:'VERIFICAR'};
 if(doc.includes('proposta'))return {days:String(delta),label:'SEM APÓLICE CONFIRMADA'};
 return {days:String(delta),label:delta<=0?'VENCIDO':delta<=30?'VENCE EM ATÉ 30 DIAS':'VIGENTE'};
}
function parseNumber(value:unknown):number|null{
 if(typeof value==='number'&&Number.isFinite(value))return value;
 const s=clean(value,80).replace(/R\$/g,'').replace(/\s/g,'');
 if(!s)return null;
 if(!/^-?[\d.,]+$/.test(s))return null;
 const n=Number(s.includes(',')?s.replace(/\./g,'').replace(',','.'):s);
 return Number.isFinite(n)?n:null;
}
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
 const u=q(await db.from('pedidos_usuarios').select('id,nome,email,perfil,status,permissoes').eq('id',res.data.user.id).maybeSingle());
 if(!u||u.status!=='ATIVO')throw Error('Usuário sem acesso ativo.');
 if(!await mfaSatisfied(db.auth,token,res.data.user))throw Object.assign(Error(mfaMessage),{status:403});
 const lvl=level(u);if(!lvl)throw Error('Permissão de Frotas não concedida no GLOBAL.');
 return {id:u.id,nome:u.nome,email:u.email||'',perfil:u.perfil,superadmin:u.perfil==='SUPERADMIN',nivel:lvl};
}
async function audit(user:any,action:string,collection:string,before:unknown,after:unknown,order:number){
 const d={ator_id:user.id,modulo:'frotas',acao:action,referencia:collection+':'+order,detalhes:{antes:before,depois:after}};
 q(await db.from('global_auditoria').insert(d));
}
async function rowsOf(collection:string){
 return q(await db.from('global_registros').select('ordem,dados').match({modulo:'frotas',colecao:collection}));
}
async function vehicleByPlate(plate:unknown){
 const wanted=clean(plate,30).toUpperCase();if(!wanted)return null;
 const rows=await rowsOf(BASE);
 return rows.map((r:any)=>r.dados||{}).find((d:any)=>clean(d.Placa,30).toUpperCase()===wanted)||null;
}
function auditIdentifier(referencia:unknown,before:any,after:any){
 const a=after||{},b=before||{};
 return clean(a.ID||a['ID Veículo']||a.Placa||b.ID||b['ID Veículo']||b.Placa||String(referencia||'').split(':').pop(),120);
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
   return json({data:{colecoes:map,usuario:user,fonte:'Supabase PostgreSQL',firebase:'EXTERNO_FCM',servidorEm:new Date().toISOString()}});
  }
  if(fn==='importarSheets'){
   if(user.nivel!=='GERENCIAR')return json({error:'Somente Gerenciar pode importar a base do Frotas.'},403);
   const collections=await fetchCollections(fetch);
   const base=collections.find((c:any)=>c.nome===BASE);
   const totals=counts(collections);
   if(!base?.registros?.length||!totals.registros)return json({error:'A planilha não retornou veículos. Importação cancelada para não apagar a base atual.'},400);
   const snapshot=q(await db.rpc('global_snapshot',{p_modulo:'frotas'}));
   if(!snapshot)throw Error('Módulo Frotas não inicializado. Execute database/frotas.sql no Supabase.');
   const backup=q(await db.from('global_backups').insert({modulo:'frotas',ator_id:user.id,conteudo:snapshot}).select('id').single());
   const request='frotas-import-'+crypto.randomUUID();
   const result=q(await db.rpc('global_aplicar',{p_modulo:'frotas',p_revisao:snapshot.revisao,p_ator:user.id,p_request:request,p_acao:'IMPORTAR_FROTAS',p_colecoes:collections,p_resultado:{ok:true,colecoes:totals.colecoes,registros:totals.registros}}));
   return json({data:{ok:true,colecoes:totals.colecoes,registros:totals.registros,backup:backup?.id||null,resultado:result.resultado}});
  }
  if(fn==='getAuditoria'){
   if(user.nivel!=='GERENCIAR')return json({error:'Área reservada à gestão.'},403);
   const logs=q(await db.from('global_auditoria').select('criado_em,acao,referencia,detalhes,ator_id').eq('modulo','frotas').order('criado_em',{ascending:false}).limit(100));
   const ids=[...new Set((logs||[]).map((r:any)=>r.ator_id).filter(Boolean))];
   const users=ids.length?q(await db.from('pedidos_usuarios').select('id,nome,email').in('id',ids)):[];
   const names=Object.fromEntries((users||[]).map((u:any)=>[u.id,u.nome||u.email||'Usuário']));
   return json({data:(logs||[]).map((r:any)=>{
    const details=r.detalhes||{},ref=clean(r.referencia,200),collection=ref.split(':')[0]||'';
    return [new Date(r.criado_em).toLocaleString('pt-BR',{timeZone:'America/Recife',hour12:false}),names[r.ator_id]||'Sistema',clean(r.acao,60),collection,auditIdentifier(ref,details.antes,details.depois),JSON.stringify(details.antes??'').slice(0,1200),JSON.stringify(details.depois??'').slice(0,1200)];
   })});
  }
  if(fn==='salvar'){
   if(!['OPERAR','GERENCIAR'].includes(user.nivel))return json({error:'Sem permissão para editar.'},403);
   const col=clean(input.colecao),ord=Number(input.ordem||0),data=input.dados;
   if(!allowed.includes(col)||!data||typeof data!=='object'||Array.isArray(data))return json({error:'Registro inválido.'},400);
   const spec=q(await db.from('global_colecoes').select('colunas').eq('modulo','frotas').eq('nome',col).maybeSingle());
   if(!spec)throw Error('Coleção indisponível.');
   const keys=spec.colunas as string[],fields=Object.keys(data);
   if(fields.length>40||fields.some((k:string)=>!keys.includes(k)))return json({error:'Campos não permitidos'},400);
   const row:any={};
   for(const k of keys){
    const v=(data as any)[k];
    if(v==null){row[k]='';continue;}
    if(typeof v==='number'||typeof v==='boolean'){row[k]=v;continue;}
    let s=String(v).slice(0,4000);
    if(/^[=+@]/.test(s))s="'"+s;
    row[k]=s;
   }
   for(const index of numeric[col]||[]){
    const k=keys[index];if(!k||row[k]==='')continue;
    const n=parseNumber(row[k]);
    if(n===null)return json({error:'Valor numérico inválido na coluna '+k+'.'},400);
    row[k]=n;
   }
   for(const index of dates[col]||[]){
    const k=keys[index];if(!k||row[k]==='')continue;
    const d=ymd(row[k]);
    if(!d||!validYmd(d))return json({error:'Data inválida na coluna '+k+'.'},400);
    row[k]=d;
   }
   if(col===BASE){
    const plate=clean(row.Placa,30);
    if(!plate)return json({error:'A placa do veículo é obrigatória'},400);
    if(ord===0&&!clean(row.ID,80))row.ID='V'+crypto.randomUUID().replace(/-/g,'').slice(0,7).toUpperCase();
    const all=await rowsOf(BASE);
    const others=all.filter((r:any)=>Number(r.ordem)!==ord).map((r:any)=>r.dados||{});
    if(others.some((d:any)=>clean(d.ID,80).toUpperCase()===clean(row.ID,80).toUpperCase()))return json({error:'ID de veículo já cadastrado.'},409);
    if(others.some((d:any)=>clean(d.Placa,30).toUpperCase()===plate.toUpperCase()))return json({error:'Placa já cadastrada.'},409);
   }else{
    if(col!=='Seguros'&&!clean(row.Placa,30))return json({error:'Informe a placa.'},400);
    if(col==='Seguros'){
     const doc=norm(row['Tipo documento']);
     row['Tipo documento']=doc.includes('apolice')?'Apólice':doc.includes('proposta')?'Proposta':doc.includes('nenhum')?'Nenhum':clean(row['Tipo documento'],80);
     if(!clean(row['Vigência fim'],40)&&clean(row['Vigência início'],40))row['Vigência fim']=addDays(row['Vigência início'],365);
     if(!clean(row['ID Veículo'],80)){
      const vehicle=await vehicleByPlate(row.Placa);
      if(!vehicle)return json({error:'Placa não cadastrada na frota.'},400);
      row['ID Veículo']=clean(vehicle.ID,80);
     }
     const computed=insuranceStatus(row['ID Veículo'],row['Tipo documento'],row['Vigência fim']);
     if('Dias para vencer' in row)row['Dias para vencer']=computed.days===''?'':Number(computed.days);
     if('Situação' in row)row['Situação']=computed.label;
    }else{
     if(!clean(row.ID,80)&&col==='Vencimentos'){
      const vehicle=await vehicleByPlate(row.Placa);
      if(!vehicle)return json({error:'Placa não cadastrada na frota.'},400);
      row.ID=clean(vehicle.ID,80);
     }else if(!clean(row.ID,80))row.ID='FRO-'+crypto.randomUUID().slice(0,12).toUpperCase();
     if(col==='Vencimentos'&&!clean(row['Data de vencimento'],40)&&clean(row['Pago em'],40))row['Data de vencimento']=addDays(row['Pago em'],365);
    }
   }
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
   if(!allowed.includes(col)||!Number.isInteger(ord)||ord<2)return json({error:'Exclusão não permitida.'},400);
   const old=q(await db.from('global_registros').select('dados').match({modulo:'frotas',colecao:col,ordem:ord}).maybeSingle());
   if(!old)return json({error:'Registro não encontrado.'},404);
   if(col===BASE){
    const plate=clean(old.dados?.Placa,30).toUpperCase();
    if(!plate)return json({error:'Veículo sem placa não pode ser excluído.'},400);
    const linked=[];
    for(const other of allowed.filter(c=>c!==BASE)){
     const rs=await rowsOf(other);
     if(rs.some((r:any)=>clean(r.dados?.Placa,30).toUpperCase()===plate))linked.push(other);
    }
    if(linked.length)return json({error:'Veículo possui registros em '+linked.join(', ')+'. Remova ou transfira os vínculos antes de excluir.'},409);
   }
   q(await db.from('global_registros').delete().match({modulo:'frotas',colecao:col,ordem:ord}));
   await audit(user,'EXCLUIR',col,old.dados,null,ord);
   return json({data:{ok:true}});
  }
  return json({error:'Ação desconhecida.'},400);
 }catch(e){console.error('frotas-api',String((e as Error)?.message||e));return json({error:clean((e as Error)?.message||'Erro no Frotas',300)},e instanceof Error&&'status' in e&&e.status===403?403:400);}
});
