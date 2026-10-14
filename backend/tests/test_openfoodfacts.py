"""Conversão do JSON da Open Food Facts: porção vs 100g e detecção de produto sem nutrientes."""
from services import openfoodfacts as off


def test_so_valores_por_100g_e_sem_porcao_fica_marcado_como_100g():
    p = off._processar_produto({
        'product_name': 'Farinha', 'nutriments': {'carbohydrates_100g': 76, 'energy-kcal_100g': 360},
    })
    assert p['porcao'] == '100g'
    assert p['carboidratos'] == 76
    assert p['_tem_dado'] is True


def test_valor_por_porcao_usa_o_tamanho_da_porcao_do_rotulo():
    p = off._processar_produto({
        'product_name': 'Biscoito', 'serving_size': '30 g', 'serving_quantity': 30,
        'nutriments': {'carbohydrates_100g': 70, 'carbohydrates_serving': 21},
    })
    assert p['porcao'] == '30 g'
    assert p['carboidratos'] == 21


def test_deriva_da_porcao_quando_so_tem_100g_mas_tem_gramatura():
    p = off._processar_produto({
        'product_name': 'Biscoito', 'serving_size': '30 g', 'serving_quantity': 30,
        'nutriments': {'carbohydrates_100g': 60},
    })
    assert p['porcao'] == '30 g'
    assert p['carboidratos'] == 18.0


def test_produto_com_nome_e_sem_nenhum_nutriente_e_incompleto():
    p = off._processar_produto({'product_name': 'Biscoito Tal', 'nutriments': {}})
    assert p['_tem_dado'] is False
    assert p['_nome'] == 'Biscoito Tal'


def test_zero_explicito_conta_como_dado_agua_tem_carbo_zero():
    p = off._processar_produto({
        'product_name': 'Água', 'nutriments': {'carbohydrates_100g': 0, 'energy-kcal_100g': 0},
    })
    assert p['_tem_dado'] is True
    assert p['carboidratos'] == 0


def test_busca_codigo_devolve_parcial_quando_nao_ha_nutrientes(monkeypatch):
    class Resp:
        status_code = 200

        def json(self):
            return {'status': 1, 'product': {'product_name': 'Biscoito Tal', 'nutriments': {}}}

    monkeypatch.setattr(off.requests, 'get', lambda *a, **k: Resp())
    completo, parcial = off.buscar_por_codigo_detalhado(['7891234567895'])
    assert completo is None
    assert parcial['produto'] == 'Biscoito Tal'
