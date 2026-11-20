# Análise das versões do Frotas — 20/11/2026

## Links analisados

| Link | O que é | Resultado |
|---|---|---|
| `https://higoragenteia.github.io/gvg-artefal/` | Wrapper PWA de 8.132 bytes que carrega uma implantação do Apps Script em iframe | Aponta para a implantação v199 (`AKfy...`), a versão atual do Frotas no Apps Script |
| `https://gvgartefalesquadrias.com.br/` | GitHub Pages do repositório `GLOBAL-ECOSISTEMA` com domínio próprio | Serve o painel GLOBAL atual, mas o `frotas.html` publicado ainda é a página reduzida antiga (23.319 bytes) |
| `https://github.com/higoragenteia/gvg-artefal` | Repositório-fonte do painel/Apps Script | Commit `e844395` (v199, 17/11/2026). Contém `src/FrotasIndex.html` (3,3 MB com fotos embutidas) e `src/Frotas.gs` |

## Comparação das versões

### GitHub Pages (`gvg-artefal`)

- Não é a aplicação Frotas em si; é um wrapper que monta um iframe para
  `script.google.com/macros/s/.../exec?v=199&ui=frotas-numero-apolice-20261117`.
- Portanto, o que aparece nesse link é a versão **v199** publicada no Apps
  Script, não o conteúdo do GitHub Pages isoladamente.

### Produção (`gvgartefalesquadrias.com.br`)

- É o Pages do repositório `GLOBAL-ECOSISTEMA` (CNAME
  `gvgartefalesquadrias.com.br`).
- `index.html`: 261.723 bytes (painel GLOBAL).
- `frotas.html`: **23.319 bytes**, a página nativa reduzida antiga.
- `frotas-compat.js`: **8.856 bytes**, adaptador antigo.
- Ou seja: o backend Supabase está atualizado, mas o frontend publicado ainda
  mostra a versão reduzida.

### Repositório `gvg-artefal` (fonte atual)

- Commit `e844395` — “Exibe número da apólice no card Seguro do Frotas (v199)”.
- `src/FrotasIndex.html`: 3.326.171 bytes, com fotos reais embutidas por placa.
- `src/Frotas.gs`: 35.484 bytes; hash idêntico ao backend usado na integração
  Supabase (`f2ec7b86...`). As regras de negócio não mudaram entre a versão
  integrada e a v199.
- `src/Painel.html`: 260.290 bytes (painel Apps Script, não o painel GLOBAL).
- `docs/FROTAS_INTEGRACAO.md` do repositório ainda descreve a v127; está
  desatualizado em relação ao código v199.

## Diferença funcional encontrada

Depois de remover as fotos embutidas, a comparação entre o `FrotasIndex.html`
atual e o que já estava integrado mostrou **uma única mudança funcional**:

- **v199:** o card “Seguro” passou a exibir o número da apólice
  (`ins.policy`) quando existir, com fallback para o tipo de documento.

Essa linha foi aplicada em `source-original/FrotasIndex.html`, o `frotas.html`
foi regenerado e o teste de UI passou a verificar a apólice `A-1` na ficha do
veículo.

## Situação do GLOBAL/Supabase

- Banco: `database/frotas.sql` aplicado.
- Funções: `frotas-api` v3 e `global-api` v8 ativas.
- Importação: 13 coleções, 87 registros, backup e auditoria.
- Frontend local (`frotas.html`): 152.692 bytes, interface original completa,
  já com a mudança v199.
- **Frontend de produção:** ainda é a página reduzida de 23.319 bytes.
- Para publicar: é necessário enviar/mergear a branch
  `feat/frotas-integracao-completa` para `main` do repositório
  `GLOBAL-ECOSISTEMA` (GitHub Pages) ou executar o deploy estático usado pela
  hospedagem.

## Segurança

- As fotos reais embutidas por placa não foram copiadas para o repositório
  GLOBAL; a versão local usa a coleção `Fotos Veículos` e as ilustrações
  genéricas.
- O repositório `gvg-artefal` é público e contém as fotos no arquivo original;
  isso é uma exposição preexistente, não criada por esta integração.
- O repositório `GLOBAL-ECOSISTEMA` também está público e contém dados de outros
  módulos em `database/importacao/`. Recomenda-se torná-lo privado e revisar o
  histórico.
- O token Supabase usado na implantação foi removido do ambiente local; deve ser
  revogado no painel do Supabase.
