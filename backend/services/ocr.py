"""
services/ocr.py — Reconhecimento de texto em fotos (OCR.Space)
─────────────────────────────────────────────────────────────────────
Usado quando o produto não tem código de barras reconhecido (ou não
está em nenhuma base de dados): o usuário fotografa a tabela
nutricional da embalagem e o texto é extraído aqui, depois interpretado
pelo parsing.py.

Estratégia "dual engine": o OCR.Space oferece dois motores de
reconhecimento (Engine 1 e Engine 2), com pontos fortes diferentes.
Rodamos os dois EM PARALELO e comparamos qual capturou mais palavras-
chave nutricionais relevantes — o de melhor pontuação "vence"; se os
dois tiverem pontuação parecida, mesclamos as linhas dos dois pra não
perder informação.
"""
from concurrent.futures import ThreadPoolExecutor
import requests
from config import OCR_URL, OCR_API_KEY

PALAVRAS_CHAVE_NUTRICIONAIS = [
    'carboidrat', 'açúcar', 'acucar', 'fibra', 'proteina',
    'gordura', 'kcal', 'porção', 'porcao',
]


def _chamar_engine(imagem_base64, numero_engine):
    try:
        r = requests.post(OCR_URL, data={
            'apikey': OCR_API_KEY,
            'base64Image': f'data:image/jpeg;base64,{imagem_base64}',
            'language': 'por',
            'isOverlayRequired': False,
            'detectOrientation': True,
            'scale': True,
            'OCREngine': numero_engine,
            'isTable': True,
        }, timeout=25)
        r.raise_for_status()
        data = r.json()

        if data.get('IsErroredOnProcessing'):
            return []

        linhas = []
        for pagina in data.get('ParsedResults', []):
            for linha in pagina.get('ParsedText', '').split('\r\n'):
                linha = linha.strip()
                if linha:
                    linhas.append(linha)
        return linhas
    except Exception as e:
        print(f"OCR Engine {numero_engine}: {e}")
        return []


def _pontuar(linhas):
    """Conta quantas palavras-chave nutricionais aparecem no texto — proxy de 'qualidade' da leitura."""
    texto = ' '.join(linhas).lower()
    return sum(1 for kw in PALAVRAS_CHAVE_NUTRICIONAIS if kw in texto)


def extrair_texto(imagem_base64):
    """Roda os dois motores de OCR em paralelo e retorna o melhor resultado (ou a mescla dos dois)."""
    with ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(_chamar_engine, imagem_base64, 1)
        f2 = executor.submit(_chamar_engine, imagem_base64, 2)
        resultado1, resultado2 = f1.result(), f2.result()

    pontos1, pontos2 = _pontuar(resultado1), _pontuar(resultado2)
    print(f"OCR: Engine1={pontos1} Engine2={pontos2}")

    if pontos1 == 0 and pontos2 == 0:
        return []

    # Pontuação parecida e ambos com conteúdo → mescla as linhas dos dois motores
    if abs(pontos1 - pontos2) <= 2 and pontos1 > 0 and pontos2 > 0:
        mesclado = list(resultado2)
        prefixos_r2 = [l.lower()[:25] for l in resultado2]
        for linha in resultado1:
            if not any(linha.lower()[:25] in x for x in prefixos_r2):
                mesclado.append(linha)
        return mesclado

    return resultado1 if pontos1 >= pontos2 else resultado2
