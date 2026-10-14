"""
services/taco.py — Alimentos genéricos brasileiros (Tabela TACO, Unicamp)
─────────────────────────────────────────────────────────────────────
Arroz, feijão, pão francês, frutas, carnes... alimento sem código de
barras e fora das bases de produtos industrializados. Os dados vêm de
`data/taco.csv` (valores por 100g) e ficam em memória: são só algumas
centenas de linhas, sem rede e sem banco.

Colunas do CSV: nome, categoria, energia_kcal, proteina_g, lipidios_g,
carboidrato_g, fibra_g, acucar_g (acucar_g pode ficar vazio).
"""
import csv
import difflib
import os

import busca

CAMINHO_CSV = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'taco.csv')

_alimentos = None    # lista de dicts já normalizados (None = ainda não carregou)
_vocabulario = []    # palavras conhecidas, pra corrigir erro de digitação


def _numero(valor):
    try:
        return round(float(str(valor).replace(',', '.')), 1)
    except (TypeError, ValueError):
        return 0.0


def _carregar():
    global _alimentos, _vocabulario
    if _alimentos is not None:
        return
    _alimentos, vocab = [], set()
    try:
        with open(CAMINHO_CSV, encoding='utf-8-sig', newline='') as f:
            for linha in csv.DictReader(f):
                nome = (linha.get('nome') or '').strip()
                if not nome:
                    continue
                toks = busca.tokens(nome)
                vocab.update(toks)
                _alimentos.append({
                    'nome': nome[:60],
                    'categoria': (linha.get('categoria') or '').strip(),
                    '_toks': toks,
                    '_norm': ' '.join(toks),
                    'calorias': _numero(linha.get('energia_kcal')),
                    'proteinas': _numero(linha.get('proteina_g')),
                    'gorduras': _numero(linha.get('lipidios_g')),
                    'carboidratos': _numero(linha.get('carboidrato_g')),
                    'fibras': _numero(linha.get('fibra_g')),
                    'acucares': _numero(linha.get('acucar_g')),
                })
    except FileNotFoundError:
        print(f"⚠️ TACO: {CAMINHO_CSV} não encontrado — busca de alimentos genéricos desativada")
    _vocabulario = sorted(vocab)


def _corrigir(palavra):
    """Palavra desconhecida → a mais parecida do vocabulário (erro de digitação), senão ela mesma."""
    if palavra in _vocabulario or len(palavra) < 4:
        return palavra
    parecidas = difflib.get_close_matches(palavra, _vocabulario, n=1, cutoff=0.8)
    return parecidas[0] if parecidas else palavra


_PREPARADO = {'cozido', 'cozida', 'assado', 'assada', 'grelhado', 'grelhada', 'frito', 'frita', 'refogado', 'refogada'}
_CRU = {'cru', 'crua', 'seco', 'seca'}


def _estado(toks):
    """0 = pronto pra comer, 1 = não informado, 2 = cru/seco. Arroz cru tem ~3x o carboidrato do
    cozido: sugerir o cru primeiro levaria a uma dose muito maior que a necessária."""
    if any(t in _PREPARADO for t in toks):
        return 0
    if any(t in _CRU for t in toks):
        return 2
    return 1


def _casa(palavra, toks):
    return any(t == palavra or t.startswith(palavra) for t in toks)


def buscar(texto, limite=6):
    """Alimentos que contêm todas as palavras da busca; mais simples/curtos primeiro."""
    _carregar()
    if not _alimentos:
        return []
    palavras = [_corrigir(p) for p in busca.tokens(texto)]
    if not palavras:
        return []

    achados = []
    for a in _alimentos:
        if all(_casa(p, a['_toks']) for p in palavras):
            exato = a['_norm'] == ' '.join(palavras)
            comeca = a['_toks'][:1] == palavras[:1]
            achados.append((0 if exato else 1 if comeca else 2, _estado(a['_toks']), len(a['_toks']), a['nome'], a))
    achados.sort(key=lambda t: t[:4])

    return [{
        'nome': a['nome'],
        'marca': a['categoria'],
        'fonte': '🇧🇷 TACO (Unicamp)',
        'porcao': '100g',
        'unidade': '',
        'base': '100g',
        'calorias': a['calorias'], 'carboidratos': a['carboidratos'], 'acucares': a['acucares'],
        'fibras': a['fibras'], 'proteinas': a['proteinas'], 'gorduras': a['gorduras'],
        'imagem': '',
    } for *_, a in achados[:limite]]


def total():
    _carregar()
    return len(_alimentos or [])
