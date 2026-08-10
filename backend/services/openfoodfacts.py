"""
services/openfoodfacts.py — Integração com a Open Food Facts
─────────────────────────────────────────────────────────────────────
Base de dados nutricional colaborativa (tipo "Wikipedia dos alimentos"),
com bom volume de produtos brasileiros. É a PRIMEIRA fonte tentada na
busca por código de barras, por ter melhor cobertura local que as
alternativas pagas/limitadas.

Duas funções:
  buscar_por_nome()     → busca textual (usada na tela de fallback manual)
  buscar_por_codigo()   → busca exata por código de barras, tentando 4
                           endpoints em cascata (a API da OFF é instável
                           e às vezes um espelho responde quando outro não)
"""
import requests
from config import OFF_SEARCH_URL, OFF_BARCODE_ENDPOINTS

USER_AGENT = {'User-Agent': 'GlicoScan/3.0 TCC ADS'}


def _extrair_unidade(serving_size_txt):
    """
    Extrai a parte 'legível' do campo serving_size da OFF.
    Ex: "3 biscoitos (30g)" → "3 biscoitos" | "30g" → "" (sem unidade descritiva)
    """
    import re
    if not serving_size_txt:
        return ''

    txt = serving_size_txt.strip().lower()
    UNIDADES = [
        'biscoito', 'bolacha', 'cookie', 'barra', 'fatia', 'copo', 'xícara', 'xicara',
        'colher', 'lata', 'garrafa', 'sachê', 'sache', 'tablete', 'unidade', 'unid',
        'pacote', 'porção', 'porcao', 'pedaço', 'pedaco', 'pão', 'pao', 'wafer',
        'cream', 'cracker', 'chip', 'gummy', 'comprimido', 'cápsula', 'capsula',
        'dose', 'envelope', 'bisnaguinha', 'mini', 'stick', 'nugget', 'almôndega',
    ]
    for u in UNIDADES:
        m = re.search(rf'(\d+[,.]?\d*\s*{u}\w*)', txt)
        if m:
            unidade = m.group(1).strip()
            return unidade[0].upper() + unidade[1:]

    m = re.match(r'^(\d+[,.]?\d*\s+[a-záéíóúâêôãõç]+\w*)\s*[\(\[]', txt)
    if m:
        unidade = m.group(1).strip()
        return unidade[0].upper() + unidade[1:]
    return ''


def _inferir_unidade_por_categoria(categorias, serving_qty):
    """
    Quando a OFF não dá texto descritivo de porção, estima a unidade
    pela categoria do produto + peso da porção.
    Ex: categoria=biscoitos, 30g → "~3 biscoitos"
    """
    if not serving_qty or serving_qty <= 0:
        return ''

    MAPA = [
        (['biscuit', 'biscoito', 'cookie', 'cracker', 'bolacha'], 10, 'biscoito', 'biscoitos'),
        (['wafer'], 7, 'wafer', 'wafers'),
        (['chocolate-bar', 'barra-de-chocolate', 'barra'], 25, 'barra', 'barras'),
        (['cereal-bar', 'barra-de-cereal'], 25, 'barra', 'barras'),
        (['bread', 'pao', 'pão', 'toast', 'torrada'], 25, 'fatia', 'fatias'),
        (['gummy', 'goma', 'bala'], 3, 'unidade', 'unidades'),
        (['nugget'], 15, 'nugget', 'nuggets'),
        (['chip', 'salgadinho', 'snack'], 2, 'unidade', 'unidades'),
        (['tablet', 'comprimido', 'capsule', 'capsula'], 1, 'comprimido', 'comprimidos'),
    ]
    cats = ' '.join(categorias).lower() if categorias else ''
    for palavras_chave, peso_medio, singular, plural in MAPA:
        if any(k in cats for k in palavras_chave):
            qtd = max(1, round(serving_qty / peso_medio))
            return f'~{qtd} {singular if qtd == 1 else plural}'
    return ''


def _processar_produto(p):
    """Converte o JSON bruto da OFF no formato interno padronizado do GlicoScan."""
    nutrientes = p.get('nutriments', {})
    try:
        serving_qty = float(p.get('serving_quantity') or 0)
    except (TypeError, ValueError):
        serving_qty = 0

    def valor_nutriente(chave):
        v = nutrientes.get(f'{chave}_serving')
        if v not in (None, '', 0):
            try: return round(float(v), 1)
            except (TypeError, ValueError): pass
        v100 = nutrientes.get(f'{chave}_100g')
        if v100 not in (None, '', 0) and serving_qty > 0:
            try: return round(float(v100) * serving_qty / 100, 1)
            except (TypeError, ValueError): pass
        if v100 not in (None, '', 0):
            try: return round(float(v100), 1)
            except (TypeError, ValueError): pass
        return 0

    nome = p.get('product_name_pt') or p.get('product_name') or p.get('brands') or ''
    serving_txt = p.get('serving_size') or ''
    porcao = serving_txt or (f'{serving_qty}g' if serving_qty else '—')
    categorias = p.get('categories_tags', [])
    unidade = _extrair_unidade(serving_txt) or _inferir_unidade_por_categoria(categorias, serving_qty)

    # Tamanho total da embalagem (diferente da porção — ex: pacote de 400g com porção de 30g)
    qty_total = p.get('product_quantity') or p.get('quantity') or ''
    qty_unit = p.get('product_quantity_unit') or ''
    embalagem = ''
    if qty_total:
        try:
            qt = float(str(qty_total).replace(',', '.').strip())
            qu = str(qty_unit).strip() or ('ml' if 'ml' in str(serving_txt).lower() else 'g')
            embalagem = f'{int(qt) if qt == int(qt) else qt}{qu}'
        except (TypeError, ValueError):
            embalagem = str(qty_total)

    carbo = valor_nutriente('carbohydrates')
    cal = valor_nutriente('energy-kcal')
    prot = valor_nutriente('proteins')
    gord = valor_nutriente('fat')

    return {
        'produto': nome[:60],
        'porcao': porcao,
        'unidade': unidade,
        'calorias': cal,
        'carboidratos': carbo,
        'acucares': valor_nutriente('sugars'),
        'fibras': valor_nutriente('fiber'),
        'proteinas': prot,
        'gorduras': gord,
        'imagem': p.get('image_small_url', ''),
        'texto_bruto': '',
        'aviso': '',
        'embalagem': embalagem,
        # Campos internos (não expostos na resposta final) usados
        # só pra validar se o produto tem dados suficientes
        '_carbo': carbo, '_cal': cal, '_prot': prot, '_gord': gord,
        '_sq': serving_qty, '_nome': nome,
    }


def _dados_validos(r):
    """Considera inválido um produto sem nenhum dado nutricional nem nome — provavelmente cadastro incompleto na OFF."""
    return not (r['_carbo'] == 0 and r['_cal'] == 0 and r['_prot'] == 0 and r['_gord'] == 0 and r['_sq'] == 0 and not r['_nome'])


def _limpar_campos_internos(r):
    return {k: v for k, v in r.items() if not k.startswith('_')}


def buscar_por_codigo(code):
    """
    Tenta os 4 endpoints da OFF em cascata (dois domínios × duas versões
    de API), retornando assim que um responder com dados válidos.
    Retorna None se nenhum encontrar o produto.
    """
    for template_url in OFF_BARCODE_ENDPOINTS:
        url = template_url.format(code=code)
        try:
            r = requests.get(url, headers=USER_AGENT, timeout=8)
            if r.status_code != 200:
                continue
            data = r.json()
            if data.get('status') != 1:
                continue

            resultado = _processar_produto(data.get('product', {}))
            if _dados_validos(resultado):
                return _limpar_campos_internos(resultado)
        except Exception as e:
            print(f"⚠️ OFF ({url.split('/')[2]}): {e}")
            continue
    return None


def buscar_por_nome(nome):
    """Busca textual na OFF (usada na tela de busca manual, quando o código de barras não é encontrado)."""
    try:
        r = requests.get(OFF_SEARCH_URL, params={
            'search_terms': nome,
            'search_simple': 1,
            'action': 'process',
            'json': 1,
            'page_size': 12,
            'fields': 'product_name,brands,nutriments,serving_size,image_small_url,countries_tags,lang',
            'countries_tags': 'en:brazil',
        }, headers=USER_AGENT, timeout=12)
        if r.status_code != 200:
            return []

        produtos = []
        for p in r.json().get('products', []):
            nutrientes = p.get('nutriments', {})
            nome_prod = p.get('product_name', '') or p.get('brands', '')
            if not nome_prod:
                continue

            paises = p.get('countries_tags', [])
            if paises and not any('brazil' in pa or 'brasil' in pa for pa in paises):
                continue

            def valor(chave):
                v = nutrientes.get(f'{chave}_serving') or nutrientes.get(f'{chave}_100g') or 0
                try: return round(float(v), 1)
                except (TypeError, ValueError): return 0

            produtos.append({
                'nome': nome_prod[:60],
                'marca': p.get('brands', ''),
                'fonte': '🌍 Open Food Facts',
                'porcao': p.get('serving_size', '—'),
                'calorias': valor('energy-kcal'),
                'carboidratos': valor('carbohydrates'),
                'acucares': valor('sugars'),
                'fibras': valor('fiber'),
                'proteinas': valor('proteins'),
                'gorduras': valor('fat'),
                'imagem': p.get('image_small_url', ''),
            })
        return produtos
    except Exception as e:
        print(f"OFF (busca por nome): {e}")
        return []
