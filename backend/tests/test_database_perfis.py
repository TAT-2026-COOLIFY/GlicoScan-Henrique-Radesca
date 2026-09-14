"""
Testa a separação de histórico por perfil (múltiplas "regulagens" no
mesmo app, ex: família usando o mesmo aparelho) e a migração de linhas
antigas (perfil=NULL, gravadas antes dessa feature existir).
"""
import sqlite3

import pytest

import database as db


@pytest.fixture
def banco_temporario(tmp_path, monkeypatch):
    caminho = str(tmp_path / 'teste.db')
    monkeypatch.setattr(db, 'DB_PATH', caminho)
    db.init_db()
    return caminho


def _historico_minimo(produto, perfil):
    return {'produto': produto, 'carboidratos': 10, 'dose': 1, 'perfil': perfil}


def test_historico_fica_separado_por_perfil(banco_temporario):
    db.adicionar_historico(_historico_minimo('Bolacha', 'Ana'))
    db.adicionar_historico(_historico_minimo('Suco', 'Bruno'))

    hist_ana = db.listar_historico(perfil='Ana')
    hist_bruno = db.listar_historico(perfil='Bruno')

    assert [h['produto'] for h in hist_ana] == ['Bolacha']
    assert [h['produto'] for h in hist_bruno] == ['Suco']


def test_sem_perfil_informado_lista_de_todo_mundo(banco_temporario):
    db.adicionar_historico(_historico_minimo('Bolacha', 'Ana'))
    db.adicionar_historico(_historico_minimo('Suco', 'Bruno'))

    assert len(db.listar_historico()) == 2


def test_linha_antiga_sem_perfil_aparece_no_perfil_padrao(banco_temporario):
    # Simula uma linha gravada antes de existir a coluna perfil (migração ALTER TABLE)
    conn = sqlite3.connect(banco_temporario)
    conn.execute(
        "INSERT INTO historico (produto, carbo_total, dose, perfil) VALUES (?,?,?,NULL)",
        ('Item Antigo', 5, 0.5),
    )
    conn.commit()
    conn.close()

    hist = db.listar_historico(perfil=db.PERFIL_PADRAO)
    assert [h['produto'] for h in hist] == ['Item Antigo']


def test_limpar_historico_so_afeta_o_perfil_informado(banco_temporario):
    db.adicionar_historico(_historico_minimo('Bolacha', 'Ana'))
    db.adicionar_historico(_historico_minimo('Suco', 'Bruno'))

    db.limpar_historico(perfil='Ana')

    assert db.listar_historico(perfil='Ana') == []
    assert len(db.listar_historico(perfil='Bruno')) == 1


def test_estatisticas_sao_calculadas_por_perfil(banco_temporario):
    db.adicionar_historico({'produto': 'A', 'carboTotal': 10, 'dose': 1, 'perfil': 'Ana'})
    db.adicionar_historico({'produto': 'B', 'carboTotal': 30, 'dose': 3, 'perfil': 'Ana'})
    db.adicionar_historico({'produto': 'C', 'carboTotal': 100, 'dose': 10, 'perfil': 'Bruno'})

    stats_ana = db.obter_estatisticas(perfil='Ana')
    assert stats_ana['total_calculos'] == 2
    assert stats_ana['media_carbo_por_refeicao'] == 20.0
