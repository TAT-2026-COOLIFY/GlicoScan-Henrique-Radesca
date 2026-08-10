"""
parsing.py — Interpretação do texto extraído por OCR
─────────────────────────────────────────────────────────────────────
Recebe a lista de linhas de texto bruto (já extraídas pelo OCR) de uma
foto de tabela nutricional, e tenta reconstruir os valores estruturados
(carboidratos, calorias, proteínas etc). É heurístico por natureza —
tabelas nutricionais brasileiras não seguem um layout 100% padronizado,
então o parser usa várias pistas (posição do número, presença de coluna
"100g", proximidade de palavras-chave) pra decidir qual número pertence
a qual nutriente.
"""
import re

NUTRIENTES_CONHECIDOS = [
    'carboidratos', 'açúcares', 'acucares', 'fibra alimentar', 'fibras',
    'proteínas', 'proteinas', 'gorduras totais', 'gorduras saturadas',
    'gorduras trans', 'sódio', 'sodio', 'valor energético', 'valor energetico',
]

# Cada nutriente do nosso modelo de dados, e os padrões regex que o identificam no texto
MAPA_NUTRIENTES = [
    ('calorias',     [r'valor\s*energ[ée]tico', r'valo[:\s]*energ']),
    ('carboidratos', [r'carboidratos?\b']),
    ('acucares',     [r'a[çc][uú]cares?\s*totais?', r'a[çc][uú]cares?\b']),
    ('fibras',       [r'fibra\s*alimentar', r'fibras?\b']),
    ('proteinas',    [r'prote[íi]nas?\b']),
    ('gorduras',     [r'gorduras?\s*totais?', r'gordura\b']),
]


def _expandir_linhas(linhas):
    """Quebra linhas onde o OCR juntou dois nutrientes na mesma linha (comum em tabelas apertadas)."""
    padrao = r'(?=\b(?:' + '|'.join(re.escape(n) for n in NUTRIENTES_CONHECIDOS) + r')\b)'
    novas = []
    for linha in linhas:
        for parte in re.split(padrao, linha, flags=re.IGNORECASE):
            parte = parte.strip()
            if parte:
                novas.append(parte)
    return novas


def _numeros_da_linha(linha):
    resultado = []
    for n in re.findall(r'\b(\d+[,.]?\d*)\b', linha):
        try:
            v = float(n.replace(',', '.'))
            if 0 <= v <= 9999:
                resultado.append(v)
        except ValueError:
            pass
    return resultado


def _tem_coluna_100g(texto):
    return bool(re.search(r'\b100\s*g\b', texto, re.IGNORECASE))


def _escolher_valor_da_porcao(numeros, tem_coluna_100g, porcao_g=None, eh_caloria=False):
    """
    Tabelas nutricionais BR costumam ter DUAS colunas (por porção e por
    100g) — essa função tenta decidir qual dos números extraídos é o
    valor "por porção" (o que realmente importa pro cálculo de dose),
    descartando o valor "por 100g" quando ambos aparecem juntos.
    """
    if not numeros:
        return None

    numeros_filtrados = [v for v in numeros if v != 100]
    if not numeros_filtrados:
        return None

    limite = None if eh_caloria else porcao_g

    if not tem_coluna_100g:
        while len(numeros_filtrados) > 1 and numeros_filtrados[-1] == int(numeros_filtrados[-1]) and numeros_filtrados[-1] <= 30:
            numeros_filtrados.pop()
        valor = numeros_filtrados[0] if numeros_filtrados else None
        if valor and limite and valor > limite * 1.1:
            return None
        return valor

    if len(numeros_filtrados) >= 3:
        a, b, c = numeros_filtrados[0], numeros_filtrados[1], numeros_filtrados[-1]
        if c == int(c) and c <= 30 and b > 0 and a / b >= 1.5:
            numeros_filtrados = numeros_filtrados[:-1]

    if len(numeros_filtrados) >= 2:
        a, b = numeros_filtrados[0], numeros_filtrados[1]
        if limite:
            a_ok, b_ok = a <= limite * 1.1, b <= limite * 1.1
            if a_ok and not b_ok: return a
            if b_ok and not a_ok: return b
            if not a_ok and not b_ok: return None
        if b > 0 and a / b >= 1.5:
            return b
        if b == int(b) and b <= 30 and a < b:
            return a
        return b

    valor = numeros_filtrados[0]
    if valor and limite and valor > limite * 1.1:
        return None
    return valor


def _extrair_produto(linhas):
    """A primeira linha 'não técnica' (sem palavras de tabela nutricional) costuma ser o nome do produto."""
    PALAVRAS_A_IGNORAR = [
        'informa', 'nutri', 'quant', 'valor', 'energet', 'carboidr', 'acucar', 'açucar',
        'fibra', 'proteina', 'gordura', 'sodio', 'sódio', 'kcal', 'kj', '%vd', 'diario',
        'percentual', 'ingredi', 'alergi', 'contém', 'porção', 'porcao', 'pode conter',
    ]
    for linha in linhas:
        l = linha.strip()
        if len(l) > 2 and not re.match(r'^[\d\s,./()%*=®™]+$', l):
            if not any(x in l.lower() for x in PALAVRAS_A_IGNORAR):
                produto = l.strip('®™ ,:;-()')
                if len(produto) > 2:
                    return produto
    return 'Produto escaneado'


