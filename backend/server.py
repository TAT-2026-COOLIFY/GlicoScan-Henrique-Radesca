"""
server.py — Ponto de entrada do backend Flask
─────────────────────────────────────────────────────────────────────
GlicoScan API — calculadora de insulina para diabéticos tipo 1 (TCC ADS/FEMA)

Arquitetura do backend:
  config.py          → chaves de API (via .env) e configuração
  database.py         → acesso ao SQLite (histórico + cache)
  parsing.py           → interpretação do texto extraído por OCR
  services/
    openfoodfacts.py  → 1ª fonte de dados nutricionais (produtos BR)
    usda.py             → 2ª fonte, fallback com match exato de código de barras
    fatsecret.py       → busca complementar por nome
    ocr.py               → extração de texto de fotos (dual engine)
  routes.py            → todos os endpoints HTTP

Rodar localmente:  python server.py                    (porta 5000)
Rodar em produção: gunicorn server:app                 (ver DEPLOY.md)
"""
import os
from flask import Flask
from flask_cors import CORS

from database import init_db
from routes import bp as rotas_bp

app = Flask(__name__)
CORS(app)  # libera acesso do frontend (outro domínio, quando em produção)
app.register_blueprint(rotas_bp)

init_db()

if __name__ == '__main__':
    porta = int(os.environ.get('PORT', 5000))
    print("🚀 GlicoScan v4 — Dual OCR + FatSecret + Open Food Facts + USDA + Cache")
    print("🗃️ Banco: SQLite")
    app.run(debug=False, host='0.0.0.0', port=porta)
