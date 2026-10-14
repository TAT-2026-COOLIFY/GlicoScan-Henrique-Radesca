"""Normalização de texto, variantes de código de barras e mescla de resultados (busca.py)."""
import busca


def test_normalizar_tira_acento_pontuacao_e_aplica_sinonimo():
    assert busca.normalizar('  Pão de Sal!! ') == 'pao frances'
    assert busca.normalizar('AIPIM') == 'mandioca'


def test_tokens_removem_artigos_e_plural():
    assert busca.tokens('Pães de queijo') == ['pao', 'queijo']
    assert busca.tokens('feijões com arroz') == ['feijao', 'arroz']
    assert busca.tokens('laranjas') == ['laranja']
    assert busca.tokens('') == []


def test_variantes_upc_a_ganha_zero_a_esquerda():
    assert busca.variantes_codigo('012345678905') == ['0012345678905', '012345678905']


def test_variantes_ean13_com_zero_tenta_tambem_sem_ele():
    assert busca.variantes_codigo('0789123456789') == ['0789123456789', '789123456789']


def test_variantes_ean13_comum_fica_so_ele():
    assert busca.variantes_codigo('7891000100103') == ['7891000100103']


def test_variantes_ignora_letras_e_rejeita_tamanho_invalido():
    assert busca.variantes_codigo('789-1000-100103') == ['7891000100103']
    assert busca.variantes_codigo('1234567') == []
    assert busca.variantes_codigo('') == []
    assert busca.variantes_codigo('1' * 15) == []


def test_mesclar_intercala_e_nao_deixa_uma_fonte_engolir_a_outra():
    fs = [{'nome': f'Rice {i}'} for i in range(8)]
    off = [{'nome': 'Arroz Tio João'}, {'nome': 'Arroz Camil'}]
    nomes = [p['nome'] for p in busca.mesclar([], off, fs, limite=5)]
    assert 'Arroz Tio João' in nomes and 'Arroz Camil' in nomes
    assert len(nomes) == 5


def test_mesclar_remove_duplicados_entre_fontes():
    a = [{'nome': 'Arroz branco cozido'}]
    b = [{'nome': 'ARROZ  Branco, cozido'}]
    assert len(busca.mesclar(a, b)) == 1
