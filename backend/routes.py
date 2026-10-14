"""
routes.py — Rotas da API Flask
─────────────────────────────────────────────────────────────────────
Define todos os endpoints HTTP. A lógica pesada (parsing de OCR,
chamadas às APIs externas, acesso ao banco) fica delegada aos módulos
services/*, database.py e parsing.py — aqui só orquestra o fluxo de
cada rota e formata a resposta JSON.
"""
from concurrent.futures import ThreadPoolExecutor
import os
import re
import requests
from flask import Blueprint, request, jsonify, g

import busca
import database as db
import parsing
import config
from config import OCR_API_KEY, CALORIE_API_KEY, SUPABASE_URL, DOCTOR_PASSWORD
from extensions import limiter
from services import ocr, openfoodfacts, usda, fatsecret, supabase_auth, taco

bp = Blueprint('rotas', __name__)


@bp.before_request
def _exigir_login():
    """
    Toda rota (menos /health e /health/db, que o monitor de uptime do Render usa) exige
    o token de login do Supabase no header Authorization. O dono dos dados
    vem SEMPRE do token (g.user_id) — nunca de parâmetro mandado pelo
    cliente. Sem SUPABASE_URL configurado (dev local), roda aberto com um
    único usuário "local" — mas no Render (que define RENDER=true) isso
    NUNCA vale: variável esquecida ou com nome errado não pode abrir a API.
    """
    if request.method == 'OPTIONS' or request.path in ('/health', '/health/db'):
        return None
    if not SUPABASE_URL:
        if os.environ.get('RENDER'):
            return jsonify({'erro': 'Login não configurado no servidor'}), 503
        g.user_id = 'local'
        return None

    cabecalho = request.headers.get('Authorization', '')
    token = cabecalho[7:] if cabecalho.startswith('Bearer ') else ''
    g.user_id = supabase_auth.usuario_do_token(token) if token else None
    if not g.user_id:
        return jsonify({'erro': 'Não autorizado'}), 401


# ── OCR de foto da tabela nutricional ──────────────────────────────

@bp.route('/analisar', methods=['POST'])
@limiter.limit('10 per minute')  # OCR.space é a chamada mais cara/lenta da API
def analisar():
    try:
        data = request.get_json()
        imagem_b64 = data.get('imagem', '')
        if ',' in imagem_b64:
            imagem_b64 = imagem_b64.split(',')[1]
        if not imagem_b64:
            return jsonify({'erro': 'Imagem não enviada'}), 400

        linhas = ocr.extrair_texto(imagem_b64)
        if not linhas:
            return jsonify({'erro': 'Nenhum texto encontrado — tente foto mais nítida'}), 200

        return jsonify(parsing.parsear(linhas))
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'erro': str(e)}), 500


# ── Busca por nome (usada na tela de fallback manual) ──────────────

def _buscar_externo(nome):
    """FatSecret + Open Food Facts em paralelo, com cache de 24h por termo (normalizado)."""
    chave_cache = busca.normalizar(nome)
    cache = db.buscar_no_cache(chave_cache, validade_horas=24)
    if isinstance(cache, dict) and 'fs' in cache:   # (formato antigo era uma lista: ignora)
        print(f"🗃️ Cache hit: '{chave_cache}'")
        return cache['fs'], cache['off']

    with ThreadPoolExecutor(max_workers=2) as executor:
        f_fs = executor.submit(fatsecret.buscar_por_nome, nome)
        f_off = executor.submit(openfoodfacts.buscar_por_nome, nome)
        resultado_fs, resultado_off = f_fs.result(), f_off.result()

    print(f"🔍 '{nome}' → FatSecret:{len(resultado_fs)} OFF:{len(resultado_off)}")
    # Só cacheia se algo respondeu: uma falha de rede não pode virar "sem resultado" por 24h
    if resultado_fs or resultado_off:
        db.salvar_no_cache(chave_cache, {'fs': resultado_fs, 'off': resultado_off})
    return resultado_fs, resultado_off


