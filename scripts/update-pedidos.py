from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'supabase/functions/pedidos-api/index.ts';s=p.read_text()
s=s.replace("const isAdmin = (u: any) => ['SUPERADMIN', 'ADMIN'].includes(u.perfil);", "const pedidoLevel = (u: any) => u.perfil === 'SUPERADMIN' ? 'GERENCIAR' : u.permissoes?.pedidos || '';\nconst isAdmin = (u: any) => pedidoLevel(u) === 'GERENCIAR';")
s=s.replace("superadmin: u.perfil === 'SUPERADMIN', permissoes: { pedidos: isAdmin(u) ? 'GERENCIAR' : 'OPERAR' }, projetos: ['pedidos'],", "superadmin: u.perfil === 'SUPERADMIN', permissoes: { pedidos: pedidoLevel(u) }, projetos: pedidoLevel(u) ? ['pedidos'] : [],")
s=s.replace('podeGerenciarPedidos: isAdmin(u), podeOperarPedidos: true','podeGerenciarPedidos: isAdmin(u), podeOperarPedidos: [\'GERENCIAR\',\'OPERAR\'].includes(pedidoLevel(u))')
s=s.replace("async function run(fn: string, a: any[], u: any) {", "async function run(fn: string, a: any[], u: any) {\n if (!pedidoLevel(u) && !['estadoSessaoFuncionarioGVG','sessaoFuncionario','validarSessaoAdminGVG','salvarFotoPerfil'].includes(fn)) fail('Seu perfil não tem acesso ao Pedidos.');")
s=s.replace("podeOperar: true, podeGerenciar: isAdmin(u)", "podeOperar: ['GERENCIAR','OPERAR'].includes(pedidoLevel(u)), podeGerenciar: isAdmin(u)")
s=s.replace("case 'registrarSolicitacao': {", "case 'registrarSolicitacao': {\n  if (!['GERENCIAR','OPERAR'].includes(pedidoLevel(u))) fail('Seu acesso ao Pedidos é somente leitura.');")
s=s.replace("changes.perfil = ['ADMIN', 'GERENCIAR'].includes(a[4].pedidos) ? 'ADMIN' : 'OPERADOR';", "changes.permissoes = {...target.permissoes, pedidos: ['ADMIN','GERENCIAR'].includes(a[4].pedidos) ? 'GERENCIAR' : a[4].pedidos === 'VISUAL' ? 'VISUAL' : a[4].pedidos ? 'OPERAR' : ''};")
s=s.replace("changes.perfil = ['ADMIN', 'GERENCIAR'].includes(a[2]?.pedidos) ? 'ADMIN' : 'OPERADOR';", "changes.permissoes = {...target.permissoes, pedidos: ['ADMIN','GERENCIAR'].includes(a[2]?.pedidos) ? 'GERENCIAR' : a[2]?.pedidos === 'VISUAL' ? 'VISUAL' : a[2]?.pedidos ? 'OPERAR' : ''};")
p.write_text(s)
