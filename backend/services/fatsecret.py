"""
services/fatsecret.py — Integração com a FatSecret Platform API
─────────────────────────────────────────────────────────────────────
Base de dados nutricional complementar, usada na busca por NOME
(não por código de barras). Requer autenticação OAuth2
client_credentials — o token é cacheado em memória até expirar,
evitando pedir um token novo a cada requisição.
"""
import re
import time
import requests
from config import FS_CLIENT_ID, FS_CLIENT_SECRET, FS_TOKEN_URL, FS_API_URL

_token_cache = {'token': None, 'expira_em': 0}


def _obter_token():
    agora = time.time()
    if _token_cache['token'] and agora < _token_cache['expira_em']:
        return _token_cache['token']

    r = requests.post(FS_TOKEN_URL,
        data={'grant_type': 'client_credentials', 'scope': 'basic'},
        auth=(FS_CLIENT_ID, FS_CLIENT_SECRET), timeout=10)
    r.raise_for_status()
    data = r.json()

    _token_cache['token'] = data['access_token']
    # Guarda margem de 60s antes da expiração real, por segurança
    _token_cache['expira_em'] = agora + data.get('expires_in', 86400) - 60
    return _token_cache['token']


def buscar_por_nome(nome):
    try:
        token = _obter_token()
        r = requests.post(FS_API_URL,
            data={'method': 'foods.search', 'search_expression': nome, 'format': 'json', 'max_results': 8},
            headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/x-www-form-urlencoded'},
            timeout=10)
        r.raise_for_status()

        foods = r.json().get('foods', {}).get('food', [])
        if isinstance(foods, dict):
            foods = [foods]

        produtos = []
        for f in foods:
            desc = f.get('food_description', '')

            def extrair(rotulo):
                m = re.search(rotulo + r'[:\s]*([\d.]+)', desc, re.I)
                return round(float(m.group(1)), 1) if m else 0

            porcao_match = re.match(r'Per\s*([\d.]+\s*(?:g|ml))', desc, re.I)
            imagens = f.get('food_images', {}).get('food_image')

            produtos.append({
                'nome': f.get('food_name', '')[:60],
                'marca': f.get('brand_name', ''),
                'fonte': '🟢 FatSecret',
                'porcao': porcao_match.group(1) if porcao_match else '—',
                'calorias': extrair('Calories'),
                'carboidratos': extrair('Carbs'),
                'acucares': 0,
                'fibras': 0,
                'proteinas': extrair('Protein'),
                'gorduras': extrair('Fat'),
                'imagem': imagens[0].get('image_url', '') if isinstance(imagens, list) else '',
            })
        return produtos
    except Exception as e:
        print(f"FatSecret: {e}")
        return []
