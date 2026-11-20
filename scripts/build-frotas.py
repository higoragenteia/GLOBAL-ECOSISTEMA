#!/usr/bin/env python3
"""Gera frotas.html a partir da interface original do Frotas.

A interface visual e as funcoes do FrotasIndex.html original sao preservadas.
As chamadas google.script.run sao trocadas pelo adaptador Supabase/SSO.
Nenhum dado de veiculo, foto por placa, senha ou planilha e gerado aqui.
"""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = root / "source-original" / "FrotasIndex.html"
out = root / "frotas.html"
s = source.read_text(encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if text.count(old) != 1:
        raise SystemExit(f"{label}: esperava 1 ocorrencia, encontrou {text.count(old)}")
    return text.replace(old, new, 1)


# Alertas deep-link vindos do painel ou do Firebase.
s = replace_once(
    s,
    "const DEEP_ALERT=String(<?!= JSON.stringify(initialAlert) ?>||'');",
    "const DEEP_ALERT=String(new URLSearchParams(location.search).get('alerta')||'');",
    "DEEP_ALERT",
)

# O painel usa a chave prefixada e a sessao Supabase; mantenha fallback legado.
s = replace_once(
    s,
    "function getPanelToken(){try{return localStorage.getItem('gvgUsrToken')||'';}catch(e){return '';}}",
    "function getPanelToken(){try{return localStorage.getItem('globalEco:gvgUsrToken')||localStorage.getItem('pedidosTeste:gvgUsrToken')||localStorage.getItem('gvgUsrToken')||'painel';}catch(e){return 'painel';}}",
    "getPanelToken",
)

# Toda chamada do frontend original passa pelo adaptador Supabase.
s = replace_once(
    s,
    "function server(fn,...args){return new Promise((resolve,reject)=>{if(!(window.google&&google.script&&google.script.run))return reject(new Error('Abra o aplicativo pela implantação do Google Apps Script.'));google.script.run.withSuccessHandler(resolve).withFailureHandler(e=>reject(new Error(e&&e.message?e.message:String(e)))).frotasApiCall(fn,args,getToken(),getPanelToken());});}",
    "function server(fn,...args){if(!window.GVGFrotasCompat)return Promise.reject(new Error('Adaptador Supabase do Frotas nao carregado.'));return window.GVGFrotasCompat.call(fn,...args);}",
    "server",
)

# Avisa o painel quando a interface terminou de carregar (esconde o overlay do iframe).
s = replace_once(
    s,
    "function notifyParentLogin(){try{if(window.top&&window.top!==window)window.top.postMessage({type:'gvg-frotas-login',logged:true},'*');}catch(e){}}",
    "function notifyParentLogin(){try{if(window.top&&window.top!==window){window.top.postMessage({type:'gvg-frotas-login',logged:true},'*');window.top.postMessage({type:'gvg-frotas-ready'},'*');}}catch(e){}}",
    "notifyParentLogin",
)

# Carrega a sessao e o adaptador antes do script original.
marker = "\n<script>\n/* Imagens ilustrativas próprias deste pacote"
if marker not in s:
    marker = "\n<script>\nconst ILLUSTRATION_CAR"
if marker not in s:
    raise SystemExit("marker do script original nao encontrado")
scripts = (
    '\n<script src="./pedidos-api.js?v=20261120"></script>'
    '\n<script src="./global-api.js?v=20261120"></script>'
    '\n<script src="./frotas-compat.js?v=20261120"></script>'
)
s = s.replace(marker, scripts + marker, 1)

# Botao de importacao unica (somente Gerenciar; o servidor tambem valida).
s = replace_once(
    s,
    '<span class="sync">',
    '<button type="button" class="notif-top-btn" id="gvgImportFrotas" title="Importar dados do Frotas original para o Supabase" aria-label="Importar dados do Frotas original" style="display:none">⇩</button><span class="sync">',
    "import button",
)

# Mantem o Firebase/FCM existente e deixa o caminho de registro visivel.
old_help = "Com o app fechado, os alertas continuam chegando pelo Gmail.</p>"
new_help = (
    "Com o app fechado, use o app de notificações Firebase/FCM no dispositivo cadastrado.</p>"
    '<p class="notif-helper">Notificações no celular: '
    '<a href="https://gvg-controle-de-frotas.web.app/" target="_blank" rel="noopener">ativar ou gerenciar dispositivo</a>. '
    "O envio diário continua no Apps Script do Frotas.</p>"
)
s = replace_once(s, old_help, new_help, "firebase helper")

# Tela de sessão ausente/expirada: oferece o caminho de volta ao painel.
s = replace_once(
    s,
    " $('authScreen').classList.remove('hide');\n document.body.classList.add('authing');\n $('sessionBox').classList.add('hide');\n}\nasync function bootAuth(){",
    " $('authScreen').classList.remove('hide');\n document.body.classList.add('authing');\n $('sessionBox').classList.add('hide');\n var ab=$('authBody');\n if(ab&&!ab.querySelector('.gvgPanelLink')){var b=document.createElement('button');b.type='button';b.className='auth-btn gvgPanelLink';b.textContent='Entrar pelo painel';b.onclick=function(){try{if(window.top!==window)window.top.location.href='./index.html';else location.href='./index.html';}catch(e){location.href='./index.html';}};ab.appendChild(b);}\n}\nasync function bootAuth(){",
    "panel link",
)

# Em aba avulsa, mantém os botões de senha/sair; dentro do painel o pai controla a sessão.
s = s.replace("document.body.classList.toggle('painelMode',!!USER.painel);", "document.body.classList.toggle('painelMode',!!USER.painel&&window.top!==window);")

# Logout: dentro do painel, avisa o pai; em aba avulsa, encerra a sessão e volta ao painel.
s = replace_once(
    s,
    "async function logout(){\n if(USER&&USER.painel){try{window.top.postMessage({type:'gvg-frotas-logout'},'*');}catch(e){}return;}\n try{await server('logoutUsuario');}catch(e){}\n setToken('');USER=null;IS_ADMIN=false;IS_MANAGER=false;\n data={vehicles:[],insurance:[],alerts:[],km:[],fuel:[],maintenance:[],documents:[],photos:[],payments:[],extras:[],vencimentos:[]};\n tables=null;selected=null;showAuth();\n}",
    "async function logout(){\n const embedded=!!(window.top&&window.top!==window);\n if(USER&&USER.painel&&embedded){try{window.top.postMessage({type:'gvg-frotas-logout'},'*');}catch(e){}return;}\n const wasPanel=!!(USER&&USER.painel);\n try{await server('logoutUsuario');}catch(e){}\n setToken('');USER=null;IS_ADMIN=false;IS_MANAGER=false;\n data={vehicles:[],insurance:[],alerts:[],km:[],fuel:[],maintenance:[],documents:[],photos:[],payments:[],extras:[],vencimentos:[]};\n tables=null;selected=null;\n if(wasPanel){try{location.href='./index.html';return;}catch(e){}}\n showAuth();\n}",
    "logout",
)

# Conta e permissões: o Frotas usa o mesmo cadastro do painel; a tela de usuários
# só aparece para o Superadministrador, que é quem pode gerenciar contas.
s = replace_once(
    s,
    "body:not(.isManager) .managerOnly{display:none!important}",
    "body:not(.isManager) .managerOnly{display:none!important}\nbody:not(.isSuperadmin) .superadminOnly{display:none!important}",
    "superadmin css",
)
s = replace_once(
    s,
    '<button class="navbtn adminOnly managerOnly" data-go="users">',
    '<button class="navbtn adminOnly managerOnly superadminOnly" data-go="users">',
    "users nav",
)
s = replace_once(
    s,
    " document.body.classList.toggle('isManager',!!IS_MANAGER);",
    " document.body.classList.toggle('isManager',!!IS_MANAGER);\n document.body.classList.toggle('isSuperadmin',!!USER.superadmin);",
    "superadmin role",
)

# Exclusão é exclusiva de GERENCIAR; não mostrar o botão para OPERAR.
s = s.replace("$('deleteBtn').style.display=r?'inline-flex':'none';", "$('deleteBtn').style.display=(r&&IS_MANAGER)?'inline-flex':'none';")

# Textos de operacao agora falam do Supabase, nao de uma planilha em uso.
text_replacements = {
    "Atualizar do Google Sheets": "Atualizar dados",
    "Salvo no Google Sheets da empresa.": "Salvo no Supabase.",
    "Edição direta no Google Sheets corporativo": "Edição direta no banco Supabase",
    "dados da planilha": "dados da frota",
    "Linha '+row+' da planilha corporativa.": "Registro '+row+' do banco.",
    "da planilha corporativa": "do banco",
    "GVG & ARTEFAL • Planilha corporativa • Os dados exibidos vêm do Google Sheets.": "GVG & ARTEFAL • Base Supabase • Os dados exibidos vêm do banco da frota.",
    "A planilha real não foi alterada; a planilha temporária é descartada pelo servidor.": "Os dados cadastrados foram preservados.",
    "Dados sincronizados com a planilha.": "Dados atualizados.",
    "Gestão, edição e auditoria da planilha": "Gestão, edição e auditoria do banco",
    "Foto cadastrada na planilha": "Foto cadastrada",
    "Registros da planilha original.": "Registros históricos da frota.",
    "Não altera planilha, acesso, rotinas de e-mail nem gatilhos do Apps Script.": "Não altera dados, acesso, rotinas de e-mail nem gatilhos do Apps Script.",
    "Conectando à planilha da frota com a sessão do painel": "Conectando ao banco da frota com a sessão do painel",
}
for old, new in text_replacements.items():
    s = s.replace(old, new)

# Script de UI da importacao unica.
inject = r"""
<script>
/* GVG: importacao unica da planilha original para o Supabase. Nao cria dependencia em tempo de execucao. */
(function(){
  function initImport(){
    var btn=document.getElementById('gvgImportFrotas');
    if(!btn)return;
    function sync(){
      var manager=document.body.classList.contains('isManager');
      btn.style.display=manager?'inline-flex':'none';
    }
    if(window.MutationObserver)new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
    sync();
    btn.addEventListener('click',async function(){
      if(!window.confirm('Importar agora os dados atuais do Frotas original para o Supabase? A importacao substitui as colecoes do modulo Frotas e fica registrada na auditoria, com backup automatico do estado anterior. Depois dela, a planilha nao sera mais consultada em tempo de execucao.'))return;
      btn.disabled=true;btn.textContent='...';
      try{
        var r=await window.GVGFrotasCompat.importSheets();
        var q=(r&&r.registros!==undefined)?r.registros:'';
        if(window.showToast)showToast('Dados do Frotas importados para o Supabase'+(q!==''?' ('+q+' registros)':'')+'.');
        if(typeof reload==='function')await reload(true);
      }catch(e){
        if(window.showToast)showToast(e&&e.message?e.message:String(e),true);
      }finally{btn.disabled=false;btn.textContent='⇩';}
    });
  }
  function notifyReady(){try{if(window.top&&window.top!==window)window.top.postMessage({type:'gvg-frotas-ready'},'*');}catch(_e){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initImport);else initImport();
  window.addEventListener('load',notifyReady);
})();
</script>
"""
s = s.replace("</body>", inject + "</body>", 1)

checks = [
    ("<?!=", "placeholder Apps Script"),
    ("google.script.run", "google.script.run"),
    ("frotas-compat.js", "adaptador"),
    ("GVGFrotasCompat.call", "chamada do adaptador"),
    ("globalEco:gvgUsrToken", "token prefixado"),
    ("gvgImportFrotas", "botao importar"),
]
for needle, label in checks:
    present = needle in s
    if needle in ("<?!=", "google.script.run"):
        if present:
            raise SystemExit(f"verificacao falhou: {label} ainda presente")
    elif not present:
        raise SystemExit(f"verificacao falhou: {label} ausente")

out.write_text(s, encoding="utf-8")
print(f"Gerado {out} ({out.stat().st_size} bytes)")
print("Chamadas originais preservadas; backend trocado para Supabase; Firebase/FCM mantido como servico externo.")
