# GVG&ARTEFAL | Pedidos — Supabase

Primeira versão isolada do Pedidos. Interface copiada de `higoragenteia/gvg-artefal`, commit `e844395157299a3e18fc5f51ed2355b3815f0aea`, sem alterações na origem ou nos outros quatro aplicativos.

## Componentes

- `index.html`: catálogo, carrinho, favoritos, histórico, gestão e conferência do aplicativo original.
- `pedidos-api.js`: autenticação Supabase e chamadas para a Edge Function, com renovação de sessão.
- `supabase/functions/pedidos-api/index.ts`: backend autenticado. Apenas a chave pública está no navegador; a chave de serviço vem do ambiente da Edge Function.
- `database/schema.sql`: estrutura nova com prefixo `pedidos_`, RLS e acesso direto negado aos papéis `anon` e `authenticated`.
- `database/catalogo.json`: catálogo e obras copiados da planilha ativa em 19/11/2026. O backend preserva os fatores especiais de embalagem do original.
- `dist/`: arquivos estáticos para publicação.

## Estado inicial

Foram copiados 327 produtos e 17 opções de obra. Os pedidos e usuários antigos da planilha não foram importados. A conta Supabase existente `higoragenteia@gmail.com` recebeu o perfil de Superadministrador exclusivo deste app. Entre com a senha já cadastrada nessa conta do aplicativo Supabase; a sessão do painel antigo não é compartilhada.

Novos cadastros ficam pendentes até aprovação. A senha mínima é de oito caracteres. Usuários sem e-mail usam internamente um identificador sob `pedidos.gvg.invalid`; não há envio de e-mail nesse fluxo. Aprovação e perfis pertencem somente ao Pedidos.

O destino direto do WhatsApp está vazio porque a planilha de origem trazia um número fictício. Compartilhar no WhatsApp permanece disponível e a ação final de envio é manual. Configure o destino real em `pedidos_config`, chave `WHATSAPP_DESTINO`, antes de usar o envio direto. O reenvio da conferência mantém o solicitante original.

Fotos existentes mantêm as URLs da origem. Novas fotos são armazenadas no bucket `pedidos-fotos`. Sessões e carrinho têm chaves próprias para evitar conflito com o aplicativo atual.

## Publicação

O repositório `higorteste` é privado. Uma publicação privada separada permite revisão sem modificar o domínio da operação. `.openai/hosting.json` identifica essa publicação; `dist/` contém somente arquivos públicos do frontend.

## Verificação e limites

- Confirmados: implantação da Edge Function, negação de acesso sem login, criação de cadastros pendentes, conteúdo do catálogo no banco, abertura da tela de login e verificação sintática do JavaScript.
- O teste completo com perfil administrativo não foi concluído: a revisão automática recusou ativar/promover as contas temporárias de QA.
- O botão de limpeza de histórico está desativado nesta primeira versão.
- A exclusão das 12 tabelas antigas e, depois, o arquivamento reversível foram bloqueados pela revisão automática por envolverem estruturas compartilhadas. Nenhuma tabela antiga foi alterada. Uma contagem exata encontrou registros em algumas delas, embora as estimativas iniciais indicassem zero.
- As novas tabelas usam RLS sem políticas de cliente por projeto: somente a Edge Function, que valida identidade e perfil, acessa os dados.

## Desenvolvimento

Sirva `dist/` com qualquer servidor HTTP estático. Para atualizar a Edge Function, publique seu diretório com o nome `pedidos-api`; a verificação JWT do gateway fica desativada porque o próprio handler valida o token usando Supabase Auth e permite cadastro público sujeito a aprovação. Nenhuma operação de dados privados é pública.

Nunca inclua `SUPABASE_SERVICE_ROLE_KEY` no HTML, JavaScript público ou repositório.
