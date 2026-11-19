// @ts-nocheck
import {createClient} from 'npm:@supabase/supabase-js@2.119.1';
import {makeRuntime} from './records.js';
import {createModule as gastos} from './gastos.js';
import {createModule as fornecedores} from './fornecedores.js';
import {createModule as maquinas} from './maquinas.js';
const URL=Deno.env.get('SUPABASE_URL')!, KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json; charset=utf-8'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
const checked=r=>{if(r.error)throw Error(r.error.message);return r.data;};
const factories={gastos,fornecedores,maquinas};
const keys=['pedidos','gastos','fornecedores','maquinas'];
const str=(v,max=200)=>String(v??'').trim().slice(0,max);
const isSuper=u=>u.perfil==='SUPERADMIN';
function level(u,m){if(!keys.includes(m))return '';return u.perfil==='SUPERADMIN'?'GERENCIAR':u.permissoes?.[m]||'';}
function publicUser(u){const perms=Object.fromEntries(keys.map(m=>[m,level(u,m)]));return {id:u.id,nome:u.nome,login:u.login,email:u.email,foto:u.foto,perfil:u.perfil,status:u.status,superadmin:isSuper(u),permissoes:perms,projetos:keys.filter(k=>!!perms[k]),podeGerenciarPedidos:perms.pedidos==='GERENCIAR',podeOperarPedidos:['GERENCIAR','OPERAR'].includes(perms.pedidos)};}
async function allUsers(){return checked(await db.from('pedidos_usuarios').select('*').order('criado_em'));}
async function userAction(fn,args,u){
 if(!isSuper(u))throw Error('Somente o Superadministrador pode gerenciar usuários.');
 if(fn==='adminUsuarios')return (await allUsers()).map(publicUser);
 if(fn==='adminSalvarUsuario'){
  const d=args[1]||{};let id=str(d.id,80);const existing=id?checked(await db.from('pedidos_usuarios').select('*').eq('id',id).single()):null;
  if(existing&&(existing.id===u.id||existing.perfil==='SUPERADMIN'))throw Error('A conta principal não pode ser alterada por este formulário.');
  const perfil=d.perfil||'OPERADOR';if(!['OPERADOR','ADMIN'].includes(perfil))throw Error('Perfil inválido.');
  const status=d.status||'ATIVO';if(!['ATIVO','PENDENTE','BLOQUEADO','EXCLUIDO'].includes(status))throw Error('Situação inválida.');
  const login=str(d.login,120).toLowerCase();if(!/^[a-z0-9._-]{2,40}$/.test(login)&&!/^\S+@\S+\.\S+$/.test(login))throw Error('Login inválido.');
  const email=str(d.email,200).toLowerCase()||(login.includes('@')?login:login+'@pedidos.gvg.invalid');if(!/^\S+@\S+\.\S+$/.test(email))throw Error('E-mail inválido.');
  const perms={};for(const m of keys){const v=d.permissoes?.[m]||'';if(!['','VISUAL','OPERAR','GERENCIAR'].includes(v)||(perfil==='OPERADOR'&&v==='GERENCIAR'))throw Error('Permissão inválida.');perms[m]=v;}
  const record={nome:str(d.nome,120),login,email,perfil,status,permissoes:perms};if(!record.nome)throw Error('Informe o nome.');
  if(!id){const password=String(d.senha||'');if(password.length<8||password.length>128)throw Error('Use senha de 8 a 128 caracteres.');const a=checked(await db.auth.admin.createUser({email,password,email_confirm:true}));id=a.user.id;const saved=await db.from('pedidos_usuarios').insert({id,...record});if(saved.error){await db.auth.admin.deleteUser(id);throw Error(saved.error.message);}}
  else {if(email!==existing.email)checked(await db.auth.admin.updateUserById(id,{email,email_confirm:true}));checked(await db.from('pedidos_usuarios').update(record).eq('id',id));}
  checked(await db.from('global_auditoria').insert({ator_id:u.id,modulo:'acesso',acao:fn,referencia:id}));return {ok:true};
 }
 if(fn==='adminSituacaoUsuario'){
  const target=checked(await db.from('pedidos_usuarios').select('*').eq('id',args[1]).single());if(target.id===u.id||target.perfil==='SUPERADMIN')throw Error('A conta principal não pode ser bloqueada.');
  if(!['ATIVO','PENDENTE','BLOQUEADO','EXCLUIDO'].includes(args[2]))throw Error('Situação inválida.');
  checked(await db.from('pedidos_usuarios').update({status:args[2]}).eq('id',target.id));checked(await db.from('global_auditoria').insert({ator_id:u.id,modulo:'acesso',acao:fn,referencia:target.id,detalhes:{status:args[2]}}));return {ok:true};
 }
 throw Error('Operação não disponível.');
}
const userFns=new Set(['criarUsuario','editarUsuario','salvarUsuario','aprovarUsuario','recusarUsuario','alterarPerfilUsuario','bloquearUsuario','desbloquearUsuario','excluirUsuario','resetarSenhaUsuario','redefinirSenhaUsuario']);
async function moduleUserAction(m,fn,p,u){
 if(!isSuper(u))throw Error('A gestão de contas compartilhadas é exclusiva do Superadministrador. Use o painel principal.');
 const users=await allUsers();let target=users.find(x=>x.id===p.id||x.id===p.usuarioId||(p.email&&x.email.toLowerCase()===String(p.email).toLowerCase()));
 if(['resetarSenhaUsuario','redefinirSenhaUsuario'].includes(fn)){
  if(!target)throw Error('Usuário não encontrado.');if(target.perfil==='SUPERADMIN'&&target.id!==u.id)throw Error('Acesso negado.');const password=String(p.novaSenha||p.nova||p.senha||'');if(password.length<8||password.length>128)throw Error('Use senha de 8 a 128 caracteres.');checked(await db.auth.admin.updateUserById(target.id,{password}));return {ok:true};
 }
 if(['bloquearUsuario','desbloquearUsuario','recusarUsuario','excluirUsuario'].includes(fn)){
  if(!target)throw Error('Usuário não encontrado.');const status=fn==='desbloquearUsuario'||p.status==='ATIVO'?'ATIVO':fn==='excluirUsuario'?'EXCLUIDO':'BLOQUEADO';return userAction('adminSituacaoUsuario',['',target.id,status],u);
 }
 const managing=['ADMIN','ADMINISTRADOR'].includes(p.perfil);const perms={...(target?.permissoes||{}),[m]:managing?'GERENCIAR':'VISUAL'};
 const d={...target,id:target?.id,nome:p.nome||target?.nome,login:p.login||p.usuario||target?.login||p.email,email:p.email||target?.email,senha:p.senha,status:fn==='aprovarUsuario'?'ATIVO':p.status||target?.status||'ATIVO',perfil:managing?'ADMIN':target?.perfil||'OPERADOR',permissoes:perms};
 const result=await userAction('adminSalvarUsuario',['',d],u);return {...result,item:d,usuario:d};
}
async function changeOwnPassword(p,u,token){
 const password=String(p.novaSenha||p.nova||p.senhaNova||''),current=String(p.senhaAtual||p.atual||'');
 if(password.length<8||password.length>128)throw Error('Use senha de 8 a 128 caracteres.');if(p.confirmar!==undefined&&p.confirmar!==password)throw Error('As senhas não conferem.');
 const authClient=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 checked(await authClient.auth.signInWithPassword({email:u.email,password:current}));
 const res=await fetch(URL+'/auth/v1/user',{method:'PUT',headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({password})});if(!res.ok)throw Error('Não foi possível alterar a senha.');return {ok:true,mensagem:'Senha alterada.'};
}

