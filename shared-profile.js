/* One profile photo across the panel and all migrated modules. */
(() => {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let profile=null,busy=false,scheduled=false;
 const style=document.createElement('style');style.textContent=`
 .global-profile{display:inline-flex!important;align-items:center;gap:9px;padding:5px 11px 5px 5px;border:1px solid #ded5c7;border-radius:999px;background:linear-gradient(145deg,#fffdf8,#f1ece2);color:#26313b;cursor:pointer;max-width:100%;box-sizing:border-box;vertical-align:middle;font-family:inherit;text-align:left;line-height:1.25}
 .global-profile:focus-visible{outline:2px solid #b78b37;outline-offset:3px}
 .global-profile-photo{width:32px;height:32px;flex:0 0 32px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:#102737;color:#f1d087;font-size:13px;font-weight:800}
 .global-profile-photo img{width:100%;height:100%;object-fit:cover;border-radius:50%}
 .global-profile-meta{display:flex;flex-direction:column;min-width:0}.global-profile-meta strong{font-size:11px!important;color:#26313b}.global-profile-meta small{font-size:10px!important;color:#756f65;letter-spacing:0;text-transform:none}
 #userChip:has(.global-profile){padding:0;border:0;background:transparent;box-shadow:none}
 #topbarUser:has(.global-profile){padding:0;border:0;background:transparent}
 .global-profile-status{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:100000;max-width:90vw;padding:12px 18px;border-radius:12px;background:#123b4b;color:white;font:14px system-ui;box-shadow:0 5px 24px #0003}
 `;document.head.append(style);
 function photo(){if(profile?.foto&&/^https:\/\//i.test(profile.foto))return profile.foto;return /higor/i.test((profile?.nome||'')+' '+(profile?.email||''))?'./assets/avatar-higor.webp':'';}
 function render(){if(!profile)return;const url=photo(),initial=(profile.nome||'?').trim().charAt(0).toUpperCase(),role=({SUPERADMIN:'Superadministrador',ADMIN:'Administrador',OPERADOR:'Operador'})[profile.perfil]||profile.perfil;
  const html=`<span class="global-profile" role="button" tabindex="0" aria-label="Alterar foto de perfil" title="Alterar foto de perfil"><span class="global-profile-photo">${url?`<img src="${esc(url)}" alt="Foto de perfil">`:esc(initial)}</span><span class="global-profile-meta"><strong>${esc(profile.nome)}</strong><small>${esc(role)}</small></span></span>`;
  for(const selector of ['#userChip','#sessionUser','#topbarUser','#gvgSessionLabel']){const host=document.querySelector(selector);if(host&&host.innerHTML!==html)host.innerHTML=html;}
  const sidebar=document.querySelector('#userAvatar');if(sidebar){const contents=url?`<img src="${esc(url)}" alt="Foto de perfil" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:esc(initial);if(sidebar.innerHTML!==contents)sidebar.innerHTML=contents;sidebar.style.borderRadius='50%';}
  // Keep the panel's existing user-management and logout controls intact.
  const panelAvatar=document.querySelector('#gvgpTopUser .gvgp-user-avatar');if(panelAvatar&&url){const contents=`<img src="${esc(url)}" alt="Foto de perfil">`;if(panelAvatar.innerHTML!==contents)panelAvatar.innerHTML=contents;}
 }
 function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;render();});}
 async function refresh(){try{if(!await window.GlobalSession?.access()){profile=null;return;}profile=await window.globalCall('painel','perfil');schedule();}catch(_){}}
 function message(text){let box=document.querySelector('.global-profile-status');if(!box){box=document.createElement('div');box.className='global-profile-status';box.setAttribute('role','status');document.body.append(box);}box.textContent=text;clearTimeout(message.timer);message.timer=setTimeout(()=>box.remove(),4500);}
 const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.hidden=true;
 async function compress(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Escolha uma imagem JPG, PNG ou WebP.');if(file.size>15000000)throw Error('Escolha uma imagem de até 15 MB.');const img=await createImageBitmap(file);try{const scale=Math.min(1,640/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return {data:canvas.toDataURL('image/jpeg',.85)};}finally{img.close();}}
 input.addEventListener('change',async()=>{const file=input.files[0];input.value='';if(!file||busy)return;busy=true;try{message('Atualizando foto de perfil…');const result=await window.pedidosCall('salvarFotoPerfil','',await compress(file));if(!result?.url)throw Error('Não foi possível salvar a foto.');profile={...profile,foto:result.url};render();localStorage.setItem('globalEco:profileUpdated',JSON.stringify({id:profile.id,at:Date.now()}));window.dispatchEvent(new Event('global-profile-updated'));message('Foto atualizada em todos os aplicativos.');}catch(e){message(e.message||'Não foi possível atualizar a foto.');}finally{busy=false;}});
 function control(target){return target.closest?.('.global-profile,#topbarUser,#gvgpTopUser .gvgp-user-avatar');}
 document.addEventListener('click',e=>{if(profile&&control(e.target)){e.preventDefault();e.stopImmediatePropagation();if(!busy)input.click();}},true);
 document.addEventListener('keydown',e=>{if(profile&&['Enter',' '].includes(e.key)&&control(e.target)){e.preventDefault();e.stopImmediatePropagation();if(!busy)input.click();}},true);
 window.addEventListener('storage',e=>{if(e.key==='globalEco:profileUpdated'||e.key==='pedidosTeste:auth')refresh();});
 window.addEventListener('global-profile-updated',refresh);
 function init(){document.body.append(input);new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});refresh();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
