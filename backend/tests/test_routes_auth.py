"""
Testa a trava por APP_TOKEN (routes._checar_app_token). Sem ela, qualquer
pessoa com a URL pública do backend lê /historico (dose de insulina,
glicemia) e apaga tudo via DELETE, sem login nenhum.
"""
import pytest
from flask import Flask

import routes


def _client_com_token(monkeypatch, token):
    monkeypatch.setattr(routes, 'APP_TOKEN', token)
    app = Flask(__name__)
    app.register_blueprint(routes.bp)
    return app.test_client()


@pytest.fixture
def cliente(monkeypatch):
    return _client_com_token(monkeypatch, 'segredo-teste')


@pytest.fixture
def cliente_sem_app_token_configurado(monkeypatch):
    return _client_com_token(monkeypatch, '')


def test_sem_header_e_rejeitado(cliente):
    assert cliente.get('/historico').status_code == 401


def test_header_errado_e_rejeitado(cliente):
    r = cliente.get('/historico', headers={'X-App-Token': 'errado'})
    assert r.status_code == 401


def test_header_correto_passa(cliente):
    r = cliente.get('/historico', headers={'X-App-Token': 'segredo-teste'})
    assert r.status_code == 200


def test_health_fica_aberta_mesmo_com_token_configurado(cliente):
    assert cliente.get('/health').status_code == 200


def test_sem_app_token_configurado_a_trava_fica_desativada(cliente_sem_app_token_configurado):
    assert cliente_sem_app_token_configurado.get('/historico').status_code == 200
