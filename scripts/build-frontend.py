#!/usr/bin/env python3
"""Build seguro do frontend do GLOBAL ECOSISTEMA.

O painel publicado tem correções posteriores ao snapshot Painel.html (PWA,
deep link de conferência, layout móvel). Para não regredi-las, este script:

1. gera frotas.html a partir da interface original;
2. aplica somente os patches do Frotas no index.html existente;
3. preserva as páginas já publicadas de Gastos/Fornecedores/Máquinas, cujos
   snapshots em source-original são anteriores às correções feitas no dist;
4. copia os arquivos compartilhados e o Frotas para dist/.

Isso evita que um build apague funcionalidades dos outros módulos. A
reconciliação dos snapshots antigos é uma tarefa separada.
"""
from pathlib import Path
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
dist = root / "dist"
dist.mkdir(exist_ok=True)

subprocess.run([sys.executable, str(root / "scripts" / "build-frotas.py")], check=True, cwd=root)
subprocess.run([sys.executable, str(root / "scripts" / "patch-panel.py")], check=True, cwd=root)

# O painel já integrado é a fonte; patch-panel aplica as mudanças do Frotas.
shutil.copy2(root / "index.html", dist / "index.html")

shared = [
    "pedidos.html",
    "pedidos-api.js",
    "global-api.js",
    "shared-profile.js",
    "manifest.webmanifest",
    "frotas.html",
    "frotas-compat.js",
]
for filename in shared:
    source = root / filename
    if source.exists():
        shutil.copy2(source, dist / filename)
    else:
        print(f"AVISO: {filename} ausente; dist mantido sem esse arquivo.")

# Páginas já publicadas dos outros módulos: preservar sem reescrever a partir
# dos snapshots antigos. Se faltarem, o build não inventa uma versão reduzida.
for filename in ["gastos.html", "fornecedores.html", "maquinas.html"]:
    if not (dist / filename).exists():
        print(f"AVISO: dist/{filename} ausente; restaure a versão publicada antes do deploy.")

shutil.copytree(root / "assets", dist / "assets", dirs_exist_ok=True)
print("Frontend: painel + Frotas atualizados; Pedidos/Gastos/Fornecedores/Máquinas preservados em dist/.")
