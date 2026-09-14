"""
Testa o mecanismo de rate limit (flask-limiter) do jeito que é usado em
routes.py: decorator por rota + `limiter.exempt`. Usa um Flask app e um
Limiter isolados (não o `extensions.limiter` real) pra não bater nas
rotas de verdade (que fariam chamada de rede) nem compartilhar estado
de contagem entre testes.
"""
from flask import Flask, jsonify
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address


def _criar_app():
    app = Flask(__name__)
    limiter = Limiter(key_func=get_remote_address)
    limiter.init_app(app)

    @app.route('/limitada')
    @limiter.limit('2 per minute')
    def limitada():
        return jsonify({'ok': True})

    @app.route('/isenta')
    @limiter.exempt
    def isenta():
        return jsonify({'ok': True})

    return app


def test_bloqueia_apos_exceder_o_limite():
    cliente = _criar_app().test_client()
    assert cliente.get('/limitada').status_code == 200
    assert cliente.get('/limitada').status_code == 200
    assert cliente.get('/limitada').status_code == 429


def test_rota_isenta_nao_e_limitada():
    cliente = _criar_app().test_client()
    for _ in range(5):
        assert cliente.get('/isenta').status_code == 200
