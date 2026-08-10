"""
services/usda.py — Integração com a USDA FoodData Central
─────────────────────────────────────────────────────────────────────
Base de dados do governo americano. Usada como SEGUNDO fallback (depois
da Open Food Facts), só com produtos importados/internacionais.

IMPORTANTE — decisão de projeto: aqui só aceitamos MATCH EXATO do
código de barras (campo gtinUpc), nunca por similaridade de nome.
Isso foi definido depois de um caso real de teste em que uma busca por
similaridade trouxe "Gatorade Uva Zero" como resultado errado pra um
código de barras de outro produto — dado nutricional errado é
inaceitável num app de cálculo de insulina.
"""
import requests

USDA_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search'


def buscar_por_codigo_exato(code):
    """Busca na USDA e só aceita o resultado se o gtinUpc bater exatamente com o código escaneado."""
    try:
        r = requests.get(USDA_SEARCH_URL, params={
            'query': code,
            'api_key': 'DEMO_KEY',
            'pageSize': 8,
            'dataType': 'Branded',
        }, timeout=8)
        if r.status_code != 200:
            return None

        foods = r.json().get('foods', [])
        code_sem_zeros = code.lstrip('0')

        match = next(
            (f for f in foods if str(f.get('gtinUpc', '')).lstrip('0') in (code, code_sem_zeros)),
            None
        )
        if not match:
            return None

        nutrientes = {n['nutrientName']: n['value'] for n in match.get('foodNutrients', [])}

        def valor(chaves_possiveis):
            for chave in chaves_possiveis:
                for nome_nutriente, v in nutrientes.items():
                    if chave.lower() in nome_nutriente.lower():
                        try: return round(float(v), 1)
                        except (TypeError, ValueError): pass
            return 0

        porcao_qtd = match.get('servingSize', 0) or 0
        return {
            'produto': match.get('description', '')[:60],
            'porcao': f"{porcao_qtd}{match.get('servingSizeUnit', 'g')}" if porcao_qtd else '—',
            'unidade': '', 'texto_bruto': '', 'imagem': '', 'aviso': '',
            'calorias': valor(['Energy', 'Calories']),
            'carboidratos': valor(['Carbohydrate']),
            'acucares': valor(['Sugars, total']),
            'fibras': valor(['Fiber']),
            'proteinas': valor(['Protein']),
            'gorduras': valor(['Total lipid', 'fat']),
        }
    except Exception as e:
        print(f"⚠️ USDA: {e}")
        return None
