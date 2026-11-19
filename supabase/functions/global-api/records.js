// Request-scoped compatibility layer. All persistence is PostgreSQL JSONB records.
// There is no network access to Google Sheets and no authentication in legacy code.
export function makeRuntime(collections) {
 const book={}; const dirty=new Set();
 for(const c of collections){const cols=c.colunas,header=c.cabecalho||1;const a=Array.from({length:header},()=>[]);a[header-1]=cols;for(const r of c.registros||[]){a[r.ordem-1]=cols.map(k=>r.dados[k]??'');}book[c.nome]=a;}
 const sheets={};
 function sheet(name){if(!book[name])return null;if(sheets[name])return sheets[name];const data=()=>book[name];
 const range=(row,col,nr=1,nc=1)=>{
  if(typeof row!=='number')throw Error('Intervalo inválido');
  const obj={getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>data()[row+i-1]?.[col+j-1]??'')),
   getValue:()=>data()[row-1]?.[col-1]??'',getDisplayValues:()=>obj.getValues().map(r=>r.map(String)),getFormula:()=>'',
   setValues:(values)=>{if(values.length!==nr||values.some(r=>r.length!==nc))throw Error('Dimensões inválidas');values.forEach((r,i)=>{data()[row+i-1]??=[];r.forEach((v,j)=>data()[row+i-1][col+j-1]=v instanceof Date?v.toISOString().slice(0,10):v);});dirty.add(name);return obj;},
   setValue:(v)=>obj.setValues([[v]]),clearContent:()=>obj.setValues(Array.from({length:nr},()=>Array(nc).fill(''))),copyTo:()=>obj};
  for(const k of ['setNumberFormat','setBackground','setFontColor','setFontWeight','setNote','clearNote','setBorder','setHorizontalAlignment','setVerticalAlignment','setWrap','setFontSize'])obj[k]=()=>obj;
  return obj;
 };
 const s={getName:()=>name,getLastRow:()=>data().length,getLastColumn:()=>Math.max(1,...Array.from(data(),r=>r?.length||0)),getRange:range,
 getDataRange:()=>range(1,1,Math.max(1,data().length),Math.max(1,...Array.from(data(),r=>r?.length||0))),appendRow:(r)=>{data().push(r.map(v=>v instanceof Date?v.toISOString():v));dirty.add(name);return s;},deleteRow:(n)=>{data().splice(n-1,1);dirty.add(name);return s;},getMaxRows:()=>100000,getMaxColumns:()=>100,setFrozenRows:()=>s,autoResizeColumns:()=>s};
 sheets[name]=s;return s;
 }
 const ss={getSheetByName:sheet,getSheets:()=>Object.keys(book).map(sheet),insertSheet:n=>{book[n]=[[]];dirty.add(n);return sheet(n);},getId:()=> 'postgres',getUrl:()=>''};
 function formatDate(value,tz,format){const d=new Date(value);if(isNaN(d))return '';const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz||'America/Recife',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));return format.replace(/yyyy|MM|dd|HH|mm|ss/g,k=>parts[{yyyy:'year',MM:'month',dd:'day',HH:'hour',mm:'minute',ss:'second'}[k]]);}
 const cache=new Map();const localCache={get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)};
 const props=new Map();
 const runtime={SpreadsheetApp:{openById:()=>ss,flush:()=>{},CopyPasteType:{PASTE_FORMULA:'formula'}},Utilities:{getUuid:()=>crypto.randomUUID(),formatDate},
 CacheService:{getScriptCache:()=>localCache,getUserCache:()=>localCache},LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},
 Session:{getScriptTimeZone:()=> 'America/Recife'},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v)})},Logger:{log:()=>{}},ContentService:{}};
 return {runtime,book,dirty,changes:()=>Array.from(dirty).filter(n=>!['USUARIOS','SESSOES'].includes(n)).map(n=>{const old=collections.find(c=>c.nome===n);const header=old?.cabecalho||1;const cols=book[n][header-1];return {nome:n,cabecalho:header,colunas:cols,registros:book[n].slice(header).flatMap((r,i)=>r?.some(v=>v!==''&&v!=null)?[{ordem:header+i+1,dados:Object.fromEntries(cols.map((k,j)=>[k,r[j]??'']))}]:[])};})};
}
