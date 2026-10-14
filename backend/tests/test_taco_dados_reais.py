"""
Confere o data/taco.csv de verdade (não o CSV de teste) contra valores da TACO 4ª ed.
(NEPA/Unicamp, 2011) conferidos manualmente. Se alguém regenerar o arquivo e quebrar
a conversão (coluna trocada, vírgula decimal), estes testes pegam antes do deploy.
"""
import pytest

from services import taco


@pytest.fixture(autouse=True)
def dados_reais(monkeypatch):
    monkeypatch.setattr(taco, '_alimentos', None)
    monkeypatch.setattr(taco, '_vocabulario', [])


def _achar(consulta, nome):
    return next(p for p in taco.buscar(consulta, limite=30) if p['nome'] == nome)


@pytest.mark.parametrize('consulta,nome,kcal,carbo', [
    ('arroz', 'Arroz, tipo 1, cozido', 128, 28.1),
    ('arroz integral', 'Arroz, integral, cozido', 124, 25.8),
    ('feijao carioca', 'Feijão, carioca, cozido', 76, 13.6),
    ('pao frances', 'Pão, trigo, francês', 300, 58.6),
    ('banana prata', 'Banana, prata, crua', 98, 26.0),
    ('batata inglesa cozida', 'Batata, inglesa, cozida', 52, 11.9),
    ('macarrao', 'Macarrão, trigo, cru', 371, 77.9),
])
def test_valores_batem_com_a_tabela_oficial(consulta, nome, kcal, carbo):
    p = _achar(consulta, nome)
    assert abs(p['calorias'] - kcal) <= 1
    assert abs(p['carboidratos'] - carbo) <= 0.2
    assert p['porcao'] == '100g'


def test_base_carregou_com_volume_esperado():
    assert taco.total() >= 550


def test_nenhum_alimento_tem_carboidrato_ou_energia_absurdos():
    taco._carregar()
    for a in taco._alimentos:
        assert 0 <= a['carboidratos'] <= 100, a['nome']
        assert 0 <= a['calorias'] <= 950, a['nome']


def test_pao_de_sal_e_arroz_cozido_aparecem_antes_do_cru():
    assert taco.buscar('pão de sal')[0]['nome'] == 'Pão, trigo, francês'
    nomes = [p['nome'] for p in taco.buscar('arroz', limite=30)]
    assert 'Arroz, tipo 1, cru' in nomes
    assert nomes.index('Arroz, tipo 1, cozido') < nomes.index('Arroz, tipo 1, cru')


def test_alimentos_fixados_no_topo_existem_na_tabela_e_aparecem_primeiro():
    taco._carregar()
    nomes = {a['nome'] for a in taco._alimentos}
    for consulta, nome in taco._PREFERIDOS.items():
        assert nome in nomes, f'{nome!r} (fixado para {consulta!r}) não existe em taco.csv'
        assert taco.buscar(consulta)[0]['nome'] == nome


def test_complementos_usda_estao_rotulados_e_com_valores_plausiveis():
    leite = _achar('leite', 'Leite, de vaca, integral (fluido)')
    assert 'USDA' in leite['fonte']
    assert 4.0 <= leite['carboidratos'] <= 5.5       # lactose ~4,7 g/100 mL
    massa = _achar('macarrão', 'Macarrão, trigo, cozido')
    assert 25 <= massa['carboidratos'] <= 35          # cozido; o cru tem ~77 g
    assert taco.buscar('leite')[0]['nome'] == 'Leite, de vaca, integral (fluido)'
    assert taco.buscar('macarrão')[0]['nome'] == 'Macarrão, trigo, cozido'


def test_itens_da_taco_continuam_com_rotulo_taco():
    assert 'TACO' in _achar('arroz', 'Arroz, tipo 1, cozido')['fonte']


def test_medidas_caseiras_so_para_alimentos_que_existem_na_tabela():
    import json
    taco._carregar()
    nomes = {a['nome'] for a in taco._alimentos}
    with open(taco.CAMINHO_MEDIDAS, encoding='utf-8') as f:
        medidas = json.load(f)
    assert medidas, 'medidas.json vazio'
    for nome, dados in medidas.items():
        assert nome in nomes, f'medidas para {nome!r}, que não existe em taco.csv'
        assert dados['fonte']
        for m in dados['medidas']:
            assert 1 <= m['g'] <= 600, (nome, m)   # nada de colher de 2 kg


def test_busca_traz_medidas_do_arroz_e_nada_pra_quem_nao_tem():
    arroz = _achar('arroz', 'Arroz, tipo 1, cozido')
    por_nome = {m['nome']: m['g'] for m in arroz['medidas']}
    assert por_nome['colher de servir'] == 45
    assert por_nome['colher de sopa'] == 25
    assert arroz['medidas_fonte'].startswith('IBGE/POF')
    assert _achar('bolo', 'Bolo, pronto, chocolate')['medidas'] == []
