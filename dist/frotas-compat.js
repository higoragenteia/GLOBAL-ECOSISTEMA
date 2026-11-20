/* Frotas legacy frontend adapter — keeps original FrotasIndex.html visual, replaces Apps Script with Supabase. */
(function(){
'use strict';
const ENDPOINT='https://krjudhqlpgdnjzrdmtyf.supabase.co/functions/v1/frotas-api';
const KEY='sb_publishable_zcXz2wDyZKVAJvTVHA1bxw_yDKkFI9W';
const TZ='America/Recife';
const SCHEMAS={
 'Base de Dados':{edit:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14],dates:[]},
 'Seguros':{edit:[0,1,2,3,4,5,6,9,10,11,12],dates:[5,6]},
 'Vencimentos':{edit:[0,1,2,3,4,5,6,7,8,9],dates:[4,6]},
 'Vencimentos Extras':{edit:[0,1,2,3,4,5,6,7],dates:[4]},
 'Pagamentos':{edit:[0,1,2,3,4,5,6],dates:[2]},
 'Registros de KM':{edit:[0,1,2,3,4],dates:[2]},
 'Abastecimentos':{edit:[0,1,2,3,4,5,6,7,8,9,10],dates:[2]},
 'Manutenções':{edit:[0,1,2,3,4,5,6,7,8,9,10,11],dates:[2,6]},
 'Fotos Veículos':{edit:[0,1,2,3],dates:[]},
 'Documentos Frota':{edit:[0,1,2,3,4,5,6,7,8],dates:[4,5]}
};
let snapshot=null,loading=null;
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const str=v=>String(v??'').trim();
function ymd(value) {
 if(value==null||value==='')return '';
 const s=str(value),d=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/),iso=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
 return d?d[3]+'-'+d[2]+'-'+d[1]:iso?iso[1]+'-'+iso[2]+'-'+iso[3]:'';
}
function nextYear(value) {
 const v=ymd(value);if(!v)return '';
 const [y,m,d]=v.split('-').map(Number);
 const date=new Date(Date.UTC(y,m-1,d+365));return date.toISOString().slice(0,10);
}
function recDay() {
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return [v.year,v.month,v.day].join('-');
}
function days(v) {const s=ymd(v);if(!s)return NaN;return Math.round((Date.parse(s+'T12:00:00Z')-Date.parse(recDay()+'T12:00:00Z'))/86400000);}
function paid(v){return ['SIM','PAGO','PAGA','REGULARIZADO','REGULARIZADA','QUITADO','CONCLUÍDO','CONCLUIDO'].includes(str(v).toUpperCase());}
function collection(name) {return snapshot?.colecoes?.find(c=>c.nome===name)||{nome:name,colunas:[],registros:[]};}
function rows(name){
 const c=collection(name);
 return (c.registros||[]).slice().sort((a,b)=>a.ordem-b.ordem).map(r=>({row:r.ordem,v:c.colunas.map(k=>r.dados[k]??'')}));
}
function mapped(name,keys) {return rows(name).map(r=>Object.assign({row:r.row},Object.fromEntries(keys.map((k,i)=>[k,r.v[i]??'']))));}
function calcAlerts(d){
 const names=Object.fromEntries(d.vehicles.map(v=>[str(v.plate).toUpperCase(),str(v.model)]));
 const alerts=[],seen=new Map();
 function add(plate,type,date,settled,description) {
  const p=str(plate).toUpperCase(),t=str(type),day=ymd(date);
  if(!p||!t||!day)return;
  const key=p+'|'+t.toUpperCase()+'|'+day;
  if(seen.has(key)){
   const prior=alerts[seen.get(key)];if(settled){prior.paid=true;prior.status='REGULARIZADO';}
   if(!prior.notes&&description)prior.notes=description;
   return;
  }
  const delta=days(day),status=settled?'REGULARIZADO':delta<=0?'VENCIDO':delta<=5?'URGENTE':delta<=10?'PRÓXIMO':'EM DIA';
  seen.set(key,alerts.length);
  alerts.push({key,plate:p,vehicle:names[p]||'',type:t,date:day,days:delta,status,paid:!!settled,notes:description||''});
 }
 const insured={};
 d.insurance.forEach(i=>{if(!norm(i.documentType).includes('apolice')||!i.to)return;const p=str(i.plate).toUpperCase();if(!p)return;if(!insured[p]||i.to>insured[p].to)insured[p]=i;});
 Object.keys(insured).forEach(p=>{const i=insured[p];add(i.plate,'Seguro',i.to,false,i.notes);});
 const known=new Set(Object.keys(insured));
 d.vencimentos.forEach(i=>{if(norm(i.paid).includes('proposta'))return;if(norm(i.type)==='seguro'&&known.has(str(i.plate).toUpperCase()))return;add(i.plate,i.type,i.date,paid(i.paid),i.description);});
 d.extras.forEach(i=>add(i.plate,i.type,i.date,paid(i.paid),i.description));
 d.documents.forEach(i=>add(i.plate,i.type||'Documento',i.date,paid(i.status),i.notes));
 d.maintenance.forEach(i=>{if(i.nextDate)add(i.plate,'Manutenção',i.nextDate,paid(i.status),i.service);});
 return alerts.sort((a,b)=>a.days-b.days);
}
function legacyData(){
 const vehicles=rows('Base de Dados').filter(r=>str(r.v[0])).map(r=>({row:r.row,id:str(r.v[0]),type:r.v[1],model:r.v[2],plate:r.v[3],year:r.v[6],color:r.v[7],owner:r.v[8],driver:r.v[10],crlv:r.v[11],notes:r.v[14]}));
 const insurance=rows('Seguros').filter(r=>str(r.v[0])).map(r=>{const start=ymd(r.v[5]),finish=ymd(r.v[6]);return{row:r.row,id:r.v[0],plate:r.v[1],insurer:r.v[2],policy:r.v[3],documentType:r.v[4],from:start,to:finish||nextYear(start),toManual:!!finish,status:r.v[8],premium:r.v[9],installments:r.v[10],installmentAmount:r.v[11],notes:r.v[12]};});
 const d={
 vehicles,insurance,
 extras:mapped('Vencimentos Extras',['id','plate','type','description','date','amount','paid','notes']).map(x=>({...x,date:ymd(x.date)})),
 vencimentos:mapped('Vencimentos',['id','plate','type','description','date','paid','paidAt','amount','receipt','notes']).map(x=>({...x,date:ymd(x.date)||nextYear(x.paidAt),paidAt:ymd(x.paidAt)})),
 payments:mapped('Pagamentos',['id','plate','date','type','description','amount','receipt']),
 km:mapped('Registros de KM',['id','plate','date','odometer','notes']),
 fuel:mapped('Abastecimentos',['id','plate','date','fuel','liters','amount','odometer','station','receipt','notes','driver']),
 maintenance:mapped('Manutenções',['id','plate','date','service','odometer','amount','nextDate','nextKm','status','provider','receipt','notes']).map(x=>({...x,nextDate:ymd(x.nextDate)})),
 photos:mapped('Fotos Veículos',['id','plate','url','caption']),
 documents:mapped('Documentos Frota',['id','plate','type','url','issued','date','status','notes','amount']).map(x=>({...x,date:ymd(x.date)}))
 };
 d.alerts=calcAlerts(d);
 d.updatedAt=new Date().toLocaleString('pt-BR',{timeZone:TZ,hour12:false});
 d.sheetUrl='';
 return d;
}
async function backend(fn,input={}) {
 if(!window.GlobalSession||typeof window.GlobalSession.access!=='function')throw Error('Sessão do GLOBAL indisponível.');
 const token=await window.GlobalSession.access();
 if(!token)throw Error('Sessão expirada. Entre pelo GLOBAL ECOSISTEMA.');
 const response=await fetch(ENDPOINT,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({fn,...input})});
 let body;try{body=await response.json();}catch(_){throw Error('Resposta inválida do Supabase.');}
 if(!response.ok||body.error)throw Error(body.error||'Falha na operação.');
 return body.data;
}
async function bootstrap(force=false){
 if(snapshot&&!force)return snapshot;
 if(loading&&!force)return loading;
 const request=backend('bootstrap').then(data=>{snapshot=data;return data;}).finally(()=>{loading=null;});
 loading=request;return request;
}
async function call(fn,...args) {
 if(fn==='getBootstrap'){
  const data=await bootstrap();
  const u=data.usuario,lvl=u.nivel;
  return {ok:true,user:{id:u.id,nome:u.nome,email:u.email||'',perfil:lvl==='VISUAL'?'CONSULTA':'ADMIN',painel:true,painelNivel:lvl,canManage:false}};
 }
 if(fn==='getData'){await bootstrap(true);return legacyData();}
 if(fn==='getTables'){
  const d=await bootstrap(true),out={};
  if(d.usuario.nivel==='VISUAL')throw Error('Esta área requer Operar ou Gerenciar.');
  Object.entries(SCHEMAS).forEach(([name,schema])=>{
   const c=collection(name);if(!c.colunas.length)return;
   out[name]={headers:c.colunas,rows:rows(name).map(r=>({row:r.row,values:r.v})),editable:schema.edit,dates:schema.dates};
  });
  return out;
 }
 if(fn==='getAudit'){
  const d=await bootstrap(true);if(d.usuario.nivel!=='GERENCIAR')throw Error('Área reservada à gestão.');
  return rows('Histórico de Alterações').slice(-100).reverse().map(r=>r.v);
 }
 if(fn==='saveRecord'){
  const [name,ord,vals]=args,schema=SCHEMAS[name];if(!schema||!Array.isArray(vals))throw Error('Campos inválidos.');
  const d=await bootstrap();
  if(d.usuario.nivel==='VISUAL')throw Error('Não autorizado a editar.');
  const col=collection(name),old=col.registros.find(r=>r.ordem===Number(ord)),out=old?{...old.dados}:{};
  col.colunas.forEach((key,i)=>{if(schema.edit.includes(i))out[key]=vals[i]??'';else if(!(key in out))out[key]='';});
  const result=await backend('salvar',{colecao:name,ordem:Number(ord)||0,dados:out});snapshot=null;return {ok:true,row:result.ordem,tab:name};
 }
 if(fn==='deleteRecord'){
  const [name,ord]=args;if(!SCHEMAS[name])throw Error('Categoria inválida.');
  const result=await backend('excluir',{colecao:name,ordem:Number(ord)});snapshot=null;return result;
 }
 if(fn==='verificarSistema')return {ok:true,backend:'Supabase',modulo:'frotas'};
 throw Error('Usuários e senhas são administrados no GLOBAL ECOSISTEMA.');
}
window.GVGFrotasCompat={call,_test:{ymd,days,paid,calcAlerts,legacyData}};
})();