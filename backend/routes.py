"""
routes.py — Rotas da API Flask
─────────────────────────────────────────────────────────────────────
Define todos os endpoints HTTP. A lógica pesada (parsing de OCR,
chamadas às APIs externas, acesso ao banco) fica delegada aos módulos
services/*, database.py e parsing.py — aqui só orquestra o fluxo de
cada rota e formata a resposta JSON.
"""
from concurrent.futures import ThreadPoolExecutor
import re
import requests
from flask import Blueprint, request, jsonify

import database as db
import parsing
from config import OCR_API_KEY, CALORIE_API_KEY, APP_TOKEN
from extensions import limiter
from services import ocr, openfoodfacts, usda, fatsecret

bp = Blueprint('rotas', __name__)


@bp.before_request
def _checar_app_token():
    """
    Trava simples por token compartilhado (header X-App-Token). Sem
    APP_TOKEN configurado no .env, fica desativada (uso local). /health
    fica sempre aberta pro monitor de uptime do Render não precisar do token.
    """
    if not APP_TOKEN or request.method == 'OPTIONS' or request.path == '/health':
        return None
    if request.headers.get('X-App-Token') != APP_TOKEN:
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

def _buscar_com_cache(nome):
    """Busca em paralelo na FatSecret + Open Food Facts, com cache de 24h por termo de busca."""
    chave_cache = nome.lower().strip()
    cache = db.buscar_no_cache(chave_cache, validade_horas=24)
    if cache is not None:
        print(f"🗃️ Cache hit: '{chave_cache}'")
        return cache

    with ThreadPoolExecutor(max_workers=2) as executor:
        f_fs = executor.submit(fatsecret.buscar_por_nome, nome)
        f_off = executor.submit(openfoodfacts.buscar_por_nome, nome)
        resultado_fs, resultado_off = f_fs.result(), f_off.result()

    todos = resultado_fs + resultado_off

    # Deduplica por nome (evita mostrar o mesmo produto vindo das duas fontes)
    vistos, unicos = set(), []
    for p in todos:
        chave = p['nome'].lower()[:20]
        if chave not in vistos:
            vistos.add(chave)
            unicos.append(p)

    print(f"🔍 '{nome}' → FatSecret:{len(resultado_fs)} OFF:{len(resultado_off)}")

    if unicos:
        db.salvar_no_cache(chave_cache, unicos)

    return unicos


@bp.route('/buscar')
@limiter.limit('15 per minute')
def buscar():
    nome = request.args.get('nome', '').strip()
    if not nome:
        return jsonify({'erro': 'Nome não informado'}), 400
    produtos = _buscar_com_cache(nome)
    if not produtos:
        return jsonify({'erro': 'Nenhum produto encontrado. Tente outro nome ou escaneie a tabela.'}), 200
    return jsonify({'produtos': produtos[:8]})


@bp.route('/barcode/fallback')
@limiter.limit('15 per minute')
def barcode_fallback():
    """Quando a busca por código de barras falha, permite buscar pelo nome do produto."""
    nome = request.args.get('nome', '').strip()
    if not nome:
        return jsonify({'produtos': []})
    produtos = _buscar_com_cache(nome)
    return jsonify({'produtos': produtos[:5]})


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

        code = re.sub(r'[^0-9]', '', code)
        if len(code) < 8:
            return jsonify({'erro': 'Código inválido'}), 400

        print(f"🔍 Barcode: {code}")
        cache_fresco, cache_antigo = db.buscar_cache_barcode(code)

        # 1) Open Food Facts
        resultado = openfoodfacts.buscar_por_codigo(code)
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

        return jsonify({'erro': 'Produto não encontrado em nenhuma base de dados. Tente novamente em instantes.'}), 200

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
    return jsonify(db.listar_historico(perfil=request.args.get('perfil')))


@bp.route('/historico', methods=['POST'])
def post_historico():
    dados = request.get_json(silent=True)
    erro = _validar_historico(dados)
    if erro:
        return jsonify({'erro': erro}), 400
    db.adicionar_historico(dados)
    return jsonify({'ok': True})


@bp.route('/historico/<int:id>', methods=['DELETE'])
def delete_historico_item(id):
    db.remover_historico(id)
    return jsonify({'ok': True})


@bp.route('/historico', methods=['DELETE'])
def delete_historico_tudo():
    db.limpar_historico(perfil=request.args.get('perfil'))
    return jsonify({'ok': True})


@bp.route('/stats')
def stats():
    return jsonify(db.obter_estatisticas(perfil=request.args.get('perfil')))


# ── Utilitárias ──────────────────────────────────────────────────

@bp.route('/health')
@limiter.exempt  # monitor de uptime do Render bate aqui com frequência
def health():
    return jsonify({
        'status': 'ok',
        'ocr': 'OK' if OCR_API_KEY != 'SUA_CHAVE_AQUI' else 'sem chave',
        'fatsecret': 'configurado',
        'off': 'v2',
        'cache': 'SQLite',
    })


@bp.route('/limpar-cache')
def limpar_cache():
    conn = db.get_connection()
    conn.execute('DELETE FROM cache_busca')
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'msg': 'Cache limpo!'})
