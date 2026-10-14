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
import json
import os

import busca

CAMINHO_CSV = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'taco.csv')
# Itens que a própria TACO deixou sem carboidrato (ex.: leite integral fluido), completados
# com a USDA FoodData Central. Cada linha cita a fonte; aparecem rotulados na busca.
CAMINHO_MEDIDAS = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'medidas.json')
CAMINHO_COMPLEMENTOS = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'complementos.csv')

_alimentos = None    # lista de dicts já normalizados (None = ainda não carregou)
_vocabulario = []    # palavras conhecidas, pra corrigir erro de digitação
_medidas = None      # nome do alimento → {'fonte', 'medidas': [{'nome', 'g'}]} (None = não carregou)


def _numero(valor):
    try:
        return round(float(str(valor).replace(',', '.')), 1)
    except (TypeError, ValueError):
        return 0.0


def _ler_csv(caminho, fonte_padrao):
    itens = []
    try:
        with open(caminho, encoding='utf-8-sig', newline='') as f:
            for linha in csv.DictReader(f):
                nome = (linha.get('nome') or '').strip()
                if not nome:
                    continue
                itens.append({
                    'nome': nome[:60],
                    'categoria': (linha.get('categoria') or '').strip(),
                    'fonte': fonte_padrao if not linha.get('fonte') else '🇺🇸 USDA (complemento à TACO)',
                    'origem_dado': (linha.get('fonte') or '').strip(),
                    'calorias': _numero(linha.get('energia_kcal')),
                    'proteinas': _numero(linha.get('proteina_g')),
                    'gorduras': _numero(linha.get('lipidios_g')),
                    'carboidratos': _numero(linha.get('carboidrato_g')),
                    'fibras': _numero(linha.get('fibra_g')),
                    'acucares': _numero(linha.get('acucar_g')),
                })
    except FileNotFoundError:
        print(f"⚠️ TACO: {caminho} não encontrado")
    return itens


def _carregar():
    global _alimentos, _vocabulario
    if _alimentos is not None:
        return
    itens = _ler_csv(CAMINHO_CSV, '🇧🇷 TACO (Unicamp)') + _ler_csv(CAMINHO_COMPLEMENTOS, '')
    vocab = set()
    for a in itens:
        a['_toks'] = busca.tokens(a['nome'])
        a['_norm'] = ' '.join(a['_toks'])
        vocab.update(a['_toks'])
    _alimentos = itens
    _vocabulario = sorted(vocab)


def _carregar_medidas():
    """Medidas caseiras (colher, concha, unidade...) em gramas, por alimento. Só entram alimentos
    revisados (ver data/gerar_medidas.py); ausência não é erro: o usuário digita em gramas."""
    global _medidas
    if _medidas is not None:
        return
    try:
        with open(CAMINHO_MEDIDAS, encoding='utf-8') as f:
            _medidas = json.load(f)
    except (FileNotFoundError, ValueError):
        _medidas = {}


def _corrigir(palavra):
    """Palavra desconhecida → a mais parecida do vocabulário (erro de digitação), senão ela mesma."""
    if palavra in _vocabulario or len(palavra) < 4:
        return palavra
    parecidas = difflib.get_close_matches(palavra, _vocabulario, n=1, cutoff=0.8)
    return parecidas[0] if parecidas else palavra


_PREPARADO = {'cozido', 'cozida', 'assado', 'assada', 'grelhado', 'grelhada', 'frito', 'frita', 'refogado', 'refogada'}
_CRU = {'cru', 'crua', 'seco', 'seca'}
# Versões processadas/concentradas: o usuário que digita "leite" ou "banana" quer o alimento
# comum, não leite condensado (57 g de carbo) nem banana-doce em barra (76 g). Ficam por último.
_PROCESSADO = {'doce', 'condensado', 'calda', 'mistura', 'instantaneo', 'po', 'geleia', 'compota',
               'enlatado', 'conserva', 'glace', 'cristalizado', 'extrato', 'concentrado', 'achocolatado'}


# Busca de uma palavra só → o alimento que a pessoa quase sempre quer (fica no topo).
# Chave = palavras normalizadas da busca; valor = nome exato na tabela (testado em test_taco_dados_reais).
_PREFERIDOS = {
    'arroz': 'Arroz, tipo 1, cozido',
    'feijao': 'Feijão, carioca, cozido',
    'pao': 'Pão, trigo, francês',
    'banana': 'Banana, prata, crua',
    'batata': 'Batata, inglesa, cozida',
    'laranja': 'Laranja, pêra, crua',
    'maca': 'Maçã, Fuji, com casca, crua',
    'mamao': 'Mamão, Formosa, cru',
    'ovo': 'Ovo, de galinha, inteiro, cozido/10minutos',
    'cenoura': 'Cenoura, cozida',
    'leite': 'Leite, de vaca, integral (fluido)',
    'macarrao': 'Macarrão, trigo, cozido',
}


def _estado(toks):
    """0 = pronto pra comer, 1 = não informado, 2 = cru/seco, 3 = processado/concentrado. Arroz cru tem ~3x o carboidrato do
    cozido: sugerir o cru primeiro levaria a uma dose muito maior que a necessária."""
    if any(t in _PROCESSADO for t in toks):
        return 3
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

    fixo = _PREFERIDOS.get(' '.join(palavras))
    if fixo:
        achados.sort(key=lambda t: t[3] != fixo)  # sort estável: só leva o fixo pro início

    _carregar_medidas()
    return [{
        'medidas': _medidas.get(a['nome'], {}).get('medidas', []),
        'medidas_fonte': _medidas.get(a['nome'], {}).get('fonte', ''),
        'nome': a['nome'],
        'marca': a['categoria'],
        'fonte': a['fonte'],
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
