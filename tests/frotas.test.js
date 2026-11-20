import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseGviz,buildCollection,buildCollections,counts,fetchCollections,SHEET_NAMES,FALLBACK_HEADERS} from '../supabase/functions/frotas-api/import-data.js';

const HEADERS={
 'Base de Dados':['ID','Tipo','Marca / Modelo','Placa','Chassi','RENAVAM','Ano Fab/Mod','Cor','Proprietário (CRLV)','CPF/CNPJ','Condutor / Responsável','CRLV (exercício)','CRLV emitido em','Valor de compra','Observações'],
 'Seguros':['ID Veículo','Placa','Seguradora','Nº Apólice / Proposta','Tipo documento','Vigência início','Vigência fim','Dias para vencer','Situação','Prêmio total (R$)','Parcelas','Valor da parcela','Observação / Arquivo'],
 'Vencimentos':['ID','Placa','Categoria','Descrição','Data de vencimento','Status pagamento','Pago em','Valor (R$)','Comprovante URL','Observações'],
 'Vencimentos Extras':['ID','Placa','Tipo','Descrição','Vencimento','Valor','Pago/Regularizado','Observação'],
 'Pagamentos':['ID','Placa','Data','Tipo','Descrição','Valor','Comprovante URL'],
 'Registros de KM':['ID','Placa','Data','Quilometragem','Observação'],
 'Abastecimentos':['ID','Placa','Data','Combustível','Litros','Valor (R$)','Quilometragem','Posto','Comprovante URL','Observação','Motorista'],
 'Manutenções':['ID','Placa','Data','Serviço','Quilometragem','Valor (R$)','Próxima revisão (data)','Próxima revisão (km)','Status','Prestador','Comprovante URL','Observação'],
 'Fotos Veículos':['ID','Placa','Foto URL','Legenda'],
 'Documentos Frota':['ID','Placa','Tipo','Documento URL','Emissão','Vencimento','Status','Observação','Valor do IPVA'],
 'Histórico de Alterações':['Data/Hora','Usuário','Operação','Aba','ID / Placa','Campo','Valor anterior','Novo valor'],
 'Alertas Automáticos App':['Chave','Placa','Veículo','Tipo','Vencimento','Dias restantes','Status','Alerta -10','Alerta -5','Pago/Regularizado','Última verificação','Observação'],
 'Histórico Push Frota':['Data/Hora','Placa','Tipo','Status']
};

function collection(name,records=[]){
 return {nome:name,colunas:HEADERS[name],cabecalho:1,registros:records.map((dados,i)=>({ordem:i+2,dados}))};
}
function values(name,data){
 return HEADERS[name].map(key=>data[key]??'');
}
function fixtureCollections(){
 return [
  collection('Base de Dados',[{ID:'V1',Placa:'ABC1D23','Marca / Modelo':'Modelo A',Tipo:'Caminhão'},{ID:'V2',Placa:'DEF4G56','Marca / Modelo':'Modelo B',Tipo:'Utilitário'}]),
  collection('Seguros',[{'ID Veículo':'V1',Placa:'ABC1D23',Seguradora:'Seguradora QA','Tipo documento':'Apólice','Vigência início':'2026-01-01','Vigência fim':'2099-01-01',Situação:'VIGENTE'}]),
  collection('Vencimentos',[{ID:'V2',Placa:'DEF4G56',Categoria:'IPVA','Data de vencimento':'2000-01-01','Status pagamento':'NÃO'}]),
  collection('Vencimentos Extras',[{ID:'V2',Placa:'DEF4G56',Tipo:'Licenciamento',Vencimento:'2001-01-01','Pago/Regularizado':'SIM'}]),
  collection('Pagamentos',[{ID:'FRO-1',Placa:'V1',Data:'2026-01-02',Tipo:'Serviço',Valor:10}]),
  collection('Registros de KM',[{ID:'FRO-2',Placa:'V1',Data:'2026-01-03',Quilometragem:1000}]),
  collection('Abastecimentos',[{ID:'FRO-3',Placa:'V1',Data:'2026-01-04',Litros:10,Valor:100}]),
  collection('Manutenções',[{ID:'FRO-4',Placa:'V1','Data':'2026-01-05','Serviço':'Revisão','Próxima revisão (data)':'2099-02-01'}]),
  collection('Fotos Veículos',[]),
  collection('Documentos Frota',[{ID:'FRO-5',Placa:'V1',Tipo:'CRLV','Vencimento':'2002-01-01',Status:'PENDENTE'}]),
  collection('Histórico de Alterações',[['20/11/2026 10:00','Antigo','EDITAR','Base de Dados','V1','Placa','','']]),
  collection('Alertas Automáticos App',[]),
  collection('Histórico Push Frota',[])
 ];
}

