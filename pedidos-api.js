/* Adaptador do frontend original para Supabase Auth e Edge Functions. */
(() => {
 'use strict';
 const URL = 'https://krjudhqlpgdnjzrdmtyf.supabase.co';
 const KEY = 'sb_publishable_zcXz2wDyZKVAJvTVHA1bxw_yDKkFI9W';
 const STORAGE = 'pedidosTeste:auth';
 let session = null, refreshing = null;
 try { session = JSON.parse(localStorage.getItem(STORAGE) || 'null'); } catch (_) {}
 function save(value) { session = value; if (value) localStorage.setItem(STORAGE, JSON.stringify(value)); else localStorage.removeItem(STORAGE); }
 async function auth(path, body) {
  const response = await fetch(URL + '/auth/v1/' + path, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(response.status === 400 ? 'Usuário ou senha inválidos.' : result.msg || result.error_description || 'Não foi possível entrar.');
  return result;
 }
 async function access() {
  if (!session?.access_token) return '';
  if (session.expires_at * 1000 > Date.now() + 60000) return session.access_token;
  if (!refreshing) refreshing = auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
   .then(result => { save({ ...result, expires_at: result.expires_at || Math.floor(Date.now() / 1000) + result.expires_in }); return result.access_token; })
   .catch(e => { save(null); throw e; }).finally(() => refreshing = null);
  return refreshing;
 }
 async function call(fn, args) {
  const token = fn === 'cadastrarFuncionario' ? '' : await access();
  const response = await fetch(URL + '/functions/v1/pedidos-api', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ fn, args }) });
  const result = await response.json();
  if (!response.ok || result.error) { const e = new Error(result.error || 'Não foi possível concluir a operação.'); e.status = response.status; throw e; }
  return result.data;
 }
 window.pedidosCall = async (fn, ...args) => {
  if (fn === 'entrarFuncionario') {
   const login = String(args[0] || '').trim().toLowerCase();
   const email = login.includes('@') ? login : login + '@pedidos.gvg.invalid';
   const result = await auth('token?grant_type=password', { email, password: String(args[1] || '') });
   save({ ...result, expires_at: result.expires_at || Math.floor(Date.now() / 1000) + result.expires_in });
   try { const profile = await call('estadoSessaoFuncionarioGVG', []); window.dispatchEvent(new Event('global-profile-updated')); return { ...profile, token: 'SUPABASE-' + profile.id }; }
   catch (e) { save(null); throw e; }
  }
  if (fn === 'sairFuncionario' || fn === 'sairAdminGVG') {
   // O frontend original encerra os dois tipos de sessão em paralelo.
   const token = session?.access_token; save(null);
   if (token) await fetch(URL + '/auth/v1/logout?scope=local', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + token } });
   return { ok: true };
  }
  if (['estadoSessaoFuncionarioGVG', 'validarSessaoAdminGVG'].includes(fn) && !session?.access_token) return { ok: false };
  try { return await call(fn, args); }
  catch (e) { if (['estadoSessaoFuncionarioGVG', 'validarSessaoAdminGVG'].includes(fn) && [400,401].includes(e.status)) { save(null); return { ok: false }; } throw e; }
 };
 window.GlobalSession = { access, logout: () => window.pedidosCall('sairFuncionario') };
 window.addEventListener('storage', event => { if (event.key === STORAGE) { try { session = JSON.parse(event.newValue || 'null'); } catch (_) { session = null; } } });
})();
