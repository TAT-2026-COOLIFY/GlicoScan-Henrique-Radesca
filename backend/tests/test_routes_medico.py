"""Testa POST /medico/verificar — trava que libera edição de RIC/insulina/FS."""
import pytest
from flask import Flask

import routes


def _cliente(monkeypatch, senha_configurada):
    monkeypatch.setattr(routes, 'DOCTOR_PASSWORD', senha_configurada)
    monkeypatch.setattr(routes, 'SUPABASE_URL', '')  # sem login: não é o que este teste cobre
    app = Flask(__name__)
    app.register_blueprint(routes.bp)
    return app.test_client()


def test_senha_correta_libera(monkeypatch):
    cliente = _cliente(monkeypatch, 'senha-do-medico')
    r = cliente.post('/medico/verificar', json={'senha': 'senha-do-medico'})
    assert r.status_code == 200
    assert r.get_json() == {'ok': True}


def test_senha_errada_e_rejeitada(monkeypatch):
    cliente = _cliente(monkeypatch, 'senha-do-medico')
    r = cliente.post('/medico/verificar', json={'senha': 'chute'})
    assert r.status_code == 401


def test_sem_senha_no_corpo_e_rejeitado(monkeypatch):
    cliente = _cliente(monkeypatch, 'senha-do-medico')
    r = cliente.post('/medico/verificar', json={})
    assert r.status_code == 401


def test_sem_doctor_password_configurada_devolve_erro_claro(monkeypatch):
    cliente = _cliente(monkeypatch, '')
    r = cliente.post('/medico/verificar', json={'senha': 'qualquer'})
    assert r.status_code == 400


def test_health_avisa_frontend_se_trava_esta_ativa(monkeypatch):
    assert _cliente(monkeypatch, 'senha-do-medico').get('/health').get_json()['trava_medica'] is True
    assert _cliente(monkeypatch, '').get('/health').get_json()['trava_medica'] is False
