/*
 * Teste de fumaça da interface Frotas em navegador real (headless).
 *
 * Não faz parte de `npm test` porque depende do Playwright e do Chromium.
 * Pré-requisitos:
 *   npm install --no-save playwright
 *   npx playwright install chromium
 *   npm run test:ui
 *
 * O teste sobe um servidor estático local, intercepta a Edge Function
 * `frotas-api` e usa uma fixture sintética. Nenhum dado real é enviado ou
 * gravado. Ele cobre: login SSO simulado, painel GERENCIAR, painel VISUAL,
 * tabela administrativa, criação de veículo, bloqueio de escrita e deep link.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const PORT=Number(process.env.FROTAS_UI_PORT||8765);
const BASE=`http://127.0.0.1:${PORT}`;
const H={
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
const records={
 'Base de Dados':[
  {ID:'V1',Tipo:'Caminhão','Marca / Modelo':'Modelo A',Placa:'ABC1D23','Ano Fab/Mod':'2020/2021',Cor:'Branco','Condutor / Responsável':'Motorista QA','Valor de compra':100000},
  {ID:'V2',Tipo:'Utilitário','Marca / Modelo':'Modelo B',Placa:'DEF4G56','Ano Fab/Mod':'2022/2023',Cor:'Prata','Condutor / Responsável':'Motorista QA 2','Valor de compra':80000}
 ],
 'Seguros':[{'ID Veículo':'V1',Placa:'ABC1D23',Seguradora:'Seguradora QA','Nº Apólice / Proposta':'A-1','Tipo documento':'Apólice','Vigência início':'2026-01-01','Vigência fim':'2099-01-01','Prêmio total (R$)':1000}],
 'Vencimentos':[{ID:'V2',Placa:'DEF4G56',Categoria:'IPVA',Descrição:'IPVA QA','Data de vencimento':'2000-01-01','Status pagamento':'NÃO','Valor (R$)':500}],
 'Vencimentos Extras':[],
 'Pagamentos':[{ID:'FRO-1',Placa:'V1',Data:'2026-01-02',Tipo:'Serviço',Descrição:'Serviço QA',Valor:10}],
 'Registros de KM':[{ID:'FRO-2',Placa:'V1',Data:'2026-01-03',Quilometragem:1000}],
 'Abastecimentos':[{ID:'FRO-3',Placa:'V1',Data:'2026-01-04',Combustível:'Diesel',Litros:10,Valor:100}],
 'Manutenções':[{ID:'FRO-4',Placa:'V1',Data:'2026-01-05','Serviço':'Revisão QA','Próxima revisão (data)':'2099-02-01',Status:'OK'}],
 'Fotos Veículos':[],
 'Documentos Frota':[{ID:'FRO-5',Placa:'V1',Tipo:'CRLV','Vencimento':'2002-01-01',Status:'PENDENTE'}],
 'Histórico de Alterações':[],
 'Alertas Automáticos App':[],
 'Histórico Push Frota':[]
};
const collections=Object.keys(H).map(nome=>({nome,colunas:H[nome],cabecalho:1,registros:(records[nome]||[]).map((dados,i)=>({ordem:i+2,dados}))}));

function bootstrapData(level){
 const user={id:'qa-user',nome:'Responsável QA',email:'qa@example.invalid',perfil:level==='GERENCIAR'?'ADMIN':'OPERADOR',superadmin:false,nivel:level};
 return {colecoes:collections,usuario:user,fonte:'Supabase PostgreSQL',firebase:'EXTERNO_FCM'};
}
async function makePage(browser,level='GERENCIAR'){
 const context=await browser.newContext();
 await context.addInitScript(()=>{
  localStorage.setItem('pedidosTeste:auth',JSON.stringify({access_token:'fake-token',refresh_token:'fake-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'qa-user'}}));
  localStorage.setItem('globalEco:gvgUsrToken','SUPABASE-qa-user');
 });
 const page=await context.newPage();
 const errors=[];let saved=null;
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.route('**/functions/v1/frotas-api',async route=>{
  const body=route.request().postDataJSON();
  let data;
  if(body.fn==='bootstrap')data=bootstrapData(level);
  else if(body.fn==='salvar'){saved=body;data={ok:true,ordem:99};}
  else if(body.fn==='excluir')data={ok:true};
  else if(body.fn==='getAuditoria')data=[];
  else if(body.fn==='importarSheets')data={ok:true,colecoes:13,registros:87};
  else data={ok:true};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data})});
 });
 return {context,page,errors,get saved(){return saved}};
}
async function waitForServer(){
 for(let i=0;i<80;i++){
  try{const r=await fetch(BASE+'/frotas.html');if(r.ok)return;}catch(_){}
  await new Promise(r=>setTimeout(r,100));
 }
 throw new Error('Servidor estático não iniciou em '+BASE);
}