def _buscar_alimentos(nome, user_id):
    """
    Ordem dos resultados: 1) produtos que a própria conta salvou, 2) tabela TACO
    (alimentos genéricos), 3) Open Food Facts e FatSecret intercalados — o
    brasileiro (OFF) abre cada rodada, já que a FatSecret é majoritariamente
    americana e antes enchia sozinha as 8 vagas.
    """
    meus = db.buscar_produtos_usuario(user_id, nome)
    for p in meus:
        p.update({'fonte': '⭐ Meus produtos', 'marca': '', 'base': 'porcao', 'imagem': ''})
    genericos = taco.buscar(nome)
    fs, off = _buscar_externo(nome)
    return meus + busca.mesclar(genericos, off, fs, limite=10 - len(meus))


@bp.route('/buscar')
@limiter.limit('30 per minute')
def buscar():
    nome = request.args.get('nome', '').strip()
    if not nome:
        return jsonify({'erro': 'Nome não informado'}), 400
    produtos = _buscar_alimentos(nome, g.user_id)
    if not produtos:
        return jsonify({'erro': 'Nenhum produto encontrado. Tente outro nome ou fotografe a tabela.'}), 200
    return jsonify({'produtos': produtos})


@bp.route('/barcode/fallback')
@limiter.limit('30 per minute')
def barcode_fallback():
    """Quando a busca por código de barras falha, permite buscar pelo nome do produto."""
    nome = request.args.get('nome', '').strip()
    if not nome:
        return jsonify({'produtos': []})
    return jsonify({'produtos': _buscar_alimentos(nome, g.user_id)})


# ── Meus produtos (valores que a própria conta confirmou) ──────────

CAMPOS_PRODUTO = ['carboidratos', 'acucares', 'fibras', 'proteinas', 'gorduras', 'calorias']


@bp.route('/meus-produtos', methods=['GET'])
def meus_produtos_listar():
    return jsonify({'produtos': db.listar_produtos_usuario(g.user_id)})


@bp.route('/meus-produtos', methods=['POST'])
@limiter.limit('30 per minute')
def meus_produtos_salvar():
    d = request.get_json(silent=True)
    if not isinstance(d, dict):
        return jsonify({'erro': 'Corpo da requisição inválido'}), 400
    if not str(d.get('nome') or d.get('produto') or '').strip():
        return jsonify({'erro': 'Nome do produto é obrigatório'}), 400
    for campo in CAMPOS_PRODUTO:
        try:
            v = float(d.get(campo) or 0)
        except (TypeError, ValueError):
            return jsonify({'erro': f'Campo "{campo}" precisa ser numérico'}), 400
        if not 0 <= v <= 1000:
            return jsonify({'erro': f'Campo "{campo}" fora do intervalo'}), 400
    if not any(float(d.get(c) or 0) for c in CAMPOS_PRODUTO):
        return jsonify({'erro': 'Informe ao menos um valor nutricional'}), 400

    novo_id = db.salvar_produto_usuario(d, g.user_id)
    if novo_id is None:
        return jsonify({'erro': f'Limite de {db.LIMITE_PRODUTOS_USUARIO} produtos salvos atingido'}), 409
    return jsonify({'ok': True, 'id': novo_id})


@bp.route('/meus-produtos/<int:id>', methods=['DELETE'])
def meus_produtos_remover(id):
    db.remover_produto_usuario(id, g.user_id)
    return jsonify({'ok': True})


# ── Busca por código de barras (fluxo principal do app) ────────────

