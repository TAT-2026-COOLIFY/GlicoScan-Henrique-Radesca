"""
Testes de parsing.py — a peça mais heurística e frágil do backend.

Cobre dois formatos reais de tabela nutricional brasileira (com e sem
coluna "100g") e trava a regressão do bug do número colado na unidade
("20g" sem espaço), encontrado ao escrever estes testes: o regex de
extração de número usava \\b nos dois lados, e não há boundary entre
dígito e letra (ambos são \\w) — então "20g" nunca virava 20.
"""
import parsing


def test_numero_colado_na_unidade_e_extraido():
    # Regressão: "\bnúmero\b" não casava "20" dentro de "20g".
    assert parsing._numeros_da_linha('Carboidratos 20g 7%') == [20.0, 7.0]
    assert parsing._numeros_da_linha('Gorduras totais 5g 9%') == [5.0, 9.0]


def test_numero_com_espaco_da_unidade_continua_funcionando():
    assert parsing._numeros_da_linha('Carboidratos 20 g 7%') == [20.0, 7.0]


def test_numero_decimal_com_virgula():
    assert parsing._numeros_da_linha('Fibra alimentar 2,5g') == [2.5]


def test_tabela_sem_coluna_100g():
    linhas = [
        'Bolacha Recheada Chocolate',
        'INFORMACAO NUTRICIONAL',
        'Porcao de 30g (3 unidades)',
        'Quantidade por porcao',
        'Valor energetico 140 kcal 7%',
        'Carboidratos 20g 7%',
        'Acucares totais 8g',
        'Proteinas 2g',
        'Gorduras totais 5g 9%',
    ]
    r = parsing.parsear(linhas)

    assert r['produto'] == 'Bolacha Recheada Chocolate'
    assert r['unidade'] == '3 unidades'
    assert r['calorias'] == 140.0
    assert r['carboidratos'] == 20.0
    assert r['acucares'] == 8.0
    assert r['proteinas'] == 2.0
    assert r['gorduras'] == 5.0
    assert r['fibras'] == 0  # não presente na tabela — fica em branco, não None


def test_tabela_com_coluna_100g_usa_valor_da_porcao_nao_do_100g():
    linhas = [
        'Cereal Matinal Chocolate',
        'Informacao Nutricional',
        'Porcao de 30g (3 colheres de sopa)',
        'Por porcao 100g %VD',
        'Valor energetico 112kcal 373kcal 6%',
        'Carboidratos 24g 80g 8%',
        'Acucares totais 10g 25g 11%',
        'Proteinas 2g 7g 4%',
        'Gorduras totais 1g 3g 2%',
        'Fibra alimentar 1g 3g 4%',
    ]
    r = parsing.parsear(linhas)

    assert r['produto'] == 'Cereal Matinal Chocolate'
    assert r['unidade'] == '3 colheres de sopa'
    assert r['calorias'] == 112.0     # não 373 (valor do 100g)
    assert r['carboidratos'] == 24.0  # não 80
    assert r['acucares'] == 10.0      # não 25
    assert r['proteinas'] == 2.0      # não 7
    assert r['gorduras'] == 1.0       # não 3
    assert r['fibras'] == 1.0         # não 3


def test_produto_ignora_linhas_tecnicas_da_tabela():
    linhas = ['INFORMACAO NUTRICIONAL', 'Porcao de 30g', 'Biscoito Maria']
    assert parsing._extrair_produto(linhas) == 'Biscoito Maria'


def test_produto_usa_fallback_quando_nao_encontra_nome():
    linhas = ['INFORMACAO NUTRICIONAL', 'VALOR ENERGETICO', '20', '7%']
    assert parsing._extrair_produto(linhas) == 'Produto escaneado'


def test_extrair_unidade_com_parenteses():
    assert parsing._extrair_unidade('Porcao de 30g (3 biscoitos)') == '3 biscoitos'


def test_extrair_unidade_ausente_retorna_vazio():
    assert parsing._extrair_unidade('Porcao de 200ml') == ''
