"""
Rotas de busca: código de barras (variantes, produto sem nutrientes, "meus
produtos"), busca por nome (ordem dos resultados) e CRUD de produtos da conta.
Rede (OFF/USDA/FatSecret) é substituída por funções falsas.
"""
import pytest
from flask import Flask

import database as db
import routes
from services import fatsecret, openfoodfacts, supabase_auth, taco, usda

TOKENS = {'token-ana': 'ana', 'token-bruno': 'bruno'}


@pytest.fixture
def cliente(tmp_path, monkeypatch):
    monkeypatch.setattr(db, 'DB_PATH', str(tmp_path / 'teste.db'))
    db.init_db()
    monkeypatch.setattr(routes, 'SUPABASE_URL', 'https://exemplo.supabase.co')
    monkeypatch.setattr(supabase_auth, 'usuario_do_token', TOKENS.get)
    # nenhuma rede por padrão
    monkeypatch.setattr(openfoodfacts, 'buscar_por_codigo_detalhado', lambda codigos: (None, None))
    monkeypatch.setattr(usda, 'buscar_por_codigo_exato', lambda code: None)
    monkeypatch.setattr(routes, '_tentar_calorie_api', lambda code: None)
    monkeypatch.setattr(openfoodfacts, 'buscar_por_nome', lambda nome: [])
    monkeypatch.setattr(fatsecret, 'buscar_por_nome', lambda nome: [])
    monkeypatch.setattr(taco, 'buscar', lambda nome, limite=6: [])
    app = Flask(__name__)
    app.register_blueprint(routes.bp)
    return app.test_client()


def _como(token='token-ana'):
    return {'Authorization': f'Bearer {token}'}


def _produto(nome='Bolacha Maria', **extra):
    return {'produto': nome, 'porcao': '30g', 'unidade': '', 'embalagem': '', 'imagem': '',
            'calorias': 120, 'carboidratos': 22, 'acucares': 6, 'fibras': 1,
            'proteinas': 2, 'gorduras': 3, 'texto_bruto': '', 'aviso': '', **extra}


# ── código de barras ─────────────────────────────────────────────

def test_upc_a_de_12_digitos_tenta_o_ean13_primeiro(cliente, monkeypatch):
    recebidos = []

    def falso(codigos):
        recebidos.append(codigos)
        return _produto(), None

    monkeypatch.setattr(openfoodfacts, 'buscar_por_codigo_detalhado', falso)
    r = cliente.get('/barcode?code=012345678905', headers=_como())
    assert r.get_json()['produto'] == 'Bolacha Maria'
    assert recebidos[0] == ['0012345678905', '012345678905']


def test_codigo_curto_e_rejeitado(cliente):
    r = cliente.get('/barcode?code=12345', headers=_como())
    assert r.status_code == 400


def test_produto_sem_nutrientes_pede_foto_em_vez_de_nao_encontrado(cliente, monkeypatch):
    parcial = {'produto': 'Biscoito Tal', 'imagem': 'http://img', 'embalagem': '140g'}
    monkeypatch.setattr(openfoodfacts, 'buscar_por_codigo_detalhado', lambda c: (None, parcial))
    d = cliente.get('/barcode?code=7891234567895', headers=_como()).get_json()
    assert d['incompleto'] is True
    assert d['produto'] == 'Biscoito Tal'
    assert d['codigo'] == '7891234567895'
    assert d['erro']  # o frontend ainda trata como "sem dados"


def test_nada_encontrado_continua_sendo_erro_simples(cliente):
    d = cliente.get('/barcode?code=7891234567895', headers=_como()).get_json()
    assert 'erro' in d and not d.get('incompleto')


def test_produto_salvo_pela_conta_vence_a_base_externa(cliente, monkeypatch):
    chamou = []
    monkeypatch.setattr(openfoodfacts, 'buscar_por_codigo_detalhado',
                        lambda c: chamou.append(c) or (_produto('Errado da OFF', carboidratos=99), None))
    cliente.post('/meus-produtos', headers=_como(), json={
        'codigo': '7891234567895', 'nome': 'Bolacha da Ana', 'porcao': '30g', 'carboidratos': 18})

    d = cliente.get('/barcode?code=7891234567895', headers=_como()).get_json()
    assert d['produto'] == 'Bolacha da Ana'
    assert d['carboidratos'] == 18
    assert d['fonte'] == 'Meus produtos'
    assert chamou == []  # nem foi na rede


