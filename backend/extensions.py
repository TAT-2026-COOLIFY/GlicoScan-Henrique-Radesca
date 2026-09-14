"""
extensions.py — Objetos compartilhados entre routes.py e server.py
─────────────────────────────────────────────────────────────────────
Fica num módulo à parte pra evitar import circular: routes.py (as
rotas) precisa decorar funções com `limiter.limit(...)` na hora de
definir a Blueprint, mas quem cria o Flask app de verdade é
server.py — que importa routes.py. O Limiter suporta esse padrão:
criar o objeto aqui sem app nenhum, e só chamar `limiter.init_app(app)`
depois, em server.py.
"""
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Limite geral (por IP) pra qualquer rota sem limite específico —
# protege contra bug/loop, não é o limite que importa de verdade.
#
# Storage em memória (padrão) — o Flask-Limiter avisa que não é
# recomendado pra produção porque não é compartilhado entre processos.
# Pra esse app (um único worker, TCC de baixo tráfego, plano gratuito)
# é suficiente; se crescer, trocar por Redis é só passar storage_uri.
limiter = Limiter(key_func=get_remote_address, default_limits=['200 per hour'])
