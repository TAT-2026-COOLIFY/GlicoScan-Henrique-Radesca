"""
Gera data/medidas.json (medidas caseiras → gramas) a partir da POF/IBGE.

Uso:  python gerar_medidas.py <pof_medidas_caseiras.csv> [saida.json]

Fonte do CSV: IBGE, Pesquisa de Orçamentos Familiares (POF 2008-2009), tabela de medidas
referidas, em versão estruturada por https://github.com/brolesi/taco (MIT).

NÃO mapeia tudo automaticamente: o mesmo "colher de sopa" pesa diferente para arroz cru e
cozido, e um peso errado vira dose errada. Por isso só entram os alimentos listados em
MAPA abaixo, cada um ligado a UMA linha de alimento/preparação da POF revisada à mão.
"""
import csv
import json
import sys
import unicodedata
from collections import defaultdict
from statistics import median

# nome na TACO → (alimento na POF, trecho da preparação ou None, medidas aceitas)
MAPA = {
    'Arroz, tipo 1, cozido': ('ARROZ (POLIDO, PARBOILIZADO)', None,
                              ['COLHER DE ARROZ/SERVIR', 'COLHER DE SOPA', 'CONCHA', 'PRATO RASO', 'XICARA DE CHA']),
    'Arroz, tipo 2, cozido': ('ARROZ (POLIDO, PARBOILIZADO)', None,
                              ['COLHER DE ARROZ/SERVIR', 'COLHER DE SOPA', 'CONCHA', 'PRATO RASO', 'XICARA DE CHA']),
    # colher de servir (63 g) e concha (117 g) do integral destoam do arroz branco (45 g / 100 g) sem
    # explicação na POF: ficam de fora até serem conferidas.
    'Arroz, integral, cozido': ('ARROZ INTEGRAL', None, ['COLHER DE SOPA', 'PRATO RASO']),
    'Feijão, carioca, cozido': ('FEIJAO (PRETO, MULATINHO, ROXO, ROSINHA, ETC)', None,
                                ['COLHER DE ARROZ/SERVIR', 'COLHER DE SOPA', 'CONCHA', 'PRATO RASO']),
    'Feijão, preto, cozido': ('FEIJAO (PRETO, MULATINHO, ROXO, ROSINHA, ETC)', None,
                              ['COLHER DE ARROZ/SERVIR', 'COLHER DE SOPA', 'CONCHA', 'PRATO RASO']),
    'Pão, trigo, francês': ('PAO DE SAL', None, ['UNIDADE', 'FATIA']),
    'Pão, trigo, forma, integral': ('PAO DE FORMA INDUSTRIALIZADO DE QUALQUER MARCA', None, ['FATIA']),
    'Banana, prata, crua': ('BANANA (OURO, PRATA, D AGUA, DA TERRA, ETC)', 'CRU', ['UNIDADE']),
    'Batata, inglesa, cozida': ('BATATA INGLESA', 'CROZIDO', ['UNIDADE', 'UNIDADE PEQUENA', 'COLHER DE ARROZ/SERVIR', 'COLHER DE SOPA']),
    'Macarrão, trigo, cozido': ('MACARRAO', 'CROZIDO', ['COLHER DE ARROZ/SERVIR', 'COLHER DE SOPA', 'PEGADOR', 'GARFADA']),
    'Ovo, de galinha, inteiro, cozido/10minutos': ('OVO DE GALINHA', 'CROZIDO', ['UNIDADE']),
    'Leite, de vaca, integral (fluido)': ('LEITE DE VACA INTEGRAL', None, ['COPO AMERICANO', 'COPO DE REQUEIJAO']),
    # Laranja "unidade" (180 g) fora: a POF não deixa claro se é com casca; a TACO é parte comestível.
}

ROTULO = {
    'COLHER DE ARROZ/SERVIR': 'colher de servir', 'COLHER DE SOPA': 'colher de sopa', 'CONCHA': 'concha',
    'PRATO RASO': 'prato raso', 'XICARA DE CHA': 'xícara de chá', 'UNIDADE': 'unidade',
    'UNIDADE PEQUENA': 'unidade pequena', 'FATIA': 'fatia', 'PEGADOR': 'pegador', 'GARFADA': 'garfada',
    'COPO AMERICANO': 'copo americano', 'COPO DE REQUEIJAO': 'copo de requeijão',
}


def _norm(t):
    return ''.join(c for c in unicodedata.normalize('NFKD', t) if not unicodedata.combining(c)).upper().strip()


def main(origem, destino):
    por_chave = defaultdict(list)
    for r in csv.DictReader(open(origem, encoding='utf-8-sig', newline='')):
        try:
            g = float(r['quantidade_g'])
        except ValueError:
            continue
        por_chave[(_norm(r['descricao_alimento']), _norm(r['descricao_preparacao']), _norm(r['descricao_medida']))].append(g)

    saida, faltou = {}, []
    for nome_taco, (alimento, prep, medidas) in MAPA.items():
        itens = []
        for medida in medidas:
            valores = [
                g for (a, p, m), gs in por_chave.items()
                if a == _norm(alimento) and m == medida and (prep is None or prep in p) for g in gs
            ]
            if valores:
                itens.append({'nome': ROTULO[medida], 'g': round(median(valores), 1)})
            else:
                faltou.append((nome_taco, medida))
        if itens:
            saida[nome_taco] = {'fonte': 'IBGE/POF 2008-2009 (média)', 'medidas': itens}

    json.dump(saida, open(destino, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{len(saida)} alimentos com medidas -> {destino}')
    for nome, v in saida.items():
        print(' ', nome, '->', ', '.join(f"{m['nome']} {m['g']}g" for m in v['medidas']))
    if faltou:
        print('sem dado na POF:', faltou)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'medidas.json')