function loadAdapter(level='GERENCIAR'){
 const code=readFileSync(new URL('../frotas-compat.js',import.meta.url),'utf8');
 const calls=[],panelCalls=[];
 const u={id:'qa-user',nome:'Responsável QA',email:'qa@example.invalid',perfil:level==='GERENCIAR'?'ADMIN':'OPERADOR',nivel:level,superadmin:false};
 const collections=fixtureCollections();
 const fetch=async(url,options)=>{
  const body=JSON.parse(options.body);calls.push({url,body});
  let data;
  if(body.fn==='bootstrap')data={colecoes:collections,usuario:u,fonte:'Supabase PostgreSQL'};
  else if(body.fn==='getAuditoria')data=[['20/11/2026 11:00','Responsável QA','SALVAR','Base de Dados','V1','{}','{}']];
  else if(body.fn==='salvar')data={ok:true,ordem:99};
  else if(body.fn==='excluir')data={ok:true};
  else if(body.fn==='importarSheets')data={ok:true,colecoes:13,registros:87,backup:'b1'};
  else data={ok:true};
  return {ok:true,json:async()=>({data})};
 };
 const context={console,Intl,URLSearchParams,Date,Math,JSON,Number,String,Object,Array,RegExp,Error,Promise,Set,Map,crypto:globalThis.crypto,fetch,localStorage:{getItem:()=>null,setItem(){},removeItem(){}},window:null,GlobalSession:{access:async()=>'token',logout:async()=>{}}};
 context.window=context;context.globalThis=context;
 context.globalPanelCall=async(fn,...args)=>{
  panelCalls.push({fn,args});
  if(fn==='adminUsuarios')return [{id:'other',nome:'Outro',email:'outro@example.invalid',perfil:'OPERADOR',status:'PENDENTE',permissoes:{pedidos:'',gastos:'',fornecedores:'',maquinas:'',frotas:'VISUAL'}}];
  if(fn==='alterarMinhaSenha')return {ok:true};
  return {ok:true};
 };
 vm.createContext(context);vm.runInContext(code,context);
 return {api:context.GVGFrotasCompat,test:context.GVGFrotasCompat._test,calls,panelCalls};
}

