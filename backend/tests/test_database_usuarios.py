"""
Testa a separação do histórico por usuário (user_id = id da conta no
Supabase). É isto que impede uma pessoa de ver ou apagar dado de outra.
"""
import pytest

import database as db


@pytest.fixture
def banco_temporario(tmp_path, monkeypatch):
    monkeypatch.setattr(db, 'DB_PATH', str(tmp_path / 'teste.db'))
    db.init_db()


def _item(produto, **extra):
    return {'produto': produto, 'carboTotal': 10, 'dose': 1, **extra}


def test_historico_fica_separado_por_usuario(banco_temporario):
    db.adicionar_historico(_item('Bolacha'), 'ana')
    db.adicionar_historico(_item('Suco'), 'bruno')

    assert [h['produto'] for h in db.listar_historico('ana')] == ['Bolacha']
    assert [h['produto'] for h in db.listar_historico('bruno')] == ['Suco']


def test_usuario_sem_dados_recebe_lista_vazia(banco_temporario):
    db.adicionar_historico(_item('Bolacha'), 'ana')
    assert db.listar_historico('carla') == []


def test_linha_antiga_sem_dono_nao_aparece_pra_ninguem(banco_temporario):
    conn = db.get_connection()
    conn.execute("INSERT INTO historico (produto, dose) VALUES ('Antigo', 1)")
    conn.commit()
    conn.close()

    assert db.listar_historico('ana') == []
    assert db.obter_estatisticas('ana')['total_calculos'] == 0


def test_remover_so_apaga_se_for_o_dono(banco_temporario):
    novo_id = db.adicionar_historico(_item('Bolacha'), 'ana')

    db.remover_historico(novo_id, 'bruno')
    assert len(db.listar_historico('ana')) == 1

    db.remover_historico(novo_id, 'ana')
    assert db.listar_historico('ana') == []


def test_limpar_so_afeta_o_usuario_informado(banco_temporario):
    db.adicionar_historico(_item('Bolacha'), 'ana')
    db.adicionar_historico(_item('Suco'), 'bruno')

    db.limpar_historico('ana')

    assert db.listar_historico('ana') == []
    assert len(db.listar_historico('bruno')) == 1


def test_estatisticas_sao_calculadas_por_usuario(banco_temporario):
    db.adicionar_historico({'produto': 'A', 'carboTotal': 10, 'dose': 1}, 'ana')
    db.adicionar_historico({'produto': 'B', 'carboTotal': 30, 'dose': 3}, 'ana')
    db.adicionar_historico({'produto': 'C', 'carboTotal': 100, 'dose': 10}, 'bruno')

    stats = db.obter_estatisticas('ana')
    assert stats['total_calculos'] == 2
    assert stats['media_carbo_por_refeicao'] == 20.0


def test_por_dia_traz_media_de_glicemia_ignorando_zeros(banco_temporario):
    db.adicionar_historico(_item('A', glicemiaAtual=100), 'ana')
    db.adicionar_historico(_item('B', glicemiaAtual=200), 'ana')
    db.adicionar_historico(_item('C', glicemiaAtual=0), 'ana')  # sem glicemia registrada

    assert db.obter_estatisticas('ana')['por_dia'][0]['glicemia'] == 150.0


def test_por_dia_sem_nenhuma_glicemia_registrada_no_dia_fica_none(banco_temporario):
    db.adicionar_historico(_item('A'), 'ana')
    assert db.obter_estatisticas('ana')['por_dia'][0]['glicemia'] is None
