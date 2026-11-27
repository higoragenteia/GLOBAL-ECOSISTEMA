/* Adaptador do frontend original para Supabase Auth e Edge Functions. */
(() => {
 'use strict';
 const URL = 'https://krjudhqlpgdnjzrdmtyf.supabase.co';
 const KEY = 'sb_publishable_zcXz2wDyZKVAJvTVHA1bxw_yDKkFI9W';
 const STORAGE = 'pedidosTeste:auth';
 let session = null, refreshing = null;
 try { session = JSON.parse(localStorage.getItem(STORAGE) || 'null'); } catch (_) {}
 function save(value) { session = value; if (value) localStorage.setItem(STORAGE, JSON.stringify(value)); else localStorage.removeItem(STORAGE); }
 async function auth(path, body, token, method = 'POST') {
  const response = await fetch(URL + '/auth/v1/' + path, {
   method, headers: { apikey: KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
   body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) {
   const e = new Error(path.endsWith('=password') && response.status === 400 ? 'Usuário ou senha inválidos.' : result.msg || result.error_description || 'Não foi possível validar a sessão.');
   e.status = response.status;
   e.code = result.error_code || result.code;
   throw e;
  }
  return result;
 }
 async function access() {
  let parentSession;
  try { if (window.parent !== window) parentSession = window.parent.GlobalSession; } catch (_) {}
  if (parentSession) return parentSession.access();
  if (!session?.access_token) {
   const e = new Error('Entre no painel para continuar.');
   e.sessionExpired = true;
   throw e;
  }
  if (session.expires_at * 1000 > Date.now() + 60000) return session.access_token;
  if (!refreshing) {
   const current = session;
   refreshing = auth('token?grant_type=refresh_token', { refresh_token: current.refresh_token })
    .then(result => {
     if (session !== current) return session?.access_token || '';
     save({ ...result, expires_at: result.expires_at || Math.floor(Date.now() / 1000) + result.expires_in });
     return result.access_token;
    })
    .catch(e => {
     if (session !== current) return session?.access_token || '';
     if (['refresh_token_not_found','refresh_token_already_used','session_not_found','session_expired'].includes(e.code)) {
      save(null);
      e.sessionExpired = true;
     }
     throw e;
    }).finally(() => refreshing = null);
  }
  return refreshing;
 }
 async function call(fn, args) {
  const token = fn === 'cadastrarFuncionario' ? '' : await access();
  const response = await fetch(URL + '/functions/v1/pedidos-api', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ fn, args }) });
  const result = await response.json();
  if (!response.ok || result.error) { const e = new Error(result.error || 'Não foi possível concluir a operação.'); e.status = response.status; throw e; }
  return result.data;
 }
 const passwordLogin = (user, password) => {
  const login = String(user || '').trim().toLowerCase();
  const email = login.includes('@') ? login : login + '@pedidos.gvg.invalid';
  return auth('token?grant_type=password', { email, password: String(password || '') });
 };
 async function finishLogin(result) {
  save({ ...result, expires_at: result.expires_at || Math.floor(Date.now() / 1000) + result.expires_in });
  try {
   const profile = await call('estadoSessaoFuncionarioGVG', []);
   window.dispatchEvent(new Event('global-profile-updated'));
   return { ...profile, token: 'SUPABASE-' + profile.id };
  } catch (e) { save(null); throw e; }
 }
 window.PanelAuth = { passwordLogin, request: auth, finishLogin };
 window.pedidosCall = async (fn, ...args) => {
  if (fn === 'entrarFuncionario') return finishLogin(await passwordLogin(...args));
  if (fn === 'sairFuncionario' || fn === 'sairAdminGVG') {
   // O frontend original encerra os dois tipos de sessão em paralelo.
   const token = session?.access_token; save(null);
   if (token) await fetch(URL + '/auth/v1/logout?scope=local', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + token } });
   return { ok: true };
  }
  if (['estadoSessaoFuncionarioGVG', 'validarSessaoAdminGVG'].includes(fn) && !session?.access_token) return { ok: false };
  try { return await call(fn, args); }
  catch (e) { if (['estadoSessaoFuncionarioGVG', 'validarSessaoAdminGVG'].includes(fn) && [400,401,403].includes(e.status)) return { ok: false }; throw e; }
 };
 window.GlobalSession = { access, logout: () => window.pedidosCall('sairFuncionario') };
 window.addEventListener('storage', event => { if (event.key === STORAGE) { try { session = JSON.parse(event.newValue || 'null'); } catch (_) { session = null; } } });
})();
