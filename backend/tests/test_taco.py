"""Busca de alimentos genéricos na tabela TACO (services/taco.py), com um CSV pequeno de teste."""
import pytest

from services import taco

CSV = """nome,categoria,energia_kcal,proteina_g,lipidios_g,carboidrato_g,fibra_g,acucar_g
"Arroz, tipo 1, cozido",Cereais,128,2.5,0.2,28.1,1.6,
"Arroz, integral, cozido",Cereais,124,2.6,1.0,25.8,2.7,
"Arroz, integral, cru",Cereais,360,7.3,1.9,77.5,4.8,
"Feijão, carioca, cozido",Leguminosas,76,4.8,0.5,13.6,8.5,
"Pão, francês",Panificados,300,8.0,3.1,58.6,2.3,
"Mandioca, cozida",Raízes,125,0.6,0.3,30.1,1.6,
"Banana, prata, crua",Frutas,98,1.3,0.1,26.0,2.0,
"""


@pytest.fixture(autouse=True)
def csv_de_teste(tmp_path, monkeypatch):
    arq = tmp_path / 'taco.csv'
    arq.write_text(CSV, encoding='utf-8')
    monkeypatch.setattr(taco, 'CAMINHO_CSV', str(arq))
    monkeypatch.setattr(taco, '_alimentos', None)
    monkeypatch.setattr(taco, '_vocabulario', [])


def test_acha_por_nome_simples_e_traz_base_100g():
    r = taco.buscar('arroz')
    achado = next(p for p in r if p['nome'] == 'Arroz, tipo 1, cozido')
    assert achado['carboidratos'] == 28.1
    assert achado['porcao'] == '100g' and achado['base'] == '100g'


def test_preparado_vem_antes_do_cru():
    nomes = [p['nome'] for p in taco.buscar('arroz')]
    assert nomes.index('Arroz, integral, cozido') < nomes.index('Arroz, integral, cru')
    assert nomes[-1] == 'Arroz, integral, cru'


def test_ignora_acento_e_plural():
    assert taco.buscar('feijões')[0]['nome'] == 'Feijão, carioca, cozido'
    assert taco.buscar('PAO')[0]['nome'] == 'Pão, francês'


def test_sinonimo_pao_de_sal_vira_pao_frances():
    assert taco.buscar('pão de sal')[0]['nome'] == 'Pão, francês'
    assert taco.buscar('aipim')[0]['nome'] == 'Mandioca, cozida'


def test_todas_as_palavras_precisam_casar():
    assert [p['nome'] for p in taco.buscar('arroz integral')] == ['Arroz, integral, cozido', 'Arroz, integral, cru']
    assert taco.buscar('arroz pizza') == []


def test_corrige_erro_de_digitacao():
    assert taco.buscar('arros')[0]['nome'].startswith('Arroz')
    assert taco.buscar('bananna')[0]['nome'] == 'Banana, prata, crua'


def test_busca_vazia_ou_arquivo_ausente_nao_quebra(monkeypatch):
    assert taco.buscar('   ') == []
    monkeypatch.setattr(taco, 'CAMINHO_CSV', '/nao/existe.csv')
    monkeypatch.setattr(taco, '_alimentos', None)
    assert taco.buscar('arroz') == []
