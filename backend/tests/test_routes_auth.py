"""
Testa o login (routes._exigir_login) e, principalmente, o isolamento entre
contas: sem isso qualquer pessoa com a URL lê /historico (dose de insulina,
glicemia) de outras e apaga tudo. O Supabase é trocado por um dicionário
token -> id de usuário.
"""
import pytest
from flask import Flask

import database as db
import routes
from services import supabase_auth

TOKENS = {'token-ana': 'ana', 'token-bruno': 'bruno'}


def _cliente(tmp_path, monkeypatch, supabase_url):
    # Banco isolado: sem isso passa local por acidente (glicoscan.db de
    # outras rodadas) e quebra em CI (checkout limpo, sem tabela).
    monkeypatch.setattr(db, 'DB_PATH', str(tmp_path / 'teste.db'))
    db.init_db()
    monkeypatch.setattr(routes, 'SUPABASE_URL', supabase_url)
    monkeypatch.setattr(supabase_auth, 'usuario_do_token', TOKENS.get)
    app = Flask(__name__)
    app.register_blueprint(routes.bp)
    return app.test_client()


def _como(token):
    return {'Authorization': f'Bearer {token}'}


@pytest.fixture
def cliente(tmp_path, monkeypatch):
    return _cliente(tmp_path, monkeypatch, 'https://exemplo.supabase.co')


def test_sem_header_e_rejeitado(cliente):
    assert cliente.get('/historico').status_code == 401


def test_token_invalido_e_rejeitado(cliente):
    assert cliente.get('/historico', headers=_como('falso')).status_code == 401


def test_header_sem_bearer_e_rejeitado(cliente):
    assert cliente.get('/historico', headers={'Authorization': 'token-ana'}).status_code == 401


def test_token_valido_passa(cliente):
    assert cliente.get('/historico', headers=_como('token-ana')).status_code == 200


def test_health_fica_aberta_sem_login(cliente):
    assert cliente.get('/health').status_code == 200


def test_rotas_que_gastam_api_externa_tambem_exigem_login(cliente):
    assert cliente.get('/barcode?code=7891000100103').status_code == 401
    assert cliente.get('/buscar?nome=leite').status_code == 401


def test_sem_supabase_configurado_roda_aberto_em_dev_local(tmp_path, monkeypatch):
    cliente = _cliente(tmp_path, monkeypatch, '')
    assert cliente.get('/historico').status_code == 200


def test_em_producao_sem_supabase_configurado_fecha_a_api(tmp_path, monkeypatch):
    monkeypatch.setenv('RENDER', 'true')
    cliente = _cliente(tmp_path, monkeypatch, '')
    assert cliente.get('/historico').status_code == 503
    assert cliente.get('/health').status_code == 200


# ── Isolamento entre contas ──────────────────────────────────────

def test_usuario_nao_ve_historico_de_outro(cliente):
    cliente.post('/historico', json={'produto': 'Bolacha da Ana'}, headers=_como('token-ana'))

    assert cliente.get('/historico', headers=_como('token-bruno')).get_json() == []
    assert len(cliente.get('/historico', headers=_como('token-ana')).get_json()) == 1


def test_parametro_perfil_nao_burla_o_isolamento(cliente):
    cliente.post('/historico', json={'produto': 'Bolacha', 'perfil': 'Perfil 1'}, headers=_como('token-ana'))

    r = cliente.get('/historico?perfil=Perfil 1', headers=_como('token-bruno'))
    assert r.get_json() == []


def test_usuario_nao_apaga_item_de_outro_pelo_id(cliente):
    novo_id = cliente.post('/historico', json={'produto': 'Bolacha'}, headers=_como('token-ana')).get_json()['id']

    cliente.delete(f'/historico/{novo_id}', headers=_como('token-bruno'))

    assert len(cliente.get('/historico', headers=_como('token-ana')).get_json()) == 1


def test_limpar_tudo_so_apaga_o_meu(cliente):
    cliente.post('/historico', json={'produto': 'A'}, headers=_como('token-ana'))
    cliente.post('/historico', json={'produto': 'B'}, headers=_como('token-bruno'))

    cliente.delete('/historico', headers=_como('token-ana'))

    assert cliente.get('/historico', headers=_como('token-ana')).get_json() == []
    assert len(cliente.get('/historico', headers=_como('token-bruno')).get_json()) == 1


def test_estatisticas_so_contam_o_meu(cliente):
    cliente.post('/historico', json={'produto': 'A', 'dose': 2}, headers=_como('token-ana'))
    cliente.post('/historico', json={'produto': 'B', 'dose': 4}, headers=_como('token-bruno'))

    stats = cliente.get('/stats', headers=_como('token-ana')).get_json()
    assert stats['total_calculos'] == 1