def _tentar_calorie_api(code):
    """Fallback opcional — só roda se a chave CALORIE_API_KEY estiver configurada no .env."""
    if not CALORIE_API_KEY:
        return None
    try:
        r = requests.get(
            f'https://api.calorieapi.com/api/v1/search/barcode/{code}',
            headers={'X-API-Key': CALORIE_API_KEY}, timeout=8
        )
        if r.status_code != 200:
            return None

        data = r.json()
        food = data.get('food') or (data.get('foods') or [None])[0]
        if not food:
            return None

        sq = food.get('serving_size_g') or 100

        def valor(chave):
            v = food.get(chave) or food.get(f'{chave}_100g')
            if v is None:
                return 0
            try:
                v = float(v)
                return round(v * sq / 100 if food.get(f'{chave}_100g') else v, 1)
            except (TypeError, ValueError):
                return 0

        resultado = {
            'produto': (food.get('food_name') or food.get('name') or '')[:60],
            'porcao': f"{sq}g", 'unidade': '',
            'calorias': valor('calories') or valor('energy_kcal'),
            'carboidratos': valor('carbohydrates') or valor('carbs'),
            'acucares': valor('sugars'), 'fibras': valor('fiber'),
            'proteinas': valor('protein'), 'gorduras': valor('fat'),
            'imagem': food.get('image_url') or '', 'texto_bruto': '', 'aviso': '',
        }
        if resultado['carboidratos'] > 0 or resultado['calorias'] > 0:
            return resultado
    except Exception as e:
        print(f"⚠️ CalorieAPI: {e}")
    return None


@bp.route('/barcode')
@limiter.limit('20 per minute')
def barcode():
    """
    Busca produto por código de barras, em cascata:
      1) Open Food Facts (4 endpoints)
      2) CalorieAPI (opcional, se configurada)
      3) USDA (só match exato de código de barras)
      4) Cache local fresco (< 30 dias)
      5) Cache local antigo (último recurso, com aviso ao usuário)
    """
    try:
        code = request.args.get('code', '').strip()
        if not code:
            return jsonify({'erro': 'Código não informado'}), 400

        # UPC-A (12 dígitos), EAN-8, zeros à esquerda: formas equivalentes do mesmo GTIN
        candidatos = busca.variantes_codigo(code)
        if not candidatos:
            return jsonify({'erro': 'Código inválido'}), 400
        code = candidatos[0]

        print(f"🔍 Barcode: {code}")

        # 0) Produto que a própria conta já confirmou/corrigiu vence qualquer base externa
        meu = db.produto_usuario_por_codigo(g.user_id, candidatos)
        if meu:
            meu.update({'fonte': 'Meus produtos', 'aviso': 'Valores informados por você', 'texto_bruto': '', 'imagem': ''})
            print(f"⭐ Meus produtos: {meu['produto']}")
            return jsonify(meu)

        cache_fresco, cache_antigo = db.buscar_cache_barcode(code)

        # 1) Open Food Facts
        resultado, parcial = openfoodfacts.buscar_por_codigo_detalhado(candidatos)
        if resultado:
            db.salvar_no_cache(f'barcode:{code}', resultado)
            print(f"✅ OFF: {resultado['produto']} | Carbo:{resultado['carboidratos']}g")
            return jsonify(resultado)

        # 2) CalorieAPI (opcional)
        resultado = _tentar_calorie_api(code)
        if resultado:
            db.salvar_no_cache(f'barcode:{code}', resultado)
            print(f"✅ CalorieAPI: {resultado['produto']} | Carbo:{resultado['carboidratos']}g")
            return jsonify(resultado)

        # 3) USDA — match exato
        resultado = usda.buscar_por_codigo_exato(code)
        if resultado:
            db.salvar_no_cache(f'barcode:{code}', resultado)
            print(f"✅ USDA: {resultado['produto']} | Carbo:{resultado['carboidratos']}g")
            return jsonify(resultado)

        # 4) Cache fresco (as APIs falharam, mas já tínhamos achado esse produto antes)
        if cache_fresco:
            print(f"🗃️ APIs falharam — cache fresco: {cache_fresco.get('produto')}")
            return jsonify(cache_fresco)

        # 5) Cache antigo (último recurso, avisa o usuário pra conferir)
        if cache_antigo:
            print(f"🗃️ APIs falharam — cache antigo: {cache_antigo.get('produto')}")
            cache_antigo['aviso'] = '⚠️ Dados do cache — verifique os valores na embalagem'
            return jsonify(cache_antigo)

        # 6) A OFF conhece o produto, mas sem tabela nutricional: não é "não encontrado".
        #    Devolve o nome pra tela pedir a foto da tabela (ou a digitação dos valores).
        if parcial:
            print(f"🟡 OFF sem nutrientes: {parcial['produto']}")
            return jsonify({
                'incompleto': True, 'codigo': code, **parcial,
                'erro': 'Produto encontrado, mas sem dados nutricionais cadastrados.',
            }), 200

        return jsonify({'erro': 'Produto não encontrado em nenhuma base de dados. Tente novamente em instantes.',
                        'codigo': code}), 200

    except Exception as e:
        print(f"❌ Barcode: {e}")
        return jsonify({'erro': str(e)}), 500


