"""
busca.py — Normalização de texto/códigos e ranking de resultados
─────────────────────────────────────────────────────────────────────
Funções puras (sem rede nem banco) usadas pelas rotas de busca:

  normalizar(texto)         → minúsculas, sem acento/pontuação, sinônimos aplicados
  tokens(texto)             → palavras significativas, com plural simples removido
  variantes_codigo(code)    → formas equivalentes do mesmo GTIN (UPC-A ↔ EAN-13...)
  mesclar(*listas)          → intercala resultados de várias fontes sem duplicar
"""
import re
import unicodedata

# Palavras que não ajudam a achar o alimento ("pão DE sal", "arroz COM feijão")
_STOP = {'de', 'da', 'do', 'das', 'dos', 'com', 'sem', 'e', 'a', 'o', 'as', 'os', 'em', 'na', 'no', 'para', 'por'}

# Como o brasileiro fala → como a tabela de composição escreve (já normalizados)
_SINONIMOS = {
    'pao de sal': 'pao frances',
    'pao carioquinha': 'pao frances',
    'pao careca': 'pao frances',
    'macaxeira': 'mandioca',
    'aipim': 'mandioca',
    'bolacha': 'biscoito',
    'refri': 'refrigerante',
}


def _sem_acento(texto):
    return ''.join(c for c in unicodedata.normalize('NFKD', texto) if not unicodedata.combining(c))


def normalizar(texto):
    """'Pão de Sal!' → 'pao frances' (minúsculo, sem acento, sem pontuação, sinônimos aplicados)."""
    t = _sem_acento(str(texto or '').lower())
    t = re.sub(r'[^a-z0-9]+', ' ', t).strip()
    t = re.sub(r'\s+', ' ', t)
    for de, para in _SINONIMOS.items():
        if re.search(rf'\b{re.escape(de)}\b', t):
            t = re.sub(rf'\b{re.escape(de)}\b', para, t)
    return t


def _singular(palavra):
    if len(palavra) <= 3:
        return palavra
    if palavra.endswith('oes') or palavra.endswith('aes'):   # feijões, pães → feijao, pao
        return palavra[:-3] + 'ao'
    if palavra.endswith('ais'):                                # animais → animal
        return palavra[:-3] + 'al'
    if palavra.endswith('s') and not palavra.endswith('ss'):
        return palavra[:-1]
    return palavra


def tokens(texto):
    """Palavras que importam na busca, no singular. 'Pães de queijo' → ['pao', 'queijo']."""
    return [_singular(p) for p in normalizar(texto).split() if p not in _STOP]


def variantes_codigo(code):
    """
    Formas equivalentes do mesmo código, da mais provável pra menos.
    Bases como a Open Food Facts guardam tudo em EAN-13: um UPC-A de 12 dígitos
    (comum em importados) precisa de um zero à esquerda pra bater.
    Retorna [] se não parecer um GTIN (8 a 14 dígitos).
    """
    d = re.sub(r'\D', '', str(code or ''))
    if not 8 <= len(d) <= 14:
        return []
    if len(d) == 12:
        formas = ['0' + d, d]
    elif len(d) == 14 and d.startswith('0'):
        formas = [d[1:], d]
    elif len(d) == 13 and d.startswith('0'):
        formas = [d, d[1:]]
    else:
        formas = [d]
    return list(dict.fromkeys(formas))


def chave_dedup(nome):
    """Chave pra considerar dois resultados o 'mesmo produto'."""
    return ' '.join(tokens(nome))[:30]


def mesclar(*listas, limite=10):
    """
    Intercala as listas (a 1ª tem prioridade em cada rodada) e remove repetidos.
    Antes era `a + b` e cortava em 8: uma fonte que sempre devolve 8 resultados
    escondia todas as outras.
    """
    vistos, saida = set(), []
    for rodada in range(max((len(l) for l in listas), default=0)):
        for lista in listas:
            if rodada >= len(lista):
                continue
            item = lista[rodada]
            chave = chave_dedup(item.get('nome', ''))
            if not chave or chave in vistos:
                continue
            vistos.add(chave)
            saida.append(item)
            if len(saida) >= limite:
                return saida
    return saida
