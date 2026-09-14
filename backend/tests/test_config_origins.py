"""Testa o parse de ALLOWED_ORIGINS pra lista de origens do CORS."""
from config import parse_origins


def test_asterisco_fica_asterisco():
    assert parse_origins('*') == '*'


def test_uma_origem_vira_lista_de_um():
    assert parse_origins('https://glicoscan.vercel.app') == ['https://glicoscan.vercel.app']


def test_varias_origens_separadas_por_virgula():
    valor = 'https://a.com, https://b.com,https://c.com'
    assert parse_origins(valor) == ['https://a.com', 'https://b.com', 'https://c.com']


def test_espacos_e_virgulas_sobrando_sao_ignorados():
    assert parse_origins('https://a.com,, ,') == ['https://a.com']