const server=spawn('python3',['-m','http.server',String(PORT),'--bind','127.0.0.1'],{cwd:fileURLToPath(new URL('..',import.meta.url)),stdio:'ignore'});
let browser;
try{
 await waitForServer();
 browser=await chromium.launch({headless:true});

 const a=await makePage(browser,'GERENCIAR');
 await a.page.goto(BASE+'/frotas.html',{waitUntil:'networkidle'});
 await a.page.waitForFunction(()=>document.body.classList.contains('isManager'),null,{timeout:15000});
 assert.equal(await a.page.locator('#authScreen').evaluate(el=>el.classList.contains('hide')),true,'tela de login deve ficar oculta');
 assert.match(await a.page.locator('#stats').innerText(),/2/);
 assert.equal(await a.page.locator('#gvgImportFrotas').isVisible(),true,'importação visível para GERENCIAR');
 assert.match(await a.page.locator('#sessionUser').textContent(),/Gerenciamento/);

 await a.page.locator('button.navbtn[data-go="admin"]').click();
 await a.page.waitForSelector('#page-admin.on');
 await a.page.locator('#loadTablesBtn').click();
 await a.page.waitForFunction(()=>document.querySelectorAll('#adminTab option').length>0);
 await a.page.locator('#adminAdd').click();
 await a.page.waitForSelector('#modal.open');
 await a.page.locator('#field-3').fill('XYZ9Z99');
 await a.page.locator('#field-2').fill('Veículo QA');
 await a.page.locator('#saveBtn').click();
 await a.page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Salvo no Supabase'),null,{timeout:10000});
 assert.ok(a.saved,'requisição de gravação deve ser enviada');
 assert.equal(a.saved.colecao,'Base de Dados');
 assert.equal(a.saved.dados.Placa,'XYZ9Z99');
 assert.match(a.saved.dados.ID,/^V[A-F0-9]{7}$/);

 a.page.once('dialog',dialog=>dialog.accept());
 await a.page.locator('#gvgImportFrotas').click();
 await a.page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('importados'),null,{timeout:15000});
 assert.match(await a.page.locator('#toast').innerText(),/87 registros/);
 assert.deepEqual(a.errors,[],'sem erros de console/página no fluxo GERENCIAR');
 console.log('UI GERENCIAR: ok');

 const b=await makePage(browser,'VISUAL');
 await b.page.goto(BASE+'/frotas.html',{waitUntil:'networkidle'});
 await b.page.waitForFunction(()=>document.querySelector('#stats')&&document.querySelector('#stats').textContent.length>0,null,{timeout:15000});
 assert.equal(await b.page.locator('#gvgImportFrotas').isVisible(),false,'importação oculta para VISUAL');
 assert.equal(await b.page.locator('button.navbtn[data-go="admin"]').isVisible(),false,'administração oculta para VISUAL');
 const denied=await b.page.evaluate(async()=>{try{await window.GVGFrotasCompat.call('saveRecord','Base de Dados',0,[]);return 'allowed'}catch(e){return e.message}});
 assert.match(denied,/Não autorizado/);
 assert.deepEqual(b.errors,[],'sem erros de console/página no fluxo VISUAL');
 console.log('UI VISUAL: ok');

 const c=await makePage(browser,'GERENCIAR');
 await c.page.goto(BASE+'/frotas.html?alerta='+encodeURIComponent('DEF4G56|IPVA|2000-01-01'),{waitUntil:'networkidle'});
 await c.page.waitForSelector('#page-vehicle.on',{timeout:15000});
 assert.match(await c.page.locator('#toast').innerText(),/Notificação aberta/);
 assert.deepEqual(c.errors,[],'sem erros de console/página no deep link');
 console.log('UI deep link: ok');

 const semSessao=await browser.newContext();
 const semSessaoPage=await semSessao.newPage();
 await semSessaoPage.goto(BASE+'/frotas.html',{waitUntil:'networkidle'});
 await semSessaoPage.waitForSelector('.gvgPanelLink',{timeout:15000});
 assert.match(await semSessaoPage.locator('#authBody').innerText(),/Acesso pelo painel/);
 await semSessao.close();
 console.log('UI sem sessão: ok');

 const panelUser={id:'qa-user',nome:'Responsável QA',login:'qa',email:'qa@example.invalid',perfil:'ADMIN',status:'ATIVO',superadmin:false,permissoes:{pedidos:'OPERAR',gastos:'',fornecedores:'',maquinas:'',frotas:'GERENCIAR'},projetos:['frotas'],podeGerenciarPedidos:false,podeOperarPedidos:true};
 const panelData={ok:true,usuario:panelUser,apps:{frotas:{valor:2,label:'veículos na frota',ativo:true}},atualizadoEm:'20/11/2026 10:00',vazio:false,atividades:[]};
 const d=await makePage(browser,'GERENCIAR');
 await d.page.route('**/functions/v1/global-api',async route=>{
  const body=route.request().postDataJSON();
  let data;
  if(body.fn==='getPainelInicial')data=panelData;
  else if(body.fn==='getPainelExternos')data={ok:true,atividades:[]};
  else if(body.fn==='perfil')data=panelUser;
  else if(body.fn==='adminUsuarios')data=[panelUser];
  else data={ok:true};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data})});
 });
 await d.page.route('**/auth/v1/logout*',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
 await d.page.goto(BASE+'/index.html',{waitUntil:'networkidle'});
 await d.page.waitForFunction(()=>document.body.textContent.includes('Responsável QA'),null,{timeout:15000});
 await d.page.locator('button.gvgp-nav-item[data-view="frotas"]').click();
 await d.page.waitForSelector('#gvgpViewFrotas:not(.gvgp-hidden)',{timeout:15000});
 const frame=d.page.frameLocator('#gvgpFrotasFrame');
 await frame.locator('#stats').waitFor({timeout:15000});
 assert.match(await frame.locator('#stats').innerText(),/2/);
 await d.page.waitForFunction(()=>document.querySelector('#gvgpFrotasLoading').classList.contains('gvgp-hidden'),null,{timeout:15000});
 await frame.locator('body').evaluate(()=>window.logout());
 await d.page.waitForFunction(()=>!document.querySelector('#gvgpLoginCard').classList.contains('gvgp-hidden'),null,{timeout:15000});
 assert.match(await d.page.locator('#gvgpFrotasFrame').getAttribute('src'),/about:blank/);
 assert.deepEqual(d.errors,[],'sem erros de console/página no painel + iframe');
 console.log('UI painel + iframe + logout: ok');
}finally{
 if(browser)await browser.close();
 server.kill('SIGTERM');
}
