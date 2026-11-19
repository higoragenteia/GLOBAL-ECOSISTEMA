from pathlib import Path
import re,shutil,json
root=Path(__file__).resolve().parents[1]
src=root/'source-original'
dist=root/'dist';dist.mkdir(exist_ok=True)
def replacefn(s,name,replacement):
 # Use balanced braces with strings/templates/comments handled by Acorn ranges in the JS build helper.
 raise Exception('use JS helper')
# Frontend transport rewrites use narrowly delimited original functions.
p=(root/'pedidos-api.js').read_text()
if 'window.GlobalSession' not in p:
 p=p.replace(" window.addEventListener('storage'", " window.GlobalSession = { access, logout: () => window.pedidosCall('sairFuncionario') };\n window.addEventListener('storage'")
(root/'pedidos-api.js').write_text(p)
pedidos=(root/'index.html').read_text()
# index.html changes to the shell; keep existing Pedidos verbatim as a separate route.
if not (root/'pedidos.html').exists():(root/'pedidos.html').write_text(pedidos)
for filename,mod in [('Painel.html','painel'),('GastosIndex.html','gastos'),('FornecedoresIndex.html','fornecedores'),('MaquinasIndex.html','maquinas')]:
 s=(src/filename).read_text()
 values={'pedidosUrl':'./pedidos.html','gastosUrl':'./gastos.html','fornecedoresUrl':'./fornecedores.html','maquinasUrl':'./maquinas.html','maquinasApiUrl':'./','frotasUrl':'','initialView':'','initialAlert':''}
 s=re.sub(r'<\?!=\s*JSON.stringify\((\w+)\)\s*\?>',lambda m:json.dumps(values[m[1]]),s)
 s=s.replace('<?= initialView ?>','')
 # All frontend storage is isolated from the original production app.
 for key in ['gvgUsrToken','gvgAdminToken','gvgGastosToken','gvgSessionToken','gvgMaqTokenV1','gvgFrotasToken']:
  s=s.replace("'"+key+"'","'globalEco:"+key+"'")
 s=s.replace('https://gvgartefalesquadrias.com.br/','./')
 s=s.replace('https://higoragenteia.github.io/gvg-artefal/assets/','./assets/')
 s=s.replace('Dados sincronizados com a planilha.','Dados atualizados.').replace('Os lançamentos são gravados na planilha Google Sheets vinculada','Controle de despesas e orçamento').replace('Base conectada ao Google Sheets.','Base de fornecedores atualizada.')
 s=s.replace('O autoteste usa uma planilha temporária e não altera a base real.','A verificação analisa uma cópia em memória e preserva os dados.').replace('A planilha real não foi alterada; a planilha temporária é descartada pelo servidor.','Os dados cadastrados foram preservados.')
 if mod=='painel':
  s=s.replace("    {key:'maquinas',label:'Controle de Máquinas'},\n    {key:'frotas',label:'Controle de Frotas'}","    {key:'maquinas',label:'Controle de Máquinas'}")
  s=re.sub(r'(<button[^>]+(?:data-view|data-module)="frotas"[\s\S]*?</button>)',lambda m:m[0].replace('>Ativo<','>Pendente<'),s)
  s=s.replace('id="gvgpTopBell"','id="gvgpTopBell" style="display:none"')
 s=s.replace('</head>','<script src="./pedidos-api.js"></script><script src="./global-api.js"></script></head>')
 if mod=='painel':
  start=s.index('  function run(fn,...args){');end=s.index('  function setSidebar',start)
  s=s[:start]+"  function run(fn,...args){return window.globalPanelCall(fn,...args);}\n"+s[end:]
  s=s.replace("  function setView(view){","  function setView(view){\n    if(view==='frotas'){toast('Frotas aguarda suas orientações antes da migração.');return;}\n")
  start=s.index('  function revogarSessaoMaquinas_');end=s.index('  function logout()',start)
  s=s[:start]+"  function revogarSessaoMaquinas_(){}\n"+s[end:]
  s=re.sub(r'<title>.*?</title>','<title>GLOBAL ECOSISTEMA | GVG&ARTEFAL</title>',s,flags=re.S)
 elif mod=='gastos':
  start=s.index('function rpc(name,...args)');end=s.index('\n',start)
  s=s[:start]+"function rpc(name,...args){return window.globalCall('gastos',name,args)}"+s[end:]
 elif mod=='fornecedores':
  start=s.index('    function api(fn){');end=s.index('    function setBusy',start)
  s=s[:start]+"    function api(fn,...args){return window.globalCall('fornecedores',fn,args);}\n\n"+s[end:]
 else:
  start=s.index('async function api(action, payload, opts)');end=s.index('\nfunction isAuthError',start)
  s=s[:start]+"async function api(action,payload,opts){return window.globalCall('maquinas',action,[payload||{}],opts?.requestId);}\n"+s[end:]
  # The spreadsheet sync button has no external Sheets side effect after migration.
  s=s.replace('Nova categoria/aba','Nova categoria').replace('Cria categoria e aba','Cria uma categoria').replace('Sincronizar planilha','Atualizar dados').replace('Interface SPA (GitHub Pages) + API Apps Script.','Interface SPA + PostgreSQL/Supabase.')
 filename='index.html' if mod=='painel' else mod+'.html'
 (dist/filename).write_text(s)
(root/'index.html').write_text((dist/'index.html').read_text())
for filename in ['pedidos.html','pedidos-api.js','global-api.js','manifest.webmanifest']:shutil.copy2(root/filename,dist/filename)
shutil.copytree(root/'assets',dist/'assets',dirs_exist_ok=True)
print('Frontend: painel + Pedidos + Gastos + Fornecedores + Máquinas. Frotas não implementado.')
