"""Valida o token de login (Supabase Auth) e devolve o id do usuário dono dele."""
import time

import requests

import config

_TTL_SEGUNDOS = 60
_cache = {}  # token -> (user_id, expira_em); evita 1 ida ao Supabase por requisição


def usuario_do_token(token):
    """id do usuário se o token for válido, senão None."""
    agora = time.time()
    hit = _cache.get(token)
    if hit and hit[1] > agora:
        return hit[0]

    try:
        r = requests.get(
            f'{config.SUPABASE_URL}/auth/v1/user',
            headers={'apikey': config.SUPABASE_KEY, 'Authorization': f'Bearer {token}'},
            timeout=8,
        )
    except requests.RequestException:
        return None
    if r.status_code != 200:
        return None

    user_id = r.json().get('id')
    if user_id:
        if len(_cache) > 1000:
            _cache.clear()
        _cache[token] = (user_id, agora + _TTL_SEGUNDOS)
    return user_id