def test_produto_salvo_nao_vaza_pra_outra_conta(cliente, monkeypatch):
    cliente.post('/meus-produtos', headers=_como('token-ana'), json={
        'codigo': '7891234567895', 'nome': 'Bolacha da Ana', 'carboidratos': 18})
    monkeypatch.setattr(openfoodfacts, 'buscar_por_codigo_detalhado', lambda c: (_produto('Da OFF'), None))
    d = cliente.get('/barcode?code=7891234567895', headers=_como('token-bruno')).get_json()
    assert d['produto'] == 'Da OFF'


# ── meus produtos ────────────────────────────────────────────────

def test_salvar_de_novo_com_mesmo_codigo_atualiza(cliente):
    h = _como()
    a = cliente.post('/meus-produtos', headers=h, json={'codigo': '7891234567895', 'nome': 'X', 'carboidratos': 10})
    b = cliente.post('/meus-produtos', headers=h, json={'codigo': '7891234567895', 'nome': 'X', 'carboidratos': 12})
    assert a.get_json()['id'] == b.get_json()['id']
    lista = cliente.get('/meus-produtos', headers=h).get_json()['produtos']
    assert len(lista) == 1 and lista[0]['carboidratos'] == 12


def test_salvar_valida_entrada(cliente):
    h = _como()
    assert cliente.post('/meus-produtos', headers=h, json={'nome': '', 'carboidratos': 5}).status_code == 400
    assert cliente.post('/meus-produtos', headers=h, json={'nome': 'X', 'carboidratos': 'abc'}).status_code == 400
    assert cliente.post('/meus-produtos', headers=h, json={'nome': 'X', 'carboidratos': -3}).status_code == 400
    assert cliente.post('/meus-produtos', headers=h, json={'nome': 'X', 'carboidratos': 5000}).status_code == 400
    assert cliente.post('/meus-produtos', headers=h, json={'nome': 'X'}).status_code == 400


def test_so_o_dono_remove(cliente):
    novo = cliente.post('/meus-produtos', headers=_como('token-ana'),
                        json={'nome': 'X', 'carboidratos': 5}).get_json()['id']
    cliente.delete(f'/meus-produtos/{novo}', headers=_como('token-bruno'))
    assert len(cliente.get('/meus-produtos', headers=_como('token-ana')).get_json()['produtos']) == 1
    cliente.delete(f'/meus-produtos/{novo}', headers=_como('token-ana'))
    assert cliente.get('/meus-produtos', headers=_como('token-ana')).get_json()['produtos'] == []


# ── busca por nome ───────────────────────────────────────────────

def test_resultados_brasileiros_nao_sao_engolidos_pela_fatsecret(cliente, monkeypatch):
    fs = [{'nome': f'Rice variant {i}', 'carboidratos': 1} for i in range(8)]
    off = [{'nome': 'Arroz Tio João', 'carboidratos': 2}]
    monkeypatch.setattr(fatsecret, 'buscar_por_nome', lambda n: fs)
    monkeypatch.setattr(openfoodfacts, 'buscar_por_nome', lambda n: off)
    nomes = [p['nome'] for p in cliente.get('/buscar?nome=arroz', headers=_como()).get_json()['produtos']]
    assert 'Arroz Tio João' in nomes


def test_ordem_meus_produtos_depois_taco_depois_externos(cliente, monkeypatch):
    cliente.post('/meus-produtos', headers=_como(), json={'nome': 'Arroz da vovó', 'carboidratos': 30})
    monkeypatch.setattr(taco, 'buscar', lambda n, limite=6: [{'nome': 'Arroz, tipo 1, cozido', 'carboidratos': 28}])
    monkeypatch.setattr(openfoodfacts, 'buscar_por_nome', lambda n: [{'nome': 'Arroz Camil', 'carboidratos': 77}])
    nomes = [p['nome'] for p in cliente.get('/buscar?nome=arroz', headers=_como()).get_json()['produtos']]
    assert nomes == ['Arroz da vovó', 'Arroz, tipo 1, cozido', 'Arroz Camil']


def test_falha_de_rede_nao_vira_cache_de_sem_resultado(cliente, monkeypatch):
    r1 = cliente.get('/buscar?nome=queijo', headers=_como()).get_json()
    assert 'erro' in r1
    monkeypatch.setattr(openfoodfacts, 'buscar_por_nome', lambda n: [{'nome': 'Queijo Minas', 'carboidratos': 1}])
    r2 = cliente.get('/buscar?nome=queijo', headers=_como()).get_json()
    assert r2['produtos'][0]['nome'] == 'Queijo Minas'