def _extrair_unidade(texto):
    m = re.search(r'\((\d+\s*(?:biscoito|bolacha|unidade|unid|copo|fatia|tablete|colher|sache|sachê|xícara|xicara)[s]?)\)', texto, re.IGNORECASE)
    if m:
        return m.group(1).strip()

    m2 = re.search(r'por[çc][aã]o[^(]*\(([^)]{2,30})\)', texto, re.IGNORECASE)
    if m2:
        candidato = m2.group(1).strip()
        if re.search(r'\d', candidato) and not re.search(r'100\s*g|%VD', candidato, re.I):
            return candidato
    return ''


def parsear(linhas):
    """Ponto de entrada principal: recebe as linhas de OCR e devolve o dicionário nutricional estruturado."""
    linhas = _expandir_linhas(linhas)
    texto = ' '.join(linhas)
    tem_100g = _tem_coluna_100g(texto)

    porcao_match = re.search(r'por[çc][aã]o[^0-9]*?(\d+[,.]?\d*)\s*(?:g|ml)\b', texto, re.IGNORECASE)
    porcao_g = float(porcao_match.group(1).replace(',', '.')) if porcao_match else None

    resultado = {chave: None for chave, _ in MAPA_NUTRIENTES}

    for i, linha in enumerate(linhas):
        l = linha.lower()
        for nutriente, padroes in MAPA_NUTRIENTES:
            if resultado[nutriente] is not None:
                continue
            if 'adicionado' in l and nutriente == 'acucares':
                continue
            if not any(re.search(p, l) for p in padroes):
                continue

            numeros = _numeros_da_linha(linha)
            if not numeros and i + 1 < len(linhas):
                proxima = linhas[i + 1]
                eh_outro_nutriente = any(
                    any(re.search(p, proxima.lower()) for p in ps) for _, ps in MAPA_NUTRIENTES
                )
                if not eh_outro_nutriente:
                    numeros = _numeros_da_linha(proxima)

            if not numeros:
                break

            if nutriente == 'calorias':
                m = re.search(r'(\d+[,.]?\d*)\s*kcal', linha, re.IGNORECASE)
                if m:
                    try:
                        v = float(m.group(1).replace(',', '.'))
                        if 10 < v < 2000:
                            resultado[nutriente] = v
                            break
                    except ValueError:
                        pass
                # Fallback: padrão típico "valor_porção valor_100g %VD" (três números seguidos)
                for a, b, c in zip(numeros, numeros[1:], numeros[2:]):
                    if b > 0 and a / b >= 1.5 and c <= 20:
                        resultado[nutriente] = b
                        break
                if not resultado[nutriente]:
                    v = _escolher_valor_da_porcao(numeros, tem_100g, None, True)
                    if v and 10 < v < 2000:
                        resultado[nutriente] = v
            else:
                v = _escolher_valor_da_porcao(numeros, tem_100g, porcao_g)
                if v is not None:
                    resultado[nutriente] = v
            break

    # Fallback de calorias: procura o padrão numérico típico "XXX YY Z" (kcal, %vd relacionados)
    if not resultado['calorias']:
        for a, b, c in re.findall(r'\b(\d{3,4})\s+(\d{2,3})\s+(\d{1,2})\b', texto):
            if float(b) > 0 and float(a) / float(b) >= 1.5 and float(c) <= 20:
                resultado['calorias'] = float(b)
                break

    porcao_txt_match = re.search(r'por[çc][aã]o[^:]*?:?\s*(\d+[,.]?\d*\s*(?:g|ml)(?:[^,\n]{0,25})?)', texto, re.IGNORECASE)
    porcao_txt = porcao_txt_match.group(1).strip() if porcao_txt_match else '—'
    porcao_txt = re.sub(r'\s*(?:100\s*g|%VD|valor\s*ener).*', '', porcao_txt, flags=re.IGNORECASE).strip()

    produto = _extrair_produto(linhas)
    unidade = _extrair_unidade(texto)

    print(f"✅ {produto} | Carbo:{resultado.get('carboidratos')}g | Cal:{resultado.get('calorias')}kcal | Porção:{porcao_txt}")

    return {
        'produto': produto,
        'porcao': porcao_txt,
        'unidade': unidade,
        'calorias': round(resultado.get('calorias') or 0, 1),
        'carboidratos': round(resultado.get('carboidratos') or 0, 1),
        'acucares': round(resultado.get('acucares') or 0, 1),
        'fibras': round(resultado.get('fibras') or 0, 1),
        'proteinas': round(resultado.get('proteinas') or 0, 1),
        'gorduras': round(resultado.get('gorduras') or 0, 1),
        'texto_bruto': '\n'.join(linhas),
    }
