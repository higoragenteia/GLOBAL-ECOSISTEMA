/**
 * Importador unico da planilha historica do Frotas para as colecoes do
 * GLOBAL ECOSISTEMA (Supabase). Nao e usado em tempo de execucao: o painel
 * consulta apenas o Supabase depois da importacao.
 *
 * O ID da planilha NAO fica no repositorio. Configure o segredo
 * FROTAS_SHEET_ID no projeto Supabase antes de usar a importacao.
 * A planilha pode ser uma copia somente leitura; nenhum dado e embutido aqui.
 */
export const SHEET_ID = (typeof Deno!=='undefined'&&Deno.env?.get?.('FROTAS_SHEET_ID'))||'';

export const SHEET_NAMES = [
  'Base de Dados',
  'Seguros',
  'Vencimentos',
  'Vencimentos Extras',
  'Pagamentos',
  'Registros de KM',
  'Abastecimentos',
  'Manutenções',
  'Fotos Veículos',
  'Documentos Frota',
  'Histórico de Alterações',
  'Alertas Automáticos App',
  'Histórico Push Frota',
];

/** Cabecalhos de contingencia para abas vazias (fonte: Frotas.gs / HEADERS). */
export const FALLBACK_HEADERS = {
  'Vencimentos Extras': ['ID', 'Placa', 'Tipo', 'Descrição', 'Vencimento', 'Valor', 'Pago/Regularizado', 'Observação'],
  'Pagamentos': ['ID', 'Placa', 'Data', 'Tipo', 'Descrição', 'Valor', 'Comprovante URL'],
  'Registros de KM': ['ID', 'Placa', 'Data', 'Quilometragem', 'Observação'],
  'Abastecimentos': ['ID', 'Placa', 'Data', 'Combustível', 'Litros', 'Valor (R$)', 'Quilometragem', 'Posto', 'Comprovante URL', 'Observação', 'Motorista'],
  'Fotos Veículos': ['ID', 'Placa', 'Foto URL', 'Legenda'],
  'Documentos Frota': ['ID', 'Placa', 'Tipo', 'Documento URL', 'Emissão', 'Vencimento', 'Status', 'Observação', 'Valor do IPVA'],
  'Histórico Push Frota': ['Data/Hora', 'Placa', 'Tipo', 'Status'],
};

export function gvizUrl(sheetName,sheetId=SHEET_ID) {
  if(!sheetId)throw new Error('FROTAS_SHEET_ID não configurado no Supabase. Defina o segredo antes de importar.');
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
}

/** Extrai o objeto JSON do envelope google.visualization.Query.setResponse(...). */
export function parseGviz(raw) {
  const text = String(raw ?? '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Resposta inválida da planilha (sem JSON).');
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (parsed?.status && parsed.status !== 'ok') throw new Error('Planilha recusou a consulta: ' + parsed.status);
  if (!parsed?.table) throw new Error('Planilha sem tabela de dados.');
  return parsed.table;
}

function cleanHeader(value) {
  return String(value ?? '').trim();
}

function cellValue(cell) {
  if (!cell) return '';
  const formatted = cell.f == null ? '' : String(cell.f).trim();
  // Datas formatadas (dd/mm/aaaa) sao mais uteis para o frontend legado.
  if (/^\d{2}\/\d{2}\/\d{4}/.test(formatted)) return formatted;
  const value = cell.v;
  if (value === null || value === undefined) return formatted;
  return value;
}

/** Converte a tabela do gviz em colunas e registros compativeis com o legado. */
export function buildCollection(name, table) {
  let headers = (table.cols || []).map(c => cleanHeader(c.label));
  while (headers.length && !headers[headers.length - 1]) headers.pop();
  if (!headers.some(Boolean)) headers = [...(FALLBACK_HEADERS[name] || [])];
  if (!headers.length) throw new Error('Aba sem cabecalho reconhecivel: ' + name);

  const records = [];
  for (let i = 0; i < (table.rows || []).length; i++) {
    const cells = table.rows[i]?.c || [];
    const values = headers.map((_, index) => cellValue(cells[index]));
    if (!values.some(v => String(v ?? '').trim() !== '')) continue;
    const dados = {};
    headers.forEach((header, index) => { dados[header] = values[index] ?? ''; });
    records.push({ ordem: i + 2, dados });
  }
  return { nome: name, colunas: headers, cabecalho: 1, registros: records };
}

export function buildCollections(tables) {
  return SHEET_NAMES.map(name => {
    const table = tables[name];
    if (!table) throw new Error('Aba ausente: ' + name);
    return buildCollection(name, table);
  });
}

export async function fetchCollections(fetchImpl = globalThis.fetch,sheetId=SHEET_ID) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch indisponível para importar a planilha.');
  if (!sheetId) throw new Error('FROTAS_SHEET_ID não configurado no Supabase. Defina o segredo antes de importar.');
  const entries = await Promise.all(SHEET_NAMES.map(async name => {
    const response = await fetchImpl(gvizUrl(name,sheetId), {headers: {'Accept': 'application/json'}});
    if (!response.ok) throw new Error(`Planilha ${name}: HTTP ${response.status}`);
    return [name, parseGviz(await response.text())];
  }));
  return buildCollections(Object.fromEntries(entries));
}

export function counts(collections) {
  const registros = collections.reduce((total, c) => total + (c.registros?.length || 0), 0);
  return {colecoes: collections.length, registros};
}
