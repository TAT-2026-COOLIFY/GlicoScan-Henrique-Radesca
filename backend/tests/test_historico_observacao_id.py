"""
Testa dois comportamentos novos do histórico:
  - campo `observacao` (nota livre) é gravado e volta na listagem
  - POST /historico devolve o `id` do registro criado (usado pelo
    frontend pra oferecer "desfazer" logo após salvar)
"""
import pytest
from flask import Flask

import database as db
import routes


@pytest.fixture
def cliente(tmp_path, monkeypatch):
    monkeypatch.setattr(db, 'DB_PATH', str(tmp_path / 'teste.db'))
    db.init_db()
    monkeypatch.setattr(routes, 'SUPABASE_URL', '')
    app = Flask(__name__)
    app.register_blueprint(routes.bp)
    return app.test_client()


def test_post_historico_devolve_id_do_registro(cliente):
    r = cliente.post('/historico', json={'produto': 'Bolacha', 'carboidratos': 20, 'dose': 1.5})
    assert r.status_code == 200
    data = r.get_json()
    assert data['ok'] is True
    assert isinstance(data['id'], int)


def test_observacao_e_gravada_e_aparece_na_listagem(cliente):
    cliente.post('/historico', json={'produto': 'Bolacha', 'observacao': 'fiz exercício antes'})
    hist = cliente.get('/historico').get_json()
    assert hist[0]['observacao'] == 'fiz exercício antes'


def test_observacao_ausente_vira_string_vazia(cliente):
    cliente.post('/historico', json={'produto': 'Bolacha'})
    hist = cliente.get('/historico').get_json()
    assert hist[0]['observacao'] == ''


def test_desfazer_remove_pelo_id_devolvido(cliente):
    r = cliente.post('/historico', json={'produto': 'Bolacha'})
    novo_id = r.get_json()['id']

    cliente.delete(f'/historico/{novo_id}')

    hist = cliente.get('/historico').get_json()
    assert hist == []
