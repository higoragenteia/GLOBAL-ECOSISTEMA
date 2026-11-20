/* Frotas legacy frontend adapter — mantém a interface original do FrotasIndex.html
   e troca o Apps Script/Sheets pelo Supabase, usando a sessão do painel GLOBAL. */
(function(){
'use strict';
const ENDPOINT=window.GVG_FROTAS_ENDPOINT||'https://krjudhqlpgdnjzrdmtyf.supabase.co/functions/v1/frotas-api';
const KEY='sb_publishable_zcXz2wDyZKVAJvTVHA1bxw_yDKkFI9W';
const TZ='America/Recife';
const BASE='Base de Dados';
const AUDIT='Histórico de Alterações';
const SCHEMAS={
 [BASE]:{edit:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14],dates:[],numeric:[13]},
 'Seguros':{edit:[0,1,2,3,4,5,6,9,10,11,12],dates:[5,6],numeric:[9,10,11]},
 'Vencimentos':{edit:[0,1,2,3,4,5,6,7,8,9],dates:[4,6],numeric:[7]},
 'Vencimentos Extras':{edit:[0,1,2,3,4,5,6,7],dates:[4],numeric:[5]},
 'Pagamentos':{edit:[0,1,2,3,4,5,6],dates:[2],numeric:[5]},
 'Registros de KM':{edit:[0,1,2,3,4],dates:[2],numeric:[3]},
 'Abastecimentos':{edit:[0,1,2,3,4,5,6,7,8,9,10],dates:[2],numeric:[4,5,6]},
 'Manutenções':{edit:[0,1,2,3,4,5,6,7,8,9,10,11],dates:[2,6],numeric:[4,5,7]},
 'Fotos Veículos':{edit:[0,1,2,3],dates:[]},
 'Documentos Frota':{edit:[0,1,2,3,4,5,6,7,8],dates:[4,5],numeric:[8]}
};
let snapshot=null,loading=null;
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const str=v=>String(v??'').trim();

/* Datas: aceita o formato brasileiro e o ISO do banco. */
function ymd(value) {
 if(value==null||value==='')return '';
 const s=str(value),d=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/),iso=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
 return d?d[3]+'-'+d[2]+'-'+d[1]:iso?iso[1]+'-'+iso[2]+'-'+iso[3]:'';
}
function addDays(value,amount) {
 const v=ymd(value);if(!v)return '';
 const date=new Date(v+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+amount);
 return date.toISOString().slice(0,10);
}
function validYmd(value){const s=ymd(value);if(!s)return false;const d=new Date(s+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;}
function nextYear(value){return addDays(value,365);}
function recDay() {
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return [v.year,v.month,v.day].join('-');
}
function days(v) {const s=ymd(v);if(!s)return NaN;return Math.round((Date.parse(s+'T12:00:00Z')-Date.parse(recDay()+'T12:00:00Z'))/86400000);}
function paid(v){return ['SIM','PAGO','PAGA','REGULARIZADO','REGULARIZADA','QUITADO','CONCLUÍDO','CONCLUIDO'].includes(str(v).toUpperCase());}
function uid() {
 const c=globalThis.crypto;
 if(c&&typeof c.randomUUID==='function')return 'FRO-'+c.randomUUID().slice(0,12).toUpperCase();
 return 'FRO-'+Math.random().toString(36).slice(2,12).toUpperCase();
}
function vehicleUid() {
 const c=globalThis.crypto;
 if(c&&typeof c.randomUUID==='function')return 'V'+c.randomUUID().replace(/-/g,'').slice(0,7).toUpperCase();
 return 'V'+Math.random().toString(36).slice(2,9).toUpperCase();
}
function dataCollections(data){return Array.isArray(data?.colecoes)?data.colecoes:[];}
function collectionFrom(data,name) {return dataCollections(data).find(c=>c.nome===name)||{nome:name,colunas:[],registros:[]};}
function collection(name) {return collectionFrom(snapshot,name);}
function rowsFrom(data,name) {
 const c=collectionFrom(data,name);
 return (c.registros||[]).slice().sort((a,b)=>Number(a.ordem)-Number(b.ordem)).map(r=>({row:Number(r.ordem),v:(c.colunas||[]).map(k=>r.dados?.[k]??'')}));
}
function rows(name){return rowsFrom(snapshot,name);}
function mapped(data,name,keys) {return rowsFrom(data,name).map(r=>Object.assign({row:r.row},Object.fromEntries(keys.map((k,i)=>[k,r.v[i]??'']))));}

/* Calcula as colunas automáticas da aba Seguros, como as fórmulas da planilha. */
function insuranceStatus(row) {
 const id=str(row?.id??row?.['ID Veículo']);
 const doc=norm(row?.documentType??row?.['Tipo documento']);
 const to=ymd(row?.to??row?.['Vigência fim']);
 if(!id)return {days:'',label:''};
 const d=to?days(to):NaN;
 if(doc.includes('nenhum'))return {days:to?String(d):'',label:'SEM SEGURO'};
 if(!to)return {days:'',label:'VERIFICAR'};
 if(doc.includes('proposta'))return {days:String(d),label:'SEM APÓLICE CONFIRMADA'};
 return {days:String(d),label:d<=0?'VENCIDO':d<=30?'VENCE EM ATÉ 30 DIAS':'VIGENTE'};
}

function calcAlerts(d){
 const names=Object.fromEntries((d.vehicles||[]).map(v=>[str(v.plate).toUpperCase(),str(v.model)]));
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
 (d.insurance||[]).forEach(i=>{if(!norm(i.documentType).includes('apolice')||!i.to)return;const p=str(i.plate).toUpperCase();if(!p)return;if(!insured[p]||i.to>insured[p].to)insured[p]=i;});
 Object.keys(insured).forEach(p=>{const i=insured[p];add(i.plate,'Seguro',i.to,false,i.notes);});
 const known=new Set(Object.keys(insured));
 (d.vencimentos||[]).forEach(i=>{if(norm(i.paid).includes('proposta'))return;if(norm(i.type)==='seguro'&&known.has(str(i.plate).toUpperCase()))return;add(i.plate,i.type,i.date,paid(i.paid),i.description);});
 (d.extras||[]).forEach(i=>add(i.plate,i.type,i.date,paid(i.paid),i.description));
 (d.documents||[]).forEach(i=>add(i.plate,i.type||'Documento',i.date,paid(i.status),i.notes));
 (d.maintenance||[]).forEach(i=>{if(i.nextDate)add(i.plate,'Manutenção',i.nextDate,paid(i.status),i.service);});
 return alerts.sort((a,b)=>a.days-b.days);
}

function legacyData(data=snapshot){
 const vehicles=rowsFrom(data,BASE).filter(r=>str(r.v[0])).map(r=>({row:r.row,id:str(r.v[0]),type:r.v[1],model:r.v[2],plate:r.v[3],year:r.v[6],color:r.v[7],owner:r.v[8],driver:r.v[10],crlv:r.v[11],notes:r.v[14]}));
 const insurance=rowsFrom(data,'Seguros').filter(r=>str(r.v[0])).map(r=>{
  const start=ymd(r.v[5]),finish=ymd(r.v[6]);
  const computed=insuranceStatus({id:r.v[0],documentType:r.v[4],to:finish});
  return {row:r.row,id:r.v[0],plate:r.v[1],insurer:r.v[2],policy:r.v[3],documentType:r.v[4],from:start,to:finish||nextYear(start),toManual:!!finish,status:r.v[8]||computed.label,daysToExpire:r.v[7]!==''?r.v[7]:computed.days,premium:r.v[9],installments:r.v[10],installmentAmount:r.v[11],notes:r.v[12]};
 });
 const d={
  vehicles,insurance,
  extras:mapped(data,'Vencimentos Extras',['id','plate','type','description','date','amount','paid','notes']).map(x=>({...x,date:ymd(x.date)})),
  vencimentos:mapped(data,'Vencimentos',['id','plate','type','description','date','paid','paidAt','amount','receipt','notes']).map(x=>({...x,date:ymd(x.date)||nextYear(x.paidAt),paidAt:ymd(x.paidAt)})),
  payments:mapped(data,'Pagamentos',['id','plate','date','type','description','amount','receipt']),
  km:mapped(data,'Registros de KM',['id','plate','date','odometer','notes']),
  fuel:mapped(data,'Abastecimentos',['id','plate','date','fuel','liters','amount','odometer','station','receipt','notes','driver']),
  maintenance:mapped(data,'Manutenções',['id','plate','date','service','odometer','amount','nextDate','nextKm','status','provider','receipt','notes']).map(x=>({...x,nextDate:ymd(x.nextDate)})),
  photos:mapped(data,'Fotos Veículos',['id','plate','url','caption']),
  documents:mapped(data,'Documentos Frota',['id','plate','type','url','issued','date','status','notes','amount']).map(x=>({...x,date:ymd(x.date)}))
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
 if(!response.ok||!body||body.error)throw Error(body?.error||'Falha na operação.');
 return body.data;
}
async function bootstrap(force=false){
 if(snapshot&&!force)return snapshot;
 if(loading)return loading;
 const request=backend('bootstrap').then(data=>{snapshot=data;return data;}).finally(()=>{loading=null;});
 loading=request;return request;
}
async function panelUsers(){
 if(!window.globalPanelCall)throw Error('A gestão de contas é feita no painel GLOBAL ECOSISTEMA.');
 return (await window.globalPanelCall('adminUsuarios'))||[];
}
async function panelUserByEmail(email){
 const wanted=str(email).toLowerCase();
 const user=(await panelUsers()).find(u=>str(u.email).toLowerCase()===wanted);
 if(!user)throw Error('Usuário não encontrado no painel GLOBAL.');
 return user;
}
async function panelSaveUser(user,patch){
 const payload={...user,...patch,permissoes:{...(user.permissoes||{}),...(patch.permissoes||{})}};
 return window.globalPanelCall('adminSalvarUsuario',user.id,payload);
}
function panelFrotasRole(role){return str(role).toUpperCase()==='ADMIN'?'GERENCIAR':'VISUAL';}

function parseNumber(value,label) {
 if(typeof value==='number'){
  if(!Number.isFinite(value))throw Error('Valor numérico inválido em '+label+'.');
  return value;
 }
 const s=str(value).replace(/R\$/g,'').replace(/\s/g,'');
 if(!s)return '';
 if(!/^-?[\d.,]+$/.test(s))throw Error('Valor numérico inválido em '+label+'.');
 const normalized=s.includes(',')?s.replace(/\./g,'').replace(',','.'):s;
 const n=Number(normalized);
 if(!Number.isFinite(n))throw Error('Valor numérico inválido em '+label+'.');
 return n;
}
function safeText(value) {
 const s=str(value);
 return /^[=+@]/.test(s)?"'"+s:s;
}
function prepareRecord(name,ord,vals,data){
 const schema=SCHEMAS[name];
 if(!schema)throw Error('Tabela ou registro não autorizado.');
 if(!Array.isArray(vals))throw Error('Dados incompletos: número de campos diferente do esperado.');
 const col=collectionFrom(data,name);
 if(!col.colunas?.length)throw Error('Coleção indisponível: '+name+'. Execute database/frotas.sql no Supabase.');
 const position=Number(ord)||0;
 const old=position>0?(col.registros||[]).find(r=>Number(r.ordem)===position):null;
 if(position>0&&!old)throw Error('O registro não existe. Atualize e tente novamente.');
 const out={};
 col.colunas.forEach((key,i)=>{
  if(schema.edit.includes(i))out[key]=vals[i]??'';
  else out[key]=old?.dados?.[key]??'';
 });
 for(const i of schema.edit){
  const key=col.colunas[i];if(!key)continue;
  if(schema.dates.includes(i)){const d=str(out[key])?ymd(out[key]):'';if(str(out[key])&&!validYmd(d))throw Error('Data inválida em '+key+'.');out[key]=d;}
  else if((schema.numeric||[]).includes(i))out[key]=parseNumber(out[key],key);
  else if(typeof out[key]==='string')out[key]=safeText(out[key]);
 }
 const baseVehicles=rowsFrom(data,BASE).filter(r=>str(r.v[0])).map(r=>({id:str(r.v[0]),plate:str(r.v[3]),model:str(r.v[2])}));
 const findVehicle=plate=>baseVehicles.find(v=>v.plate.toUpperCase()===str(plate).toUpperCase());
 if(name===BASE){
  const id=str(out['ID']),plate=str(out['Placa']);
  if(!plate)throw Error('Informe a placa do veículo.');
  if(!id)out['ID']=vehicleUid();
  const others=(col.registros||[]).filter(r=>Number(r.ordem)!==position).map(r=>r.dados||{});
  if(others.some(r=>str(r['ID']).toUpperCase()===str(out['ID']).toUpperCase()))throw Error('ID de veículo já cadastrado.');
  if(others.some(r=>str(r['Placa']).toUpperCase()===plate.toUpperCase()))throw Error('Placa já cadastrada.');
 }else{
  if(name==='Seguros'){
   const doc=norm(out['Tipo documento']);
   if(doc.includes('apolice'))out['Tipo documento']='Apólice';
   else if(doc.includes('proposta'))out['Tipo documento']='Proposta';
   else if(doc.includes('nenhum'))out['Tipo documento']='Nenhum';
   if(!str(out['Vigência fim'])&&str(out['Vigência início']))out['Vigência fim']=nextYear(out['Vigência início']);
   if(!str(out['ID Veículo'])){
    const vehicle=findVehicle(out['Placa']);
    if(!vehicle)throw Error('Placa não cadastrada na frota.');
    out['ID Veículo']=vehicle.id;
   }
   const computed=insuranceStatus({id:out['ID Veículo'],documentType:out['Tipo documento'],to:out['Vigência fim']});
   if('Dias para vencer' in out)out['Dias para vencer']=computed.days;
   if('Situação' in out)out['Situação']=computed.label;
  }else{
   if(!str(out['Placa']))throw Error('Informe a placa.');
   if(name==='Vencimentos'&&!str(out['ID'])){
    const vehicle=findVehicle(out['Placa']);
    if(!vehicle)throw Error('Placa não cadastrada na frota.');
    out['ID']=vehicle.id;
   }else if(name!=='Vencimentos'&&!str(out['ID']))out['ID']=uid();
  }
 }
 return out;
}

async function call(fn,...args) {
 if(fn==='getBootstrap'){
  const data=await bootstrap();
  const u=data.usuario,lvl=u.nivel;
  return {ok:true,user:{id:u.id,nome:u.nome,email:u.email||'',perfil:lvl==='VISUAL'?'CONSULTA':'ADMIN',painel:true,painelNivel:lvl,canEdit:lvl!=='VISUAL',canManage:lvl==='GERENCIAR',superadmin:!!u.superadmin}};
 }
 if(fn==='getData'){await bootstrap(true);return legacyData();}
 if(fn==='getTables'){
  const d=await bootstrap(true);
  if(d.usuario.nivel==='VISUAL')throw Error('Esta área requer Operar ou Gerenciar.');
  const out={};
  Object.entries(SCHEMAS).forEach(([name,schema])=>{
   const c=collection(name);if(!c.colunas.length)return;
   out[name]={headers:c.colunas,rows:rows(name).map(r=>({row:r.row,values:r.v})),editable:schema.edit,dates:schema.dates};
  });
  return out;
 }
 if(fn==='getAudit'){
  const d=await bootstrap();
  if(d.usuario.nivel!=='GERENCIAR')throw Error('Área reservada à gestão.');
  let remote=[];
  try{remote=await backend('getAuditoria');}catch(e){remote=[];}
  const local=rows(AUDIT).map(r=>r.v);
  return remote.concat(local).slice(0,100);
 }
 if(fn==='saveRecord'){
  const [name,ord,vals]=args;
  if(!SCHEMAS[name])throw Error('Tabela ou registro não autorizado.');
  const d=await bootstrap();
  if(d.usuario.nivel==='VISUAL')throw Error('Não autorizado a editar.');
  const record=prepareRecord(name,Number(ord)||0,vals,d);
  const result=await backend('salvar',{colecao:name,ordem:Number(ord)||0,dados:record});
  snapshot=null;
  return {ok:true,row:result.ordem,tab:name};
 }
 if(fn==='deleteRecord'){
  const [name,ord]=args;
  if(!SCHEMAS[name])throw Error('Categoria inválida.');
  const d=await bootstrap();
  if(d.usuario.nivel!=='GERENCIAR')throw Error('Apenas o perfil Gerenciar pode excluir registros.');
  const result=await backend('excluir',{colecao:name,ordem:Number(ord)});
  snapshot=null;
  return result;
 }
 if(fn==='verificarSistema')return {ok:true,backend:'Supabase',modulo:'frotas',fonte:'PostgreSQL'};
 if(fn==='importarSheets'){
  const result=await backend('importarSheets');
  snapshot=null;
  return result;
 }
 if(fn==='alterarMinhaSenha'){
  if(!window.globalPanelCall)throw Error('Alteração de senha disponível no painel GLOBAL.');
  const result=await window.globalPanelCall('alterarMinhaSenha',args[0]||{});
  return {ok:true,...result};
 }
 if(fn==='logoutUsuario'){
  if(window.GlobalSession&&typeof window.GlobalSession.logout==='function')await window.GlobalSession.logout();
  return {ok:true};
 }
 if(fn==='listarUsuarios'){
  const users=await panelUsers();
  return users.map(u=>({email:u.email,nome:u.nome,perfil:u.permissoes?.frotas==='GERENCIAR'?'ADMIN':'CONSULTA',status:u.status,solicitadoEm:'',ultimoAcesso:'',atualizadoEm:''}));
 }
 if(fn==='aprovarUsuario'||fn==='alterarPerfilUsuario'){
  const p=args[0]||{},user=await panelUserByEmail(p.email);
  await panelSaveUser(user,{status:fn==='aprovarUsuario'?'ATIVO':user.status,perfil:str(p.perfil).toUpperCase()==='ADMIN'?'ADMIN':'OPERADOR',permissoes:{frotas:panelFrotasRole(p.perfil)}});
  return {ok:true};
 }
 if(fn==='recusarUsuario'||fn==='excluirUsuario'||fn==='bloquearUsuario'){
  const p=args[0]||{},user=await panelUserByEmail(p.email);
  const status=fn==='bloquearUsuario'?(str(p.status).toUpperCase()==='ATIVO'?'ATIVO':'BLOQUEADO'):'EXCLUIDO';
  await window.globalPanelCall('adminSituacaoUsuario',null,user.id,status);
  return {ok:true};
 }
 if(fn==='redefinirSenhaUsuario'){
  const p=args[0]||{},nova=str(p.nova);
  if(!nova)throw Error('Informe a nova senha.');
  if(str(p.confirmar)!==nova)throw Error('As senhas não conferem.');
  const user=await panelUserByEmail(p.email);
  await window.globalPanelCall('adminRedefinirSenha',null,user.id,nova);
  return {ok:true};
 }
 if(fn==='loginUsuario'||fn==='registrarUsuario'){
  throw Error('Entre pelo painel GLOBAL ECOSISTEMA; o Frotas usa a mesma sessão.');
 }
 throw Error('Função não disponível neste módulo.');
}
async function importSheets(){return call('importarSheets');}

window.GVGFrotasCompat={call,importSheets,_test:{ymd,addDays,validYmd,days,paid,insuranceStatus,prepareRecord,calcAlerts,legacyData,parseNumber}};
})();
