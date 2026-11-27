/* Shared authenticated transport for the migrated modules. */
(() => {
 'use strict';
 const URL='https://krjudhqlpgdnjzrdmtyf.supabase.co',KEY='sb_publishable_zcXz2wDyZKVAJvTVHA1bxw_yDKkFI9W';
 const inflight=new Map();
 try{const a=JSON.parse(localStorage.getItem('pedidosTeste:auth')||'null');if(a?.user?.id)localStorage.setItem('globalEco:gvgUsrToken','SUPABASE-'+a.user.id);}catch(_){}
 const requestId=()=> 'REQ-'+crypto.randomUUID().replace(/-/g,'');
 window.globalCall=async(modulo,fn,args=[],id)=>{
  if(['registrarUsuario','autoCadastro'].includes(fn)){const p=args[0]||{};return window.pedidosCall('cadastrarFuncionario',{nome:p.nome||p.usuario||p.email,login:p.login||p.usuario||p.email,senha:p.senha});}
  if(['logoutUsuario','logout','logoutToken'].includes(fn))return window.GlobalSession.logout();
  if(fn==='loginUsuario'||fn==='login'){
   const p=args[0]||{};const profile=await window.globalPanelCall('entrarFuncionario',p.email||p.login,p.senha||p.password);
   return {ok:true,token:profile.token,user:profile,usuario:profile};
  }
  const write=!/^(get|listar|bootstrap|setupStatus)/.test(fn);const rid=id||requestId();
  const cacheKey=modulo+':'+fn+':'+JSON.stringify(args);
  if(!write&&inflight.has(cacheKey))return inflight.get(cacheKey);
  const promise=(async()=>{
   const token=await window.GlobalSession.access();
   if(!token)throw Error('Entre pelo painel principal para continuar.');
   const response=await fetch(URL+'/functions/v1/global-api',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({modulo,fn,args,requestId:rid})});
   const result=await response.json();if(!response.ok||result.error){const e=Error(result.error||'Falha na operação.');e.code=result.code||'ERRO';e.status=response.status;throw e;}
   const data=result.data;
   if(fn==='criarBackup'&&data.backup){data.url=window.URL.createObjectURL(new Blob([JSON.stringify(data.backup,null,2)],{type:'application/json'}));delete data.backup;}
   return data;
  })();
  if(!write)inflight.set(cacheKey,promise);
  try{return await promise;}finally{if(!write)inflight.delete(cacheKey);}
 };
 async function finishPanelLogin(session) {
  const result = await window.PanelAuth.finishLogin(session);
  const profile = await window.globalCall('painel','perfil');
  for(const key of ['globalEco:gvgUsrToken','pedidosTeste:gvgUsrToken']) localStorage.setItem(key,result.token);
  return {...result,...profile};
 }
 async function mfaStatus(token) {
  const response = await fetch(URL+'/functions/v1/global-api', {
   method:'POST', headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({modulo:'painel',fn:'prepararSegundoFator'})
  });
  const status = await response.json();
  if(!response.ok || !status.data?.ok) throw Error(status.error || 'A verificação do painel está indisponível.');
  return status.data;
 }
 let pendingFactor;
 window.GlobalPanelMfa = {
  async start(user, password) {
   pendingFactor = null;
   const first = await window.PanelAuth.passwordLogin(user, password);
   const token = first.access_token;
   const status = await mfaStatus(token);
   if(!status.requiresMfa) return {profile:await finishPanelLogin(first)};
   const id = status.factorId || first.user?.factors?.find(f=>f.factor_type==='totp'&&f.status==='verified')?.id;
   if(!id) throw Error('Não foi possível localizar o autenticador desta conta.');
   pendingFactor = {token, id:encodeURIComponent(id), user:first.user};
   return {};
  },
  async enrollmentStatus() {
   const token = await window.GlobalSession.access();
   return mfaStatus(token);
  },
  async enroll() {
   const pending = {};
   pendingFactor = pending;
   const token = await window.GlobalSession.access();
   const user = await window.PanelAuth.request('user',undefined,token,'GET');
   const factor = await window.globalCall('painel','ativarSegundoFator');
   if(pendingFactor!==pending) throw Error('A configuração foi encerrada.');
   Object.assign(pending,{token,id:encodeURIComponent(factor.factorId),user});
   return factor;
  },
  async verify(code) {
   const pending = pendingFactor;
   if(!pending?.id) throw Error('Entre novamente para gerar uma nova sessão.');
   const path = 'factors/'+pending.id+'/';
   const challenge = await window.PanelAuth.request(path+'challenge',{},pending.token);
   const verified = await window.PanelAuth.request(path+'verify',{challenge_id:challenge.id,code},pending.token);
   if(pendingFactor !== pending) throw Error('A verificação foi encerrada.');
   pendingFactor = null;
   return finishPanelLogin({...verified,user:verified.user||pending.user});
  },
  cancel() { pendingFactor = null; }
 };
 window.globalPanelCall=async(fn,...args)=>{
  if(fn==='entrarFuncionario'){
   const result=await window.pedidosCall(fn,...args);
   const profile=await window.globalCall('painel','perfil');
   for(const key of ['globalEco:gvgUsrToken','pedidosTeste:gvgUsrToken'])localStorage.setItem(key,result.token);
   return {...result,...profile};
  }
  if(fn==='cadastrarFuncionario')return window.pedidosCall(fn,...args);
  if(['sairFuncionario','sairAdminGVG','logoutUsuario','fornecedoresApiCall'].includes(fn)){
   const result=await window.GlobalSession.logout();
   Object.keys(localStorage).filter(k=>/^globalEco:|^pedidosTeste:.*Token/.test(k)).forEach(k=>localStorage.removeItem(k));return result;
  }
  if(['adminRedefinirSenha','salvarFotoPerfil'].includes(fn))return window.pedidosCall(fn,...args);
  return window.globalCall('painel',fn,args);
 };
})();
