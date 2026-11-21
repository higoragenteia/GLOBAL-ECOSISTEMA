import { createClient } from 'npm:@supabase/supabase-js@2.119.1';

const URL = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const BASE = 'https://gvgartefalesquadrias.com.br/';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json; charset=utf-8' };
const answer = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });
const fail = (message: string) => { throw new Error(message); };
const val = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
function checked<T>(result: { data: T; error: any }): T { if (result.error) throw new Error(result.error.message); return result.data; }
async function rows(table: string, match: Record<string, unknown> = {}, sort?: string) {
 const out: any[] = [];
 for (let offset = 0; ; offset += 1000) {
  let query = db.from(table).select('*').match(match).order(sort || (table === 'pedidos_itens' ? 'pedido_id' : 'id'), { ascending: true }).range(offset, offset + 999);
  const page = checked(await query); out.push(...page); if (page.length < 1000) return out;
 }
}
const pedidoLevel = (u: any) => u.perfil === 'SUPERADMIN' ? 'GERENCIAR' : u.permissoes?.pedidos || '';
const isAdmin = (u: any) => pedidoLevel(u) === 'GERENCIAR';
const admin = (u: any) => { if (!isAdmin(u)) fail('Acesso administrativo obrigatório.'); };
const superadmin = (u: any) => { if (u.perfil !== 'SUPERADMIN') fail('Somente o Superadministrador pode gerenciar usuários.'); };
function publicUser(u: any) {
 return { id: u.id, nome: u.nome, login: u.login, email: u.email, foto: u.foto, perfil: u.perfil, status: u.status,
  superadmin: u.perfil === 'SUPERADMIN', permissoes: { pedidos: pedidoLevel(u) }, projetos: pedidoLevel(u) ? ['pedidos'] : [],
  podeGerenciarPedidos: isAdmin(u), podeOperarPedidos: ['GERENCIAR','OPERAR'].includes(pedidoLevel(u)) };
}
const product = (p: any) => ({ id: p.id, nome: p.nome, categoria: p.categoria, unidade: p.unidade, descricao: p.descricao, porCaixa: Number(p.por_caixa), ativo: p.ativo, imagem: p.imagem, referencia: p.referencia });
const order = (o: any) => ({ id: o.id, data: o.criado_em, solicitante: o.solicitante, obra: o.obra, canal: o.canal, situacao: o.situacao, status: o.situacao, dataEntrega: o.entregue_em || '' });
const item = (i: any) => ({ id: i.pedido_id, codigo: i.codigo, nome: i.nome, qtd: Number(i.quantidade), solicitado: Number(i.quantidade), unidade: i.unidade, equiv: Number(i.equivalentes), entregue: i.entregue === null ? null : Number(i.entregue), entregueEquiv: Number(i.entregue_equivalentes), nota: i.nota });
const confItem = (i: any) => ({ codigo: i.codigo, nome: i.nome, solicitado: Number(i.quantidade), unidade: i.unidade, confirmado: Number(i.entregue || 0), pendente: Number(i.quantidade) - Number(i.entregue || 0), nota: i.nota });
// Codifica o UUID aleatorio de 128 bits em apenas 22 caracteres seguros para URL.
function shortConferenceCode(token: unknown) {
 const hex = val(token, 50).replace(/-/g, '');
 if (!/^[a-f0-9]{32}$/i.test(hex)) fail('Token de conferência inválido.');
 const pairs = hex.match(/.{2}/g) || [];
 return btoa(String.fromCharCode(...pairs.map(x => parseInt(x, 16)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fullConferenceToken(code: unknown) {
 const short = val(code, 30);
 if (!/^[A-Za-z0-9_-]{22}$/.test(short)) fail('Link de conferência inválido.');
 let binary = '';
 try { binary = atob(short.replace(/-/g, '+').replace(/_/g, '/') + '=='); }
 catch { fail('Link de conferência inválido.'); }
 if (binary.length !== 16) fail('Link de conferência inválido.');
 const hex = Array.from(binary, c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
 return [hex.slice(0,8), hex.slice(8,12), hex.slice(12,16), hex.slice(16,20), hex.slice(20)].join('-');
}
const orderLink = (o: any) => `${BASE}?k=${encodeURIComponent(o.codigo_curto)}`;
async function getOrder(id: unknown) { return checked(await db.from('pedidos_ordens').select('*').eq('id', val(id, 80)).single()); }
async function audit(u: any, acao: string, referencia: string, detalhes: unknown = {}) { checked(await db.from('pedidos_auditoria').insert({ ator_id: u.id, acao, referencia, detalhes })); }
async function conference(o: any) {
 const items = await rows('pedidos_itens', { pedido_id: o.id });
 return { ok: true, pedido: { id: o.id, solicitante: o.solicitante, solicitanteId: o.usuario_id, obra: o.obra, situacao: o.situacao,
  solicitadoEm: new Date(o.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' }), dataISO: o.criado_em, revisao: o.revisao },
  itens: items.map(confItem), link: orderLink(o), revisao: o.revisao };
}
function message(c: any) {
 const lines = c.itens.map((i: any) => `• *${i.nome}*\n  Solicitado: ${i.solicitado} ${i.unidade}\n  Confirmado: ${i.confirmado} ${i.unidade}\n  Pendente: ${i.pendente} ${i.unidade}${i.nota ? '\n  Observação: ' + i.nota : ''}`).join('\n\n');
 return `*PEDIDO ${c.pedido.id} — ATUALIZADO*\nSolicitante: ${c.pedido.solicitante}\nObra: ${c.pedido.obra}\nSolicitado em: ${c.pedido.solicitadoEm}\n\n*Itens conferidos*\n\n${lines}\n\n*Conferir pedido*\n${c.link}`;
}
async function signup(req: Request, d: any) {
 const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
 const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
 const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
 if (!checked(await db.rpc('pedidos_limitar', { p_chave: 'signup:' + hash }))) fail('Limite de cadastros atingido. Tente novamente em uma hora.');
 const login = val(d.login || d.email, 120).toLowerCase(), senha = String(d.senha || '');
 if (!/^[a-z0-9._-]{2,40}$/.test(login) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login)) fail('Informe um usuário ou e-mail válido.');
 if (!senha) fail('Informe uma senha.');
 if (senha.length > 128) fail('A senha deve ter no máximo 128 caracteres.');
 const email = login.includes('@') ? login : `${login}@pedidos.gvg.invalid`;
 const auth = checked(await db.auth.admin.createUser({ email, password: senha, email_confirm: true }));
 if (!auth.user) fail('Não foi possível criar o cadastro.');
 const saved = await db.from('pedidos_usuarios').insert({ id: auth.user!.id, nome: val(d.nome || login, 120), login, email, status: 'PENDENTE', perfil: 'OPERADOR' });
 if (saved.error) { await db.auth.admin.deleteUser(auth.user!.id); fail('Este usuário já está cadastrado.'); }
 return { status: 'PENDENTE' };
}
async function run(fn: string, a: any[], u: any) {
 if (!pedidoLevel(u) && !['estadoSessaoFuncionarioGVG','sessaoFuncionario','validarSessaoAdminGVG','salvarFotoPerfil'].includes(fn)) fail('Seu perfil não tem acesso ao Pedidos.');
 switch (fn) {
 case 'estadoSessaoFuncionarioGVG': case 'sessaoFuncionario': return { ok: true, ...publicUser(u) };
 case 'validarSessaoAdminGVG': return { ok: isAdmin(u), ...publicUser(u) };
 case 'entrarAdminGVG': admin(u); return { token: 'SUPABASE-' + u.id };
 case 'getCatalogo': {
  const [products, obras, configs] = await Promise.all([rows('pedidos_produtos', {}, 'ordem'), rows('pedidos_obras', { ativa: true }, 'ordem'), rows('pedidos_config', {}, 'chave')]);
  return { produtos: products.filter(p => String(p.ativo || '').trim().toUpperCase() === 'SIM').map(product), obras: obras.map(o => o.nome), whatsapp: configs.find(c => c.chave === 'WHATSAPP_DESTINO')?.valor || '', titulo: 'GVG&ARTEFAL | Pedidos', acesso: { nivel: isAdmin(u) ? 'GERENCIAR' : 'OPERAR', podeOperar: ['GERENCIAR','OPERAR'].includes(pedidoLevel(u)), podeGerenciar: isAdmin(u) } };
 }
 case 'adminListar': admin(u); return { produtos: (await rows('pedidos_produtos', {}, 'ordem')).map(product) };
 case 'salvarProduto': {
  admin(u); const d = a[1] || {}, id = val(d.id, 80) || 'P-' + crypto.randomUUID();
  if (!val(d.nome) || !val(d.categoria)) fail('Preencha nome e categoria.');
  const ativo = val(d.ativo) || 'SIM', factor = Number(d.porCaixa) || 1;
  if (!['SIM', 'NÃO', 'EM FALTA'].includes(ativo) || factor <= 0) fail('Situação ou embalagem inválida.');
  if (d.imagem && !/^https:\/\//i.test(String(d.imagem))) fail('Use uma URL HTTPS para a imagem.');
  const data: any = { id, nome: val(d.nome, 200), categoria: val(d.categoria, 100), unidade: val(d.unidade, 30) || 'Unidade', descricao: val(d.descricao, 1000), por_caixa: factor, ativo, imagem: val(d.imagem, 2000), referencia: val(d.referencia, 100) };
  if (!d.id) data.ordem = 100000;
  checked(await db.from('pedidos_produtos').upsert(data)); await audit(u, 'SALVAR_PRODUTO', id); return { ok: true, id };
 }
 case 'alterarDisponibilidade': {
  admin(u); if (!['SIM', 'NÃO', 'EM FALTA'].includes(a[2])) fail('Situação inválida.');
  const result = checked(await db.from('pedidos_produtos').update({ ativo: a[2] }).eq('id', val(a[1])).select('id').single());
  await audit(u, 'DISPONIBILIDADE', result.id, { ativo: a[2] }); return true;
 }
 case 'registrarSolicitacao': {
  if (!['GERENCIAR','OPERAR'].includes(pedidoLevel(u))) fail('Seu acesso ao Pedidos é somente leitura.');
  const d = a[0] || {}; if (!Array.isArray(d.itens) || !d.itens.length) fail('Escolha os itens.');
  const id = checked(await db.rpc('pedidos_criar', { p_usuario: u.id, p_dados: d }));
  const o = await getOrder(id); return { pedido: o.id, link: orderLink(o) };
 }
 case 'relatorioAdmin': case 'meusPedidos': {
  if (fn === 'relatorioAdmin') admin(u);
  const orders = await rows('pedidos_ordens', fn === 'meusPedidos' ? { usuario_id: u.id } : {}, 'criado_em');
  const ids = orders.map(o => o.id); const items: any[] = [];
  // Filtrar no servidor para manter o histórico pessoal privado.
  for (let i = 0; i < ids.length; i += 100) {
   for (let start = 0; ; start += 1000) {
    const page = checked(await db.from('pedidos_itens').select('*').in('pedido_id', ids.slice(i, i + 100)).order('pedido_id').order('codigo').order('unidade').range(start, start + 999));
    items.push(...page); if (page.length < 1000) break;
   }
  }
  return { pedidos: orders.map(order), itens: items.map(item) };
 }
 case 'listarFavoritos': return { ok: true, ids: (await rows('pedidos_favoritos', { usuario_id: u.id }, 'produto_id')).map(x => x.produto_id) };
 case 'alternarFavorito': {
  const id = val(a[1]), match = { usuario_id: u.id, produto_id: id };
  if (!checked(await db.from('pedidos_produtos').select('id').eq('id', id).maybeSingle())) fail('Produto não encontrado.');
  const exists = checked(await db.from('pedidos_favoritos').select('*').match(match).maybeSingle());
  if (exists) checked(await db.from('pedidos_favoritos').delete().match(match)); else checked(await db.from('pedidos_favoritos').upsert(match));
  return { ok: true, favorito: !exists, ids: (await rows('pedidos_favoritos', { usuario_id: u.id }, 'produto_id')).map(x => x.produto_id) };
 }
 case 'obterLinkConferencia': admin(u); return { ok: true, pedido: a[1], link: orderLink(await getOrder(a[1])) };
 case 'getConferenciaCodigo': {
  admin(u);
  const code = val(a[1], 11);
  if (!/^[A-Za-z0-9_-]{10}$/.test(code)) fail('Link de conferência inválido.');
  const o = checked(await db.from('pedidos_ordens').select('*').eq('codigo_curto', code).maybeSingle());
  if (!o) fail('Pedido não encontrado para este link.');
  return { ...await conference(o), token: o.token };
 }
 case 'getConferenciaCurta': {
  admin(u);
  const fullToken = fullConferenceToken(a[1]);
  const o = checked(await db.from('pedidos_ordens').select('*').eq('token', fullToken).maybeSingle());
  if (!o) fail('Pedido não encontrado para este link.');
  return { ...await conference(o), token: fullToken };
 }
 case 'getConferenciaLink': {
  admin(u); const o = await getOrder(a[1]); if (o.token !== a[2]) fail('Link de conferência inválido.'); return conference(o);
 }
 case 'salvarConferenciaLink': case 'confirmarEntrega': {
  admin(u); let o = await getOrder(a[1]);
  const finalize = fn === 'confirmarEntrega', token = finalize ? o.token : a[2], lines = finalize ? a[2] : a[3], key = finalize ? 'entrega:' + o.id : val(a[4], 120);
  const result = checked(await db.rpc('pedidos_conferir', { p_editor: u.id, p_pedido: o.id, p_token: token, p_linhas: lines, p_chave: key, p_finalizar: finalize }));
  o = await getOrder(o.id); const c = await conference(o);
  if (finalize) return { status: o.situacao, unidades: (await rows('pedidos_itens', { pedido_id: o.id })).reduce((s: number, i: any) => s + Number(i.entregue_equivalentes), 0) };
  return { ok: true, pedido: o.id, revisao: result.revisao, mensagem: message(c), itens: c.itens, link: c.link, situacao: o.situacao, editorId: u.id, repeticao: result.repeticao || false };
 }
 case 'registrarCompartilhamentoLink': {
  admin(u); const o = await getOrder(a[1]); if (o.token !== a[2]) fail('Link inválido.');
  const time = new Date().toISOString(); let q = db.from('pedidos_revisoes').update({ compartilhado_em: time }).eq('pedido_id', o.id).eq('revisao', Number(a[3])).eq('chave', val(a[4], 120)).select('revisao');
  if (!checked(await q).length) fail('Revisão não encontrada.'); return { ok: true, compartilhamentoIniciadoEm: time };
 }
 case 'avisosPedidosAdminGVG': {
  admin(u); const ids = (await rows('pedidos_ordens', {}, 'criado_em')).filter(o => !o.entregue_em && o.situacao !== 'CANCELADO').map(o => o.id); return { ids, total: ids.length };
 }
 case 'preferenciaVozAdminGVG': {
  admin(u); if (typeof a[1] === 'boolean') checked(await db.from('pedidos_usuarios').update({ voz: a[1] }).eq('id', u.id)); return { ativa: typeof a[1] === 'boolean' ? a[1] : u.voz };
 }
 case 'enviarFotoProduto': case 'salvarFotoPerfil': {
  if (fn === 'enviarFotoProduto') admin(u);
  const d = a[1] || {}, match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(String(d.data || ''));
  if (!match || match[2].length > 2000000) fail('Envie uma imagem JPG, PNG ou WebP de até 1,5 MB.');
  const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0)); if (bytes.length > 1500000) fail('Imagem muito grande.');
  const extension = match[1].split('/')[1], path = `${fn === 'salvarFotoPerfil' ? 'perfis' : 'produtos'}/${u.id}/${crypto.randomUUID()}.${extension}`;
  checked(await db.storage.from('pedidos-fotos').upload(path, bytes, { contentType: match[1], upsert: false }));
  const url = db.storage.from('pedidos-fotos').getPublicUrl(path).data.publicUrl;
  if (fn === 'salvarFotoPerfil') checked(await db.from('pedidos_usuarios').update({ foto: url }).eq('id', u.id));
  return { url, id: path, arquivo: path };
 }
 case 'adminUsuarios': superadmin(u); return (await rows('pedidos_usuarios', {}, 'criado_em')).map(publicUser);
 case 'adminSituacaoUsuario': case 'adminDefinirPermissoes': case 'adminDefinirPerfil': {
  superadmin(u); const target = checked(await db.from('pedidos_usuarios').select('*').eq('id', a[1]).single());
  if (target.id === u.id || target.perfil === 'SUPERADMIN') fail('A conta principal não pode ser bloqueada ou rebaixada.');
  const changes: any = {};
  if (fn === 'adminSituacaoUsuario') {
   if (!['ATIVO', 'BLOQUEADO', 'EXCLUIDO', 'PENDENTE'].includes(a[2])) fail('Status inválido.'); changes.status = a[2];
   if (a[4]) changes.permissoes = {...target.permissoes, pedidos: ['ADMIN','GERENCIAR'].includes(a[4].pedidos) ? 'GERENCIAR' : a[4].pedidos === 'VISUAL' ? 'VISUAL' : a[4].pedidos ? 'OPERAR' : ''};
  } else if (fn === 'adminDefinirPermissoes') changes.permissoes = {...target.permissoes, pedidos: ['ADMIN','GERENCIAR'].includes(a[2]?.pedidos) ? 'GERENCIAR' : a[2]?.pedidos === 'VISUAL' ? 'VISUAL' : a[2]?.pedidos ? 'OPERAR' : ''};
  else { if (!['ADMIN', 'OPERADOR'].includes(a[2])) fail('Perfil inválido.'); changes.perfil = a[2]; }
  const out = checked(await db.from('pedidos_usuarios').update(changes).eq('id', target.id).select('*').single());
  await audit(u, fn, target.id, changes);
  return { ok: true, status: out.status, excluido: out.status === 'EXCLUIDO', permissoes: publicUser(out).permissoes };
 }
 case 'adminRedefinirSenha': {
  superadmin(u); const target = checked(await db.from('pedidos_usuarios').select('id,perfil').eq('id', a[1]).single());
  if (target.perfil === 'SUPERADMIN' && target.id !== u.id) fail('Acesso negado.');
  const password = String(a[2] || ''); if (password.length < 8 || password.length > 128) fail('Use uma senha entre 8 e 128 caracteres.');
  checked(await db.auth.admin.updateUserById(target.id, { password })); await audit(u, 'REDEFINIR_SENHA', target.id); return { ok: true };
 }
 case 'limparPedidosDemo': {
  superadmin(u);
  if (val(a[1]) !== 'LIMPAR') fail('Confirmação inválida.');
  // A operação no PostgreSQL é atômica, mantendo produtos, obras e contas intactos.
  const result = checked(await db.rpc('pedidos_limpar_historico'));
  return { ok: true, ...result };
 }
 default: fail('Operação não disponível: ' + fn);
 }
}
Deno.serve(async (req: Request) => {
 if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
 if (req.method !== 'POST') return answer({ error: 'Método inválido.' }, 405);
 try {
  const bodyText = await req.text(); if (bodyText.length > 2200000) return answer({ error: 'Requisição muito grande.' }, 413);
  const body = JSON.parse(bodyText), fn = val(body.fn, 80), args = Array.isArray(body.args) ? body.args : [];
  if (fn === 'cadastrarFuncionario') return answer({ data: await signup(req, args[0] || {}) });
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return answer({ error: 'Entre na sua conta.' }, 401);
  const auth = await db.auth.getUser(token);
  if (auth.error || !auth.data.user) return answer({ error: 'Sessão expirada. Entre novamente.' }, 401);
  if (fn === 'sairFuncionario' || fn === 'sairAdminGVG') { await db.auth.admin.signOut(token, 'local'); return answer({ data: { ok: true } }); }
  const u = checked(await db.from('pedidos_usuarios').select('*').eq('id', auth.data.user.id).maybeSingle());
  if (!u || u.status !== 'ATIVO') fail(u?.status === 'PENDENTE' ? 'Cadastro aguardando aprovação.' : 'Acesso não autorizado ou bloqueado.');
  return answer({ data: await run(fn, args, u) });
 } catch (e) {
  const message = e instanceof Error ? e.message : 'Falha na operação.';
  console.error('pedidos-api:', message);
  return answer({ error: /duplicate key/i.test(message) ? 'Registro duplicado. Atualize a página.' : message }, 400);
 }
});
