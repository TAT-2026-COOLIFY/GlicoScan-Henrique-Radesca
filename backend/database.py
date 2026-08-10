"""
database.py — Camada de acesso ao SQLite
─────────────────────────────────────────────────────────────────────
Duas tabelas:
  historico    → cada cálculo de dose que o usuário salvou
  cache_busca  → resultados de buscas (por nome ou código de barras),
                 evita bater na API externa toda vez pro mesmo produto
"""
import sqlite3
import json
from datetime import datetime, timedelta
from config import DB_PATH


def get_connection():
    return sqlite3.connect(DB_PATH)


def init_db():
    """Cria as tabelas se ainda não existirem. Chamado uma vez ao subir o servidor."""
    conn = get_connection()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS historico (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            produto TEXT, porcao TEXT, unidade TEXT,
            carboidratos REAL, acucares REAL, fibras REAL,
            proteinas REAL, gorduras REAL, calorias REAL,
            carbo_total REAL, porcoes REAL, ric INTEGER,
            dose REAL, insulina TEXT, glicemia_atual REAL,
            data TEXT, hora TEXT
        );
        CREATE TABLE IF NOT EXISTS cache_busca (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query TEXT UNIQUE,
            resultado TEXT,
            criado_em TEXT
        );
    ''')
    conn.commit()
    conn.close()


# ── Cache de buscas ────────────────────────────────────────────────

def buscar_no_cache(chave, validade_horas=24):
    """Retorna o resultado em cache se existir e ainda estiver dentro da validade."""
    conn = get_connection()
    row = conn.execute(
        'SELECT resultado, criado_em FROM cache_busca WHERE query=?', (chave,)
    ).fetchone()
    conn.close()

    if not row:
        return None
    try:
        criado_em = datetime.fromisoformat(row[1])
        if datetime.now() - criado_em < timedelta(hours=validade_horas):
            return json.loads(row[0])
    except Exception:
        pass
    return None


def salvar_no_cache(chave, resultado):
    conn = get_connection()
    conn.execute(
        'INSERT OR REPLACE INTO cache_busca (query, resultado, criado_em) VALUES (?,?,?)',
        (chave, json.dumps(resultado), datetime.now().isoformat())
    )
    conn.commit()
    conn.close()


def buscar_cache_barcode(code):
    """
    Busca cache de um código de barras específico, distinguindo entre
    cache 'fresco' (< 30 dias, ainda confiável) e 'antigo' (usado só
    como último recurso, com aviso pro usuário conferir na embalagem).
    """
    conn = get_connection()
    row = conn.execute(
        'SELECT resultado, criado_em FROM cache_busca WHERE query=?', (f'barcode:{code}',)
    ).fetchone()

    if not row:
        conn.close()
        return None, None

    try:
        cached = json.loads(row[0])
        idade_dias = (datetime.now() - datetime.fromisoformat(row[1])).days
        tem_valores = cached.get('carboidratos', 0) > 0 or cached.get('calorias', 0) > 0

        if not tem_valores:
            conn.execute('DELETE FROM cache_busca WHERE query=?', (f'barcode:{code}',))
            conn.commit()
            conn.close()
            return None, None

        conn.close()
        if idade_dias < 30:
            return cached, None
        return None, cached
    except Exception:
        conn.close()
        return None, None


# ── Histórico de cálculos ────────────────────────────────────────

def listar_historico(limite=100):
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    rows = conn.execute('SELECT * FROM historico ORDER BY id DESC LIMIT ?', (limite,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def adicionar_historico(d):
    conn = get_connection()
    agora = datetime.now()
    conn.execute('''INSERT INTO historico
        (produto,porcao,unidade,carboidratos,acucares,fibras,proteinas,gorduras,
         calorias,carbo_total,porcoes,ric,dose,insulina,glicemia_atual,data,hora)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''', (
        d.get('produto', ''), d.get('porcao', ''), d.get('unidade', ''),
        d.get('carboidratos', 0), d.get('acucares', 0), d.get('fibras', 0),
        d.get('proteinas', 0), d.get('gorduras', 0), d.get('calorias', 0),
        d.get('carboTotal', 0), d.get('porcoes', 1), d.get('ric', 15),
        d.get('dose', 0), d.get('insulina', ''), d.get('glicemiaAtual', 0),
        agora.strftime('%d/%m/%Y'), agora.strftime('%H:%M'),
    ))
    conn.commit()
    conn.close()


def remover_historico(id):
    conn = get_connection()
    conn.execute('DELETE FROM historico WHERE id=?', (id,))
    conn.commit()
    conn.close()


def limpar_historico():
    conn = get_connection()
    conn.execute('DELETE FROM historico')
    conn.commit()
    conn.close()


def obter_estatisticas():
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    total = conn.execute('SELECT COUNT(*) as n FROM historico').fetchone()['n']
    media_carbo = conn.execute('SELECT AVG(carbo_total) as m FROM historico').fetchone()['m']
    media_dose = conn.execute('SELECT AVG(dose) as m FROM historico').fetchone()['m']
    por_dia = conn.execute('''
        SELECT data, SUM(carbo_total) as carbo, SUM(dose) as dose, COUNT(*) as ref
        FROM historico GROUP BY data ORDER BY id DESC LIMIT 7
    ''').fetchall()
    mais_consumidos = conn.execute('''
        SELECT produto, COUNT(*) as v FROM historico GROUP BY produto ORDER BY v DESC LIMIT 5
    ''').fetchall()
    conn.close()

    return {
        'total_calculos': total,
        'media_carbo_por_refeicao': round(media_carbo or 0, 1),
        'media_dose_por_refeicao': round(media_dose or 0, 1),
        'por_dia': [dict(r) for r in por_dia],
        'mais_consumidos': [dict(r) for r in mais_consumidos],
    }
