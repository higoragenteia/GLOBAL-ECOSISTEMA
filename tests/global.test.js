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
