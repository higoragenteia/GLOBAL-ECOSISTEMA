from pathlib import Path
import re,json
root=Path(__file__).resolve().parents[1]
src=root/'source-original'
out=root/'supabase/functions/global-api'
def replacefn(s,name,body):
    p=re.search(r'function '+re.escape(name)+r'\([^)]*\)\s*\{',s)
    if not p: raise Exception(name)
    # Find balanced braces, including templates/comments with a JS parser below instead.
    return s[:p.start()]+s[p.start():].replace('function '+name+'(', 'function legacy_'+name+'(',1)+'\n'
# Keep original business rules scoped to each request. No Apps Script service is contacted.
for mod,f in [('gastos','Gastos.gs'),('fornecedores','Fornecedores.gs'),('maquinas','Maquinas.gs')]:
    s=(src/f).read_text()
    if mod in ['fornecedores','maquinas']:
        s=s[s.index('(function(){')+len('(function(){'):]
        s=s[:s.rfind('return { doGet:') if mod=='maquinas' else s.rfind('return { apiCall:')]
    if mod=='gastos':
        # file also wraps itself in a namespace
        if '(function(){' in s:
            s=s[s.index('(function(){')+len('(function(){'):]
            s=s[:s.rfind('return { apiCall:')]
        overrides="""
function currentUser_(){return {email:user.email,nome:user.nome,perfil:level==='GERENCIAR'?'ADMIN':'CONSULTA',status:'ATIVO',painelNivel:level,painel:true};}
return {run:(fn,args)=>{ACTIVE_PANEL_TOKEN_='supabase';return apiCall(fn,args,'','supabase');}};
"""
        s=s.replace('function currentUser_(', 'function legacy_currentUser_(')
    elif mod=='fornecedores':
        s=s.replace('function currentUser_(', 'function legacy_currentUser_(')
        s=s.replace('function touchUser_(', 'function legacy_touchUser_(')
        s=s.replace('function ensureSetup_(', 'function legacy_ensureSetup_(')
        s=s.replace('function deleteDriveFile_(', 'function legacy_deleteDriveFile_(')
        s=s.replace("spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/' + CFG.SPREADSHEET_ID + '/edit'", "spreadsheetUrl: ''")
        overrides="""
function currentUser_(){return {email:user.email,nome:user.nome,perfil:level==='GERENCIAR'?'ADMIN':'CONSULTA',status:'ATIVO',painelNivel:level,painel:true};}
function touchUser_(){} function ensureSetup_(){} function deleteDriveFile_(){}
return {run:(fn,args)=>{ACTIVE_PANEL_TOKEN_='supabase';return apiCall(fn,args,'','supabase');}};
"""
    else:
        for name in ['sincronizarEquipamentoSeguro','limparLinhaAba','criarAbaCategoria']:
            s=s.replace('function '+name+'(', 'function legacy_'+name+'(')
        overrides="""
function sincronizarEquipamentoSeguro(){return {ok:true,avisos:[]};}
function limparLinhaAba(){}
function criarAbaCategoria(nome){return {nome:nome,criada:true};}
return {run:(fn,args,requestId)=>{
 const session={id:user.id,nome:user.nome,email:user.email,perfil:level==='GERENCIAR'?PERFIL.ADMIN:PERFIL.VISUAL,painel:true,painelNivel:level};
 if(fn==='setupStatus')return {configurado:true,temAdmin:true,precisaSetup:false};
 if(fn==='sincronizarTudo')return {ok:true,atualizados:0,avisos:[],message:'Os dados já são gravados diretamente no PostgreSQL.'};
 if(AUTH_READ[fn])return AUTH_READ[fn](args[0]||{},session);
 if(ADMIN_READ[fn]){exigirAdmin(session);return ADMIN_READ[fn](args[0]||{},session);}
 if(ADMIN_WRITE[fn]){exigirAdmin(session);return ADMIN_WRITE[fn](args[0]||{},session,requireRequestId(requestId));}
 throw new ApiError('ACAO_INVALIDA','Operação não disponível.');
}};
"""
    pre="""// @ts-nocheck
// Business rules preserved from GVG&ARTEFAL e844395. Persistence and identity supplied by PostgreSQL/Auth adapters.
export function createModule(runtime,user,level){
const {SpreadsheetApp,Utilities,CacheService,LockService,Session,PropertiesService,Logger,ContentService}=runtime;
const GVG_GASTOS_ID='postgres';
const gvguModuloSsoObrigatorio_=()=>true;
"""
    (out/(mod+'.js')).write_text(pre+s+overrides+'\n}\n')