# ── Histórico de cálculos ───────────────────────────────────────────

CAMPOS_HISTORICO_NUMERICOS = [
    'carboidratos', 'acucares', 'fibras', 'proteinas', 'gorduras', 'calorias',
    'carboTotal', 'porcoes', 'ric', 'dose', 'glicemiaAtual',
]


def _validar_historico(d):
    """Rejeita payload malformado antes de gravar no banco (produto obrigatório, numéricos precisam ser conversíveis)."""
    if not isinstance(d, dict):
        return 'Corpo da requisição inválido'
    if not str(d.get('produto', '')).strip():
        return 'Produto é obrigatório'
    for campo in CAMPOS_HISTORICO_NUMERICOS:
        valor = d.get(campo)
        if valor is not None:
            try:
                float(valor)
            except (TypeError, ValueError):
                return f'Campo "{campo}" precisa ser numérico'
    return None


@bp.route('/historico', methods=['GET'])
def get_historico():
    return jsonify(db.listar_historico(g.user_id))


@bp.route('/historico', methods=['POST'])
def post_historico():
    dados = request.get_json(silent=True)
    erro = _validar_historico(dados)
    if erro:
        return jsonify({'erro': erro}), 400
    novo_id = db.adicionar_historico(dados, g.user_id)
    return jsonify({'ok': True, 'id': novo_id})


@bp.route('/historico/<int:id>', methods=['DELETE'])
def delete_historico_item(id):
    db.remover_historico(id, g.user_id)
    return jsonify({'ok': True})


@bp.route('/historico', methods=['DELETE'])
def delete_historico_tudo():
    db.limpar_historico(g.user_id)
    return jsonify({'ok': True})


@bp.route('/stats')
def stats():
    return jsonify(db.obter_estatisticas(g.user_id))


# ── Trava médica (RIC/insulina/glicemia alvo/FS só editável com senha) ──

@bp.route('/medico/verificar', methods=['POST'])
@limiter.limit('5 per minute')  # poucas tentativas — é senha compartilhada entre médicos
def verificar_senha_medico():
    if not DOCTOR_PASSWORD:
        return jsonify({'erro': 'Trava do médico não configurada neste servidor'}), 400
    dados = request.get_json(silent=True) or {}
    if dados.get('senha') != DOCTOR_PASSWORD:
        return jsonify({'erro': 'Senha incorreta'}), 401
    return jsonify({'ok': True})


# ── Utilitárias ──────────────────────────────────────────────────

@bp.route('/health')
@limiter.exempt  # monitor de uptime do Render bate aqui com frequência
def health():
    return jsonify({
        'status': 'ok',
        'ocr': 'OK' if OCR_API_KEY != 'SUA_CHAVE_AQUI' else 'sem chave',
        'fatsecret': 'configurado',
        'off': 'v2',
        'cache': 'Postgres' if config.DATABASE_URL else 'SQLite',
        # Frontend usa isso pra saber se deve mostrar o cadeado da config
        # clínica — sem DOCTOR_PASSWORD configurada, fica sempre editável.
        'trava_medica': bool(DOCTOR_PASSWORD),
    })


@bp.route('/health/db')
@limiter.exempt  # chamado por cron (GitHub Actions) pra manter o Supabase ativo
def health_db():
    ok = db.ping()
    return jsonify({'db': 'ok' if ok else 'erro'}), (200 if ok else 503)


@bp.route('/limpar-cache')
def limpar_cache():
    db.limpar_cache()
    return jsonify({'ok': True, 'msg': 'Cache limpo!'})
