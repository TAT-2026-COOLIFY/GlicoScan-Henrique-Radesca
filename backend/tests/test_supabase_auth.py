"""Testa a validação de token contra o Supabase (services/supabase_auth.py), sem rede."""
import pytest
import requests

import config
from services import supabase_auth


class _Resposta:
    def __init__(self, status, corpo=None):
        self.status_code = status
        self._corpo = corpo or {}

    def json(self):
        return self._corpo


@pytest.fixture(autouse=True)
def _ambiente(monkeypatch):
    monkeypatch.setattr(config, 'SUPABASE_URL', 'https://exemplo.supabase.co')
    monkeypatch.setattr(config, 'SUPABASE_KEY', 'chave-publica')
    supabase_auth._cache.clear()


def test_token_valido_devolve_o_id(monkeypatch):
    monkeypatch.setattr(requests, 'get', lambda *a, **k: _Resposta(200, {'id': 'abc-123'}))
    assert supabase_auth.usuario_do_token('tok') == 'abc-123'


def test_manda_a_chave_e_o_token_no_header(monkeypatch):
    visto = {}

    def falso(url, headers, timeout):
        visto.update(url=url, headers=headers)
        return _Resposta(200, {'id': 'u'})

    monkeypatch.setattr(requests, 'get', falso)
    supabase_auth.usuario_do_token('tok')

    assert visto['url'] == 'https://exemplo.supabase.co/auth/v1/user'
    assert visto['headers'] == {'apikey': 'chave-publica', 'Authorization': 'Bearer tok'}


def test_token_recusado_devolve_none(monkeypatch):
    monkeypatch.setattr(requests, 'get', lambda *a, **k: _Resposta(401))
    assert supabase_auth.usuario_do_token('ruim') is None


def test_falha_de_rede_devolve_none(monkeypatch):
    def cai(*a, **k):
        raise requests.ConnectionError()

    monkeypatch.setattr(requests, 'get', cai)
    assert supabase_auth.usuario_do_token('tok') is None


def test_resposta_sem_id_devolve_none(monkeypatch):
    monkeypatch.setattr(requests, 'get', lambda *a, **k: _Resposta(200, {}))
    assert supabase_auth.usuario_do_token('tok') is None


def test_segunda_chamada_usa_cache(monkeypatch):
    chamadas = []

    def falso(*a, **k):
        chamadas.append(1)
        return _Resposta(200, {'id': 'u'})

    monkeypatch.setattr(requests, 'get', falso)
    supabase_auth.usuario_do_token('tok')
    supabase_auth.usuario_do_token('tok')

    assert len(chamadas) == 1


def test_token_recusado_nao_entra_no_cache(monkeypatch):
    respostas = iter([_Resposta(401), _Resposta(200, {'id': 'u'})])
    monkeypatch.setattr(requests, 'get', lambda *a, **k: next(respostas))

    assert supabase_auth.usuario_do_token('tok') is None
    assert supabase_auth.usuario_do_token('tok') == 'u'
