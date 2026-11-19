"""Integração real com duas contas temporárias; credenciais ficam em /tmp."""
import json, urllib.request, urllib.error, secrets, time
from pathlib import Path
URL='https://krjudhqlpgdnjzrdmtyf.supabase.co'
KEY='sb_publishable_zcXz2wDyZKVAJvTVHA1bxw_yDKkFI9W'
def request(path,body,token=None):
 headers={'Content-Type':'application/json','apikey':KEY}
 if token: headers['Authorization']='Bearer '+token
 req=urllib.request.Request(URL+path,data=json.dumps(body).encode(),headers=headers)
 try:
  with urllib.request.urlopen(req,timeout=50) as response: return response.status,json.load(response)
 except urllib.error.HTTPError as e: return e.code,json.loads(e.read())
def call(fn,args=[],token=None): return request('/functions/v1/pedidos-api',{'fn':fn,'args':args},token)
if __name__=='__main__':
 state=[]
 for role in ['operador','admin']:
  login='qa_'+role+'_'+secrets.token_hex(5); password=secrets.token_urlsafe(20)
  status,result=call('cadastrarFuncionario',[{'login':login,'senha':password}]); assert status==200,(status,result)
  status,auth=request('/auth/v1/token?grant_type=password',{'email':login+'@pedidos.gvg.invalid','password':password}); assert status==200,(status,auth)
  state.append({'role':role,'login':login,'password':password,'token':auth['access_token'],'id':auth['user']['id']})
 Path('/tmp/pedidos-qa.json').write_text(json.dumps(state)); Path('/tmp/pedidos-qa.json').chmod(0o600)
 print(json.dumps([{'role':s['role'],'id':s['id']} for s in state]))
