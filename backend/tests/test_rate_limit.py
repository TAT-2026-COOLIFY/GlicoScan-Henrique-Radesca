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


def test_atras_do_proxy_cada_cliente_tem_o_proprio_limite():
    """Com ProxyFix (server.py) o limite é por IP real do cliente, não do proxy do Render."""
    from werkzeug.middleware.proxy_fix import ProxyFix

    app = _criar_app()
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1)
    cliente = app.test_client()
    proxy = {'REMOTE_ADDR': '10.0.0.1'}  # o Render aparece sempre com o mesmo IP

    def bater(ip_real):
        return cliente.get('/limitada', headers={'X-Forwarded-For': ip_real}, environ_overrides=proxy).status_code

    assert [bater('1.1.1.1'), bater('1.1.1.1'), bater('1.1.1.1')] == [200, 200, 429]
    assert bater('2.2.2.2') == 200  # outra pessoa, mesmo proxy: contador dela é separado


def test_cliente_nao_consegue_forjar_o_ip_pra_escapar_do_limite():
    from werkzeug.middleware.proxy_fix import ProxyFix

    app = _criar_app()
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1)
    cliente = app.test_client()
    proxy = {'REMOTE_ADDR': '10.0.0.1'}

    # O Render acrescenta o IP real ao FINAL da lista; o que veio antes é do cliente.
    respostas = [
        cliente.get('/limitada', headers={'X-Forwarded-For': f'falso-{i}, 1.1.1.1'}, environ_overrides=proxy).status_code
        for i in range(3)
    ]
    assert respostas == [200, 200, 429]
