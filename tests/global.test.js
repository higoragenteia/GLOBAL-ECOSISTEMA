import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeRuntime} from '../supabase/functions/global-api/records.js';
import {createModule as gastos} from '../supabase/functions/global-api/gastos.js';
import {createModule as fornecedores} from '../supabase/functions/global-api/fornecedores.js';
import {createModule as maquinas} from '../supabase/functions/global-api/maquinas.js';
const user={id:'qa-user',nome:'Responsável QA',email:'qa@example.invalid'};
const fixture=m=>JSON.parse(readFileSync(new URL('../database/importacao/'+m+'-records.json',import.meta.url)));
const factories={gastos,fornecedores,maquinas};
function app(m,level='GERENCIAR'){const ctx=makeRuntime(fixture(m));ctx.book.USUARIOS=[m==='maquinas'?['ID','NOME','EMAIL','PERFIL','STATUS']:['E-mail','Nome','Perfil','Status']];ctx.book.SESSOES=[[]];return {ctx,call:(fn,...args)=>factories[m](ctx.runtime,user,level).run(fn,args,'REQ-QA-12345678')};}
test('Gastos: importação mantém lançamentos, datas e orçamento; CRUD recalcula saldo',()=>{
 const a=app('gastos');const d=a.call('getDadosDashboard','2026-11');assert.equal(d.expenses.length,11);assert.ok(d.summary.spent>0);assert.ok(d.expenses.every(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)));
 const n={date:'2026-11-19',description:'Teste QA',person:d.people[0],category:d.categories[0],company:'GVG',payment:'Pix',value:12.34,notes:''};
 a.call('addGasto',n);let after=a.call('getDadosDashboard','2026-11');assert.equal(after.expenses.length,12);assert.equal(Math.round((after.summary.spent-d.summary.spent)*100),1234);
 const row=after.expenses.find(x=>x.description==='Teste QA').row;a.call('editarGasto',{...n,row,value:23.45});assert.equal(a.call('getDadosDashboard','2026-11').expenses.find(x=>x.row===row).value,23.45);a.call('excluirGasto',row);assert.equal(a.call('getDadosDashboard','2026-11').expenses.length,11);
 assert.ok(a.ctx.changes().some(c=>c.nome==='Auditoria Dashboard'));
});
test('Gastos: consulta bloqueia gravação',()=>{const a=app('gastos','VISUAL');assert.throws(()=>a.call('addGasto',{}),/permite/);});
test('Fornecedores: bootstrap mantém produtos, cotações e imagens',()=>{const a=app('fornecedores');const d=a.call('getBootstrap');assert.equal(d.ok,true);assert.equal(d.data.fornecedores.length,24);assert.equal(d.data.produtos.length,18);assert.equal(d.data.cotacoes.length,17);assert.ok(d.data.produtos.some(p=>p.imagem));});
test('Fornecedores: criação gera ID e auditoria, consulta bloqueia escrita',()=>{const a=app('fornecedores');a.call('salvarProduto',{nome:'Produto QA',categoria:'QA',unidade:'UN',status:'Ativo'});assert.equal(a.call('getBootstrap').data.produtos.length,19);assert.ok(a.ctx.changes().some(c=>c.nome==='HISTORICO_ACOES'));assert.throws(()=>app('fornecedores','VISUAL').call('salvarProduto',{}),/permite/);});
test('Máquinas: bootstrap e detalhamento preservam equipamentos, vínculos e alertas',()=>{const a=app('maquinas');const d=a.call('bootstrap',{});assert.equal(d.equipamentos.length,50);assert.equal(d.categorias.length,12);assert.equal(d.colaboradores.length,19);const eq=d.equipamentos[0];assert.ok(a.call('detalheEquipamento',{id:eq.id}));});
test('Máquinas: entrega, transferência e devolução mantêm saldo; excesso é rejeitado',()=>{
 const a=app('maquinas');let counter=0;
 const invoke=(fn,p)=>{const engine=maquinas(a.ctx.runtime,user,'GERENCIAR');return engine.run(fn,[p],'REQ-CICLO-'+(++counter));};
 const d=invoke('bootstrap',{});const cat=d.categorias.find(c=>c.ativo);
 const created=invoke('criarEquipamento',{categoriaId:cat.id,descricao:'Equipamento QA',quantidadeTotal:2,estadoConservacao:'NOVO'});const id=created.equipamento.id;
 const delivered=invoke('registrarEntrega',{equipamentoId:id,colaboradorNome:'Responsável QA',data:'2026-11-19',quantidade:1,estadoConservacao:'BOM'});
 assert.equal(delivered.equipamento.quantidadeDisponivel,1);
 assert.throws(()=>invoke('registrarEntrega',{equipamentoId:id,colaboradorNome:'Responsável QA',data:'2026-11-19',quantidade:3}),/Saldo insuficiente/);
 const transferred=invoke('registrarTransferencia',{emprestimoId:delivered.emprestimo.id,novoColaboradorNome:'Novo responsável QA',data:'2026-11-19'});
 assert.equal(transferred.equipamento.quantidadeDisponivel,1);
 const returned=invoke('registrarDevolucao',{emprestimoId:transferred.emprestimo.id,data:'2026-11-19',quantidade:1,estadoConservacao:'BOM',devolverTodosAcessorios:true});
 assert.equal(returned.equipamento.quantidadeDisponivel,2);
 assert.equal(returned.emprestimo.status,'ENCERRADO');
 assert.ok(a.ctx.changes().some(c=>c.nome==='MOVIMENTACOES'));
});
test('Cotações: m² aceita área fracionada, calcula desconto/frete e preserva a unidade ao editar',()=>{
 const a=app('fornecedores');const d=a.call('getBootstrap').data;
 const payload={produtoId:d.produtos[0].id,fornecedorId:d.fornecedores[0].id,quantidade:12.5,unidade:'m²',precoUnitario:80,desconto:10,frete:20,data:'2026-11-19',status:'Recebida'};
 a.call('salvarCotacao',payload);const saved=a.call('getBootstrap').data.cotacoes.find(q=>q.unidade==='m²'&&q.quantidade===12.5);assert.ok(saved);assert.equal(saved.precoTotal,920);
 a.call('salvarCotacao',{...payload,id:saved.id,quantidade:0.5});assert.equal(a.call('getBootstrap').data.cotacoes.find(q=>q.id===saved.id).precoTotal,56);
 for(const quantidade of [0,-1])assert.throws(()=>a.call('salvarCotacao',{...payload,quantidade}),/área/);
 assert.throws(()=>a.call('salvarCotacao',{...payload,unidade:'un'}),/inteiro/);
 a.call('salvarCotacao',{...payload,quantidade:2,unidade:'un'});assert.ok(a.call('getBootstrap').data.cotacoes.some(q=>q.unidade==='un'&&q.quantidade===2&&q.precoTotal===164));
});