const readNames={gastos:new Set(['getBootstrap','getDadosDashboard','getAuditoria','listarUsuarios']),fornecedores:new Set(['getBootstrap','getRelatorios','getProductImage','selfTest']),maquinas:new Set(['setupStatus','bootstrap','detalheEquipamento','listarMovimentacoes','listarManutencoes','listarUsuarios','listarAuditoria'])};
const writeNames={gastos:new Set(['addGasto','editarGasto','excluirGasto','ajustarSaldo','alterarOrcamento','cadastrarOpcao','editarAjuste','excluirAjuste']),fornecedores:new Set(['salvarFornecedor','desativarFornecedor','salvarProduto','excluirProduto','salvarCotacao','excluirCotacao','alterarPreco','salvarCompra','salvarConfiguracao']),maquinas:new Set(['criarEquipamento','editarEquipamento','marcarRevisadoEquipamento','inativarEquipamento','reativarEquipamento','excluirEquipamento','criarColaborador','editarColaborador','inativarColaborador','reativarColaborador','excluirColaborador','criarCategoria','editarCategoria','inativarCategoria','reativarCategoria','excluirCategoria','registrarEntrega','registrarDevolucao','registrarTransferencia','abrirManutencao','atualizarManutencao','concluirManutencao','cancelarManutencao','sincronizarTudo'])};
function legacyUsers(users,m){if(m==='maquinas')return [['ID','NOME','EMAIL','PERFIL','STATUS','CRIADO_EM','ATUALIZADO_EM'],...users.map(u=>[u.id,u.nome,u.email,level(u,m)==='GERENCIAR'?'ADMINISTRADOR':'VISUAL',u.status,u.criado_em,u.criado_em])];return [['E-mail','Nome','Perfil','Status','Último acesso','Atualizado em','SenhaHash','SenhaSalt','Solicitado em','Aprovado por','Aprovado em'],...users.map(u=>[u.email,u.nome,level(u,m)==='GERENCIAR'?'ADMIN':'CONSULTA',u.status,'','','','','','',''])];}
function addVirtualUsers(ctx,users,m){ctx.book.USUARIOS=legacyUsers(users,m);ctx.book.SESSOES=[[]];}
async function runModule(m,fn,args,u,requestId){
 const lvl=level(u,m);if(userFns.has(fn))return moduleUserAction(m,fn,args[0]||{},u);if(!lvl)throw Error('Seu perfil não tem acesso a este aplicativo.');
 const write=writeNames[m].has(fn);if(!write&&!readNames[m].has(fn)&&fn!=='criarBackup')throw Error('Gerencie contas e senhas pelo painel principal.');
 if((write||['getAuditoria','listarAuditoria','listarUsuarios','criarBackup'].includes(fn))&&lvl!=='GERENCIAR')throw Error('Seu acesso a este aplicativo é somente leitura.');
 if(write&&!/^[A-Za-z0-9_-]{8,100}$/.test(requestId))throw Error('Identificador de requisição inválido.');
 if(write){const cached=checked(await db.from('global_operacoes').select('resultado').match({modulo:m,ator_id:u.id,request_id:requestId}).maybeSingle());if(cached)return cached.resultado;}
 const snapshot=checked(await db.rpc('global_snapshot',{p_modulo:m}));if(!snapshot)throw Error('Módulo ainda não configurado.');
 if(fn==='criarBackup'){
  const saved=checked(await db.from('global_backups').insert({modulo:m,ator_id:u.id,conteudo:snapshot}).select('id').single());
  return {ok:true,id:saved.id,nome:'Backup '+m+' '+new Date().toISOString().slice(0,10),backup:snapshot};
 }
 const ctx=makeRuntime(snapshot.colecoes);const users=lvl==='GERENCIAR'?(await allUsers()).filter(x=>!!level(x,m)):[];addVirtualUsers(ctx,users,m);
 if(fn==='selfTest'){
  const d=fornecedores(ctx.runtime,u,lvl).run('getBootstrap',[]).data;
  const productIds=new Set(d.produtos.map(x=>x.id)),supplierIds=new Set(d.fornecedores.map(x=>x.id));
  const checks=[{name:'Fornecedores e produtos',ok:productIds.size===d.produtos.length&&supplierIds.size===d.fornecedores.length,detail:'Identificadores únicos.'},{name:'Vínculos das cotações',ok:d.cotacoes.every(x=>productIds.has(x.produtoId)&&supplierIds.has(x.fornecedorId)),detail:'Produtos e fornecedores referenciados existem.'},{name:'Valores das cotações',ok:d.cotacoes.every(x=>Number.isFinite(x.precoTotal)&&x.precoTotal>=0),detail:'Totais numéricos não negativos.'}];
  return {ok:checks.every(x=>x.ok),checks,message:'Verificação concluída sem alterar dados.'};
 }
 const result=await factories[m](ctx.runtime,u,lvl).run(fn,args,requestId);
 if(write){const committed=checked(await db.rpc('global_aplicar',{p_modulo:m,p_revisao:snapshot.revisao,p_ator:u.id,p_request:requestId,p_acao:fn,p_colecoes:ctx.changes(),p_resultado:result??null}));return committed.resultado;}
 return result;
}
async function panel(u){
 const apps={};const jobs=[];
 if(level(u,'pedidos'))jobs.push((async()=>{const q=db.from('pedidos_ordens').select('id',{count:'exact',head:true});if(!['SUPERADMIN','ADMIN'].includes(u.perfil)&&level(u,'pedidos')!=='GERENCIAR')q.eq('usuario_id',u.id);const r=await q;checked(r);apps.pedidos={valor:r.count||0,label:'pedidos registrados',ativo:true};})());
 for(const m of Object.keys(factories)){if(!level(u,m))continue;jobs.push((async()=>{
  if(m==='gastos'){const d=await runModule(m,'getDadosDashboard',[],u,'');apps.gastos={valor:new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(d.summary.spent),label:'gastos no mês',ativo:true};}
  if(m==='fornecedores'){const r=checked(await db.from('global_registros').select('dados').match({modulo:m,colecao:'FORNECEDORES'}));apps[m]={valor:r.filter(x=>x.dados.Status!=='Inativo').length,label:'fornecedores ativos',ativo:true};}
  if(m==='maquinas'){const r=checked(await db.from('global_registros').select('dados').match({modulo:m,colecao:'EQUIPAMENTOS'}));apps[m]={valor:r.filter(x=>x.dados.STATUS!=='INATIVO').length,label:'equipamentos ativos',ativo:true};}
 })());}
 await Promise.all(jobs);return {ok:true,usuario:publicUser(u),ambiente:'GLOBAL ECOSISTEMA',atualizadoEm:new Date().toLocaleString('pt-BR',{timeZone:'America/Recife'}),vazio:!apps.pedidos?.valor,apps,atividades:[]};
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});if(req.method!=='POST')return reply({error:'Método inválido.'},405);
 try{
  const text=await req.text();if(text.length>2500000)return reply({error:'Requisição muito grande.'},413);
  const body=JSON.parse(text),m=str(body.modulo),fn=str(body.fn),args=Array.isArray(body.args)?body.args:[];
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!token)return reply({error:'Entre na sua conta.'},401);
  const auth=await db.auth.getUser(token);if(auth.error||!auth.data.user)return reply({error:'Sessão expirada.'},401);
  const u=checked(await db.from('pedidos_usuarios').select('*').eq('id',auth.data.user.id).maybeSingle());if(!u||u.status!=='ATIVO')return reply({error:'Cadastro pendente ou bloqueado.'},403);
  let result;
  if(m==='painel'){
   if(fn==='getPainelInicial'||fn==='getPainelExternos')result=await panel(u);
   else if(fn==='perfil')result=publicUser(u);
   else result=await userAction(fn,args,u);
  }else{if(!factories[m])throw Error('Aplicativo indisponível.');result=fn==='alterarMinhaSenha'?await changeOwnPassword(args[0]||{},u,token):await runModule(m,fn,args,u,str(body.requestId,100));}
  return reply({data:result});
 }catch(e){console.error('global-api',e?.code||'',e?.message||'Falha');return reply({error:e?.message||'Falha na operação.',code:e?.code||'ERRO'},400);}
});
