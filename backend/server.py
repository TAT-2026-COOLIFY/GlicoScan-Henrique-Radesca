"""
server.py — Ponto de entrada do backend Flask
─────────────────────────────────────────────────────────────────────
GlicoScan API — calculadora de insulina para diabéticos tipo 1 (TCC ADS/FEMA)

Arquitetura do backend:
  config.py          → chaves de API (via .env) e configuração
  extensions.py        → Limiter (rate limit), à parte pra evitar import circular
  database.py         → acesso ao SQLite (histórico + cache)
  parsing.py           → interpretação do texto extraído por OCR
  services/
    openfoodfacts.py  → 1ª fonte de dados nutricionais (produtos BR)
    usda.py             → 2ª fonte, fallback com match exato de código de barras
    fatsecret.py       → busca complementar por nome
    ocr.py               → extração de texto de fotos (dual engine)
  routes.py            → todos os endpoints HTTP (+ trava por token e rate limit)

Rodar localmente:  python server.py                    (porta 5000)
Rodar em produção: gunicorn server:app                 (ver DEPLOY.md)
"""
import os
from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix

from config import CORS_ORIGINS
from database import init_db
from extensions import limiter
from routes import bp as rotas_bp

app = Flask(__name__)

# Atrás do proxy do Render, request.remote_addr é o IP do proxy — igual pra
# todo mundo. Sem isto, o rate limit (que conta por IP) é dividido entre TODOS
# os usuários: 5 tentativas/min na senha do médico, 10 OCR/min etc. valeriam
# pro app inteiro. x_for=1 lê o IP que o próprio Render acrescentou ao
# X-Forwarded-For (o último da lista), que o cliente não consegue forjar.
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1)

# '*' (padrão) libera geral — trocar ALLOWED_ORIGINS no .env pra travar
# no domínio do frontend em produção (ver DEPLOY.md).
CORS(app, origins=CORS_ORIGINS)

limiter.init_app(app)
app.register_blueprint(rotas_bp)


@app.errorhandler(429)
def _limite_excedido(e):
    return jsonify({'erro': 'Muitas requisições — aguarde um instante e tente de novo.'}), 429


init_db()

if __name__ == '__main__':
    porta = int(os.environ.get('PORT', 5000))
    print("🚀 GlicoScan v4 — Dual OCR + FatSecret + Open Food Facts + USDA + Cache")
    print("🗃️ Banco: SQLite")
    app.run(debug=False, host='0.0.0.0', port=porta)