// Run the real panel permission functions against the account/access matrix.
import {runInNewContext} from 'node:vm';
test('Pedidos: gestão depende da permissão central; operador pode receber liberação específica',()=>{
 const panel=readFileSync(new URL('../source-original/Painel.html',import.meta.url),'utf8');
 const helpers=panel.slice(panel.indexOf('  const GVG_LEVEL_LABEL='),panel.indexOf('  function permGrid('));
 const api=runInNewContext(helpers+';({projectLevel,levelOptions})');
 const pedidos=readFileSync(new URL('../supabase/functions/pedidos-api/index.ts',import.meta.url),'utf8');
 const backend=pedidos.slice(pedidos.indexOf('const pedidoLevel ='),pedidos.indexOf('const admin =')).replaceAll('(u: any)','(u)');
 const isAdmin=runInNewContext(backend+';isAdmin');
 for(const [perfil,permission,allowed] of [['SUPERADMIN','',true],['ADMIN','GERENCIAR',true],['ADMIN','OPERAR',false],['OPERADOR','GERENCIAR',true],['OPERADOR','OPERAR',false],['OPERADOR','VISUAL',false],['OPERADOR','',false]]){
  const u={perfil,permissoes:{pedidos:permission}};
  assert.equal(api.projectLevel(u,'pedidos')==='GERENCIAR',allowed,perfil+':'+permission);
  assert.equal(isAdmin(u),allowed,perfil+':'+permission);
 }
 assert.match(api.levelOptions('OPERADOR','GERENCIAR','pedidos'),/value="GERENCIAR" selected/);
 assert.doesNotMatch(api.levelOptions('OPERADOR','','maquinas'),/value="GERENCIAR"/);
});
test('Painel: somente superadmin altera contas; liberação de operador fica restrita ao Pedidos',async()=>{
 const source=readFileSync(new URL('../supabase/functions/global-api/index.ts',import.meta.url),'utf8');
 const action=source.slice(source.indexOf('async function userAction('),source.indexOf('const userFns='));
 const saved=[];
 const db={from:table=>({insert:async row=>{saved.push({table,row});return {data:row};}}),auth:{admin:{createUser:async()=>({data:{user:{id:'new-user'}}})}}};
 const call=runInNewContext(action+';userAction',{db,keys:['pedidos','gastos','fornecedores','maquinas'],isSuper:u=>u.perfil==='SUPERADMIN',str:(v)=>String(v||'').trim(),checked:r=>{if(r.error)throw Error(r.error.message);return r.data;}});
 const payload={nome:'Operador',login:'operador',senha:'password-qa',perfil:'OPERADOR',permissoes:{pedidos:'GERENCIAR'}};
 await call('adminSalvarUsuario',[null,payload],{id:'super',perfil:'SUPERADMIN'});
 assert.equal(saved.find(x=>x.table==='pedidos_usuarios').row.permissoes.pedidos,'GERENCIAR');
 for(const perfil of ['ADMIN','OPERADOR'])await assert.rejects(call('adminSalvarUsuario',[null,payload],{id:'other',perfil}),/Superadministrador/);
 for(const key of ['maquinas','gastos','fornecedores'])await assert.rejects(call('adminSalvarUsuario',[null,{...payload,permissoes:{[key]:'GERENCIAR'}}],{id:'super',perfil:'SUPERADMIN'}),/Permissão inválida/);
});
test('Catálogo: adicionar reseta quantidade, confirma e ignora clique repetido',()=>{
 const html=readFileSync(new URL('../pedidos.html',import.meta.url),'utf8');
 const code=html.slice(html.indexOf(' const update=article=>{'),html.indexOf(' // load() já foi chamado'));
 const make=(unit='Unidade',qty='5')=>{
  let clock=1000,saves=0,counts=0,chimes=0;const timers=[],events={},cart={},draft={p:{unit,qty}};
  const button={textContent:'',disabled:false,classList:{toggle(){}},hasAttribute:a=>a==='data-gvg-add',closest:()=>article};
  const input={value:qty},total={},feedback={};
  const article={dataset:{gvgProduct:'p'},querySelector:s=>({'[data-gvg-add]':button,'[data-gvg-qty]':input,'.gvg-inline-total':total,'.gvg-cart-feedback':feedback}[s]),querySelectorAll:()=>[]};
  const grid={addEventListener:(name,fn)=>events[name]=fn,querySelectorAll:()=>[article]};
  runInNewContext(code,{playCartChime:()=>chimes++,grid,draft,cart,DATA:{produtos:[{id:'p'}]},factor:()=>12,amountLabel:()=> 'un.',key:(id,u)=>id+'|'+u,save:()=>saves++,count:()=>counts++,Date:{now:()=>clock},setTimeout:fn=>timers.push(fn)});
  return {draft,cart,button,input,total,feedback,click:()=>events.click({target:{closest:()=>button}}),expire:()=>{clock+=1800;timers.shift()()},get saves(){return saves},get counts(){return counts},get chimes(){return chimes}};
 };
 const a=make();a.click();assert.equal(a.cart['p|Unidade'],5);assert.equal(a.input.value,'1');assert.equal(a.draft.p.qty,'1');assert.equal(a.button.disabled,true);assert.match(a.button.textContent,/5 unidades adicionadas/);assert.match(a.feedback.textContent,/carrinho/);
 a.click();assert.equal(a.cart['p|Unidade'],5);assert.equal(a.saves,1);assert.equal(a.counts,1);assert.equal(a.chimes,1);
 a.expire();assert.equal(a.button.disabled,false);assert.equal(a.feedback.textContent,'');a.click();assert.equal(a.cart['p|Unidade'],6);assert.match(a.button.textContent,/1 unidade adicionada/);
 const pack=make('Caixa','3');pack.click();assert.equal(pack.cart['p|Caixa'],3);assert.equal(pack.draft.p.unit,'Caixa');assert.equal(pack.input.value,'1');assert.match(pack.total.textContent,/12 un/);assert.match(pack.button.textContent,/3 × Caixa/);
 for(const qty of ['0','-1','1.5','10001']){const invalid=make('Unidade',qty);invalid.click();assert.equal(invalid.saves,0);assert.equal(invalid.chimes,0);assert.equal(invalid.input.value,qty);}
});
