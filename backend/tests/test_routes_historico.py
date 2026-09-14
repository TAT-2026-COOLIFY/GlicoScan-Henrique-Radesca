"""Testa a validação do payload de POST /historico (routes.py)."""
from routes import _validar_historico


def test_payload_valido_passa():
    d = {'produto': 'Bolacha', 'carboidratos': 20, 'dose': 1.5, 'ric': 15}
    assert _validar_historico(d) is None


def test_sem_produto_e_invalido():
    assert _validar_historico({'carboidratos': 20}) == 'Produto é obrigatório'
    assert _validar_historico({'produto': '   '}) == 'Produto é obrigatório'


def test_corpo_nao_e_dict_e_invalido():
    assert _validar_historico(None) == 'Corpo da requisição inválido'
    assert _validar_historico([1, 2, 3]) == 'Corpo da requisição inválido'


def test_campo_numerico_invalido_e_rejeitado():
    d = {'produto': 'Bolacha', 'carboidratos': 'muito'}
    assert _validar_historico(d) == 'Campo "carboidratos" precisa ser numérico'


def test_campo_numerico_ausente_ou_none_e_permitido():
    d = {'produto': 'Bolacha', 'carboidratos': None}
    assert _validar_historico(d) is None
