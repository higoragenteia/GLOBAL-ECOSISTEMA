from pathlib import Path
import json,datetime
root=Path(__file__).resolve().parents[1]
for mod in ['gastos','fornecedores','maquinas']:
 p=root/'database/importacao'/f'{mod}.json'; raw=json.loads(p.read_text()); cols=[]
 if mod=='maquinas':
  raw['CONFIG']=[r for r in raw['CONFIG'] if not r or not any(k in str(r[0]) for k in ['HASH','RESET_','SETUP_'])]
  for r in raw['CONFIG']:
   if r and r[0]=='SINCRONIZACAO_INICIAL':r[1]='OK'
 p.write_text(json.dumps(raw,ensure_ascii=False,separators=(',',':')))
 for name,values in raw.items():
  header=next((i for i,r in enumerate(values) if r and str(r[0]) in ['Data','A partir de (mês)','Categoria','Data e hora']),0) if mod=='gastos' else 0
  headers=values[header];records=[]
  for i,row in enumerate(values[header+1:],header+2):
   if not any(v not in ['',None] for v in row):continue
   obj={k:row[j] if j<len(row) and row[j] is not None else '' for j,k in enumerate(headers)}
   if mod=='gastos':
    for k,v in obj.items():
     if k in ['Data','A partir de (mês)','Data e hora'] and isinstance(v,(int,float)):
      obj[k]=(datetime.datetime(1899,12,30)+datetime.timedelta(days=v)).isoformat(sep=' ')[:10 if k!='Data e hora' else 19]
   records.append({'ordem':i,'dados':obj})
  cols.append({'nome':name,'cabecalho':header+1,'colunas':headers,'registros':records})
 (root/'database/importacao'/f'{mod}-records.json').write_text(json.dumps(cols,ensure_ascii=False,separators=(',',':')))
 def quote(v):return "'"+str(v).replace("'","''")+"'"
 sql=[]
 for c in cols:
  sql.append('insert into public.global_colecoes(modulo,nome,colunas,cabecalho) values('+','.join([quote(mod),quote(c['nome']),quote(json.dumps(c['colunas'],ensure_ascii=False))+'::jsonb',str(c['cabecalho'])])+');')
  if c['registros']:
   sql.append('insert into public.global_registros(modulo,colecao,ordem,dados) values'+','.join('('+','.join([quote(mod),quote(c['nome']),str(r['ordem']),quote(json.dumps(r['dados'],ensure_ascii=False))+'::jsonb'])+')' for r in c['registros'])+';')
 (root/'database/importacao'/f'{mod}-seed.sql').write_text('\n'.join(sql))
 print(mod,[(c['nome'],len(c['registros'])) for c in cols])