test('Frotas/importação: gviz, cabeçalhos de contingência e contagem',()=>{
 const table={cols:[{label:'ID'},{label:'Placa'},{label:'Data'}],rows:[{c:[{v:'V1'},{v:'ABC1D23'},{v:'2026-11-20',f:'20/11/2026'}]},{c:[null,null,null]}]};
 const raw='/*O_o*/ google.visualization.Query.setResponse('+JSON.stringify({status:'ok',table})+');';
 assert.equal(parseGviz(raw).rows.length,2);
 const built=buildCollection('Base de Dados',table);
 assert.deepEqual(built.colunas,['ID','Placa','Data']);
 assert.equal(built.registros.length,1);
 assert.equal(built.registros[0].dados.Data,'20/11/2026');
 const empty=buildCollection('Pagamentos',{cols:[],rows:[]});
 assert.deepEqual(empty.colunas,FALLBACK_HEADERS.Pagamentos);
 assert.equal(empty.registros.length,0);
 const tables=Object.fromEntries(SHEET_NAMES.map(name=>[name,{cols:HEADERS[name].map(label=>({label})),rows:[]}]));
 const all=buildCollections(tables);
 assert.equal(all.length,13);
 assert.deepEqual(counts(all),{colecoes:13,registros:0});
});
test('Frotas/importação: falha de rede é reportada e não retorna base parcial',async()=>{
 const okTable={cols:[{label:'ID'}],rows:[]};
 let n=0;
 const fake=async()=>({ok:++n!==3,text:async()=> 'setResponse('+JSON.stringify({status:'ok',table:okTable})+');',status:500});
 await assert.rejects(fetchCollections(fake,'test-sheet'),/HTTP 500/);
 await assert.rejects(fetchCollections(fake,''),/FROTAS_SHEET_ID/);
});
test('Frotas/adaptador: bootstrap respeita VISUAL, OPERAR e GERENCIAR',async()=>{
 const ger=await loadAdapter('GERENCIAR').api.call('getBootstrap');
 assert.equal(ger.user.canManage,true);assert.equal(ger.user.canEdit,true);
 const ope=await loadAdapter('OPERAR').api.call('getBootstrap');
 assert.equal(ope.user.canManage,false);assert.equal(ope.user.canEdit,true);
 const vis=await loadAdapter('VISUAL').api.call('getBootstrap');
 assert.equal(vis.user.canManage,false);assert.equal(vis.user.canEdit,false);
});
test('Frotas/adaptador: getData mantém veículos, documentos e alertas',async()=>{
 const {api}=loadAdapter('GERENCIAR');
 const d=await api.call('getData');
 assert.equal(d.vehicles.length,2);
 assert.equal(d.vehicles[0].plate,'ABC1D23');
 assert.equal(d.insurance.length,1);
 assert.equal(d.documents.length,1);
 assert.ok(d.alerts.some(a=>a.plate==='DEF4G56'&&a.type==='IPVA'&&a.status==='VENCIDO'));
 assert.ok(d.alerts.some(a=>a.type==='Licenciamento'&&a.paid));
 assert.ok(d.alerts.some(a=>a.type==='Seguro'&&a.status==='EM DIA'));
});
test('Frotas/adaptador: gravação gera IDs, normaliza seguro e valida placa/numéricos',async()=>{
 const {api,calls}=loadAdapter('GERENCIAR');
 await api.call('saveRecord','Base de Dados',0,values('Base de Dados',{Placa:'XYZ9Z99','Marca / Modelo':'Novo'}));
 let body=calls.at(-1).body;
 assert.equal(body.fn,'salvar');assert.match(body.dados.ID,/^V[A-F0-9]{7}$/);

 await api.call('saveRecord','Seguros',0,values('Seguros',{Placa:'ABC1D23','Tipo documento':'apolice','Vigência início':'2099-01-01','Prêmio total (R$)':'100'}));
 body=calls.at(-1).body;
 assert.equal(body.dados['ID Veículo'],'V1');
 assert.equal(body.dados['Tipo documento'],'Apólice');
 assert.equal(body.dados['Vigência fim'],'2100-01-01');
 assert.equal(body.dados['Dias para vencer'],String(Math.round((Date.parse('2100-01-01T12:00:00Z')-Date.parse(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Recife'}).format(new Date())+'T12:00:00Z'))/86400000)));

 await api.call('saveRecord','Vencimentos',0,values('Vencimentos',{Placa:'ABC1D23',Categoria:'IPVA','Data de vencimento':'31/12/2099','Valor (R$)':'1.234,56'}));
 body=calls.at(-1).body;
 assert.equal(body.dados.ID,'V1');
 assert.equal(body.dados['Data de vencimento'],'2099-12-31');
 assert.equal(body.dados['Valor (R$)'],1234.56);

 await assert.rejects(api.call('saveRecord','Pagamentos',0,values('Pagamentos',{})),/placa/i);
 await assert.rejects(api.call('saveRecord','Pagamentos',0,values('Pagamentos',{Placa:'ABC1D23',Valor:'abc'})),/numérico/i);
 await assert.rejects(api.call('saveRecord','Pagamentos',0,values('Pagamentos',{Placa:'ABC1D23',Data:'31/02/2026'})),/Data inválida/i);
 await assert.rejects(api.call('saveRecord','Base de Dados',0,values('Base de Dados',{Placa:'ABC1D23'})),/Placa já cadastrada/);
 await api.call('saveRecord','Pagamentos',0,values('Pagamentos',{Placa:'ABC1D23',Data:'2026-01-01',Valor:'10'}));
 assert.match(calls.at(-1).body.dados.ID,/^FRO-/);
});
test('Frotas/adaptador: exclusão e importação exigem Gerenciar',async()=>{
 const vis=loadAdapter('VISUAL');
 await assert.rejects(vis.api.call('saveRecord','Pagamentos',0,values('Pagamentos',{Placa:'ABC1D23'})),/Não autorizado/);
 const ope=loadAdapter('OPERAR');
 await assert.rejects(ope.api.call('deleteRecord','Pagamentos',2),/Gerenciar/);
 const ger=loadAdapter('GERENCIAR');
 await ger.api.call('deleteRecord','Pagamentos',2);
 assert.equal(ger.calls.at(-1).body.fn,'excluir');
 await ger.api.call('importarSheets');
 assert.equal(ger.calls.at(-1).body.fn,'importarSheets');
});
test('Frotas/adaptador: auditoria, senha e usuários usam o painel central',async()=>{
 const {api,calls,panelCalls}=loadAdapter('GERENCIAR');
 const audit=await api.call('getAudit');
 assert.equal(audit.length,2);
 assert.equal(audit[0][2],'SALVAR');
 await api.call('alterarMinhaSenha',{atual:'x',nova:'nova-senha',confirmar:'nova-senha'});
 assert.equal(panelCalls.at(-1).fn,'alterarMinhaSenha');
 const users=await api.call('listarUsuarios');
 assert.equal(users[0].email,'outro@example.invalid');
 assert.equal(users[0].perfil,'CONSULTA');
 await api.call('aprovarUsuario',{email:'outro@example.invalid',perfil:'CONSULTA'});
 assert.equal(panelCalls.at(-1).fn,'adminSalvarUsuario');
});
test('Frotas/entrega: página completa, sem Apps Script nem dados embutidos, integrada ao painel',()=>{
 const frotas=readFileSync(new URL('../frotas.html',import.meta.url),'utf8');
 const painel=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(frotas,/frotas-compat\.js/);
 assert.match(frotas,/GVGFrotasCompat\.call/);
 assert.match(frotas,/gvgImportFrotas/);
 assert.doesNotMatch(frotas,/google\.script\.run/);
 assert.doesNotMatch(frotas,/<\?!=/);
 assert.match(frotas,/const FROTA_FOTOS_POR_PLACA = Object\.freeze\(\{/);
 assert.match(frotas,/data:image\//);
 assert.doesNotMatch(frotas,/service_role|private_key|SUPABASE_SERVICE_ROLE_KEY|AIza[0-9A-Za-z_-]{20,}/);
 assert.ok(frotas.length>3000000);
 assert.match(painel,/data-view="frotas"/);
 assert.match(painel,/const FROTAS_URL = new URL\("\.\/frotas\.html/);
 assert.match(painel,/sameOrigin=origin===location\.origin/);
 assert.match(painel,/new URL\(FROTAS_URL,location\.href\)/);
 assert.doesNotMatch(painel,/Frotas aguarda suas orientações/);
 const inicio=painel.indexOf('<section id="gvgpViewFrotas"');
 const fim=painel.indexOf('</section>',inicio);
 const viewFrotas=painel.slice(inicio,fim);
 assert.doesNotMatch(viewFrotas,/Voltar à visão geral|Abrir Controle de Frotas/,'cabeçalho extra do Frotas deve estar removido');
 assert.match(viewFrotas,/gvgpFrotasFrame/,'iframe do Frotas deve permanecer');
});
test('Frotas/migração: módulo e coleções sem dados reais no SQL',()=>{
 const sql=readFileSync(new URL('../database/frotas.sql',import.meta.url),'utf8');
 const global=readFileSync(new URL('../database/global.sql',import.meta.url),'utf8');
 assert.match(sql,/values\('frotas'\)/);
 assert.match(sql,/global_colecoes/);
 assert.doesNotMatch(sql,/insert into public\.global_registros/i);
 assert.doesNotMatch(sql,/ABC1D23|DEF4G56/);
 assert.match(global,/'gastos','fornecedores','maquinas','frotas'/);
});
test('Build: Frotas não regride as páginas já publicadas dos outros módulos',()=>{
 for(const file of ['dist/gastos.html','dist/fornecedores.html','dist/maquinas.html']){
  const html=readFileSync(new URL('../'+file,import.meta.url),'utf8');
  assert.match(html,/global-api\.js/,file+' deve manter o transporte global');
  assert.match(html,/pedidos-api\.js/,file+' deve manter a sessão compartilhada');
  assert.ok(html.length>20000,file+' não pode virar página reduzida');
 }
});
test('Frotas/API: permissões centrais e importação com backup/auditoria',()=>{
 const {runInNewContext}=vm;
 const api=readFileSync(new URL('../supabase/functions/frotas-api/index.ts',import.meta.url),'utf8');
 const globalApi=readFileSync(new URL('../supabase/functions/global-api/index.ts',import.meta.url),'utf8');
 const importer=readFileSync(new URL('../supabase/functions/frotas-api/import-data.js',import.meta.url),'utf8');
 const clean=(v,n=100)=>String(v??'').trim().slice(0,n);
 const levelCode=api.slice(api.indexOf('function level('),api.indexOf('async function actor')).replaceAll('(u:any)','(u)').replaceAll('(u: any)','(u)');
 const level=runInNewContext(levelCode+';level',{clean});
 assert.equal(level({perfil:'SUPERADMIN',permissoes:{}}),'GERENCIAR');
 assert.equal(level({perfil:'ADMIN',permissoes:{frotas:'GERENCIAR'}}),'GERENCIAR');
 assert.equal(level({perfil:'ADMIN',permissoes:{frotas:'ADMIN'}}),'GERENCIAR');
 assert.equal(level({perfil:'ADMIN',permissoes:{frotas:'OPERAR'}}),'OPERAR');
 assert.equal(level({perfil:'OPERADOR',permissoes:{frotas:'GERENCIAR'}}),'OPERAR');
 assert.equal(level({perfil:'ADMIN',permissoes:{}}),'');
 assert.match(api,/fn==='getAuditoria'/);
 assert.match(api,/global_backups/);
 assert.match(api,/p_acao:'IMPORTAR_FROTAS'/);
 assert.match(api,/Somente Gerenciar pode importar/);
 assert.match(api,/Veículo possui registros/);
 assert.match(api,/Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/);
 assert.doesNotMatch(api,/AIza[0-9A-Za-z_-]{20,}/);
 assert.match(importer,/FROTAS_SHEET_ID/);
 assert.doesNotMatch(importer,/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{20,}/);
 assert.match(globalApi,/apps\.frotas/);
 assert.match(globalApi,/veículos na frota/);
});
