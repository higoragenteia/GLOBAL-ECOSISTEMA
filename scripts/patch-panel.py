#!/usr/bin/env python3
"""Aplica somente os patches do Frotas no painel já integrado.

O snapshot `source-original/Painel.html` é anterior a correções feitas diretamente
no painel publicado (PWA móvel, deep link de conferência, etc.). Regenerar o
painel inteiro a partir dele remove essas correções. Este script preserva o
`index.html` atual e aplica apenas as mudanças necessárias ao Frotas, de forma
idempotente.
"""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
targets = [root / "index.html", root / "dist" / "index.html"]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count == 0:
        return text
    if count != 1:
        raise SystemExit(f"{label}: esperava 1 ocorrencia, encontrou {count}")
    return text.replace(old, new, 1)


def patch(text: str) -> str:
    # Conta principal protegida por perfil, sem e-mail pessoal versionado.
    text = re.sub(
        r"const protectedUser=String\(u\.email\|\|''\)\.toLowerCase\(\)==='[^']+';",
        "const protectedUser=String(u.perfil||'').toUpperCase()==='SUPERADMIN';",
        text,
        count=1,
    )
    # URLs relativas/absolutas funcionam dentro do iframe e em aba avulsa.
    old_frame = """  function frotasFrameUrl(){
    if(!state.frotasAlert)return FROTAS_URL;
    const url=new URL(FROTAS_URL);
    url.searchParams.set('alerta',state.frotasAlert);
    return url.href;
  }"""
    new_frame = """  function frotasFrameUrl(){
    const url=new URL(FROTAS_URL,location.href);
    if(state.frotasAlert)url.searchParams.set('alerta',state.frotasAlert);
    return url.href;
  }"""
    text = replace_once(text, old_frame, new_frame, "frotasFrameUrl")
    # O Frotas é same-origin; aceita o aviso de pronto e esconde o overlay.
    old_listener = """  // Eventos
  window.addEventListener('message',function(ev){
    const origin=String(ev.origin||'');
    if(!/^https:\\/\\/script\\.google\\.com$/.test(origin)&&!/^https:\\/\\/[^/]+\\.googleusercontent\\.com$/.test(origin))return;
    if(ev.data&&ev.data.type==='gvg-frotas-logout')logout();
  });"""
    new_listener = """  // Eventos: o Frotas é servido na mesma origem do painel.
  window.addEventListener('message',function(ev){
    const origin=String(ev.origin||'');
    const sameOrigin=origin===location.origin;
    if(!sameOrigin&&!/^https:\\/\\/script\\.google\\.com$/.test(origin)&&!/^https:\\/\\/[^/]+\\.googleusercontent\\.com$/.test(origin))return;
    if(!ev.data)return;
    if(ev.data.type==='gvg-frotas-ready'){hideFrotasLoading();return;}
    if(ev.data.type==='gvg-frotas-logout')logout();
  });
  const frotasFrameEl=$('gvgpFrotasFrame');
  if(frotasFrameEl)frotasFrameEl.addEventListener('load',hideFrotasLoading);"""
    text = replace_once(text, old_listener, new_listener, "message listener")
    # Remove o cabecalho extra da view Frotas (Voltar / Abrir Controle de Frotas).
    # O menu lateral continua oferecendo a navegacao de volta.
    text = re.sub(
        r'(<section id="gvgpViewFrotas"[^>]*>\s*)<div class="gvgp-frame-head[^"]*"[^>]*>.*?</div>\s*(?=<div class="gvgp-frame-wrap">)',
        r'\1',
        text,
        count=1,
        flags=re.S,
    )
    return text


for target in targets:
    if not target.exists():
        continue
    source = target.read_text(encoding="utf-8")
    patched = patch(source)
    if patched != source:
        target.write_text(patched, encoding="utf-8")
        print(f"Painel atualizado: {target}")
    else:
        print(f"Painel já atualizado: {target}")
