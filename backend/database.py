"""
database.py — Camada de acesso ao banco (Postgres em produção, SQLite local)
─────────────────────────────────────────────────────────────────────
Duas tabelas:
  historico    → cada cálculo de dose que o usuário salvou
  cache_busca  → resultados de buscas (por nome ou código de barras),
                 evita bater na API externa toda vez pro mesmo produto

Com DATABASE_URL configurada (Postgres do Supabase) os dados ficam
fora do Render e sobrevivem a deploys. Sem ela, usa o SQLite local
(DB_PATH) — comportamento de desenvolvimento e dos testes.
"""
import sqlite3
import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import busca
import config
from config import DB_PATH, DATABASE_URL

# Nome padrão do perfil quando o frontend não manda um (só informativo —
# quem separa o histórico entre pessoas é user_id, não este nome).
PERFIL_PADRAO = 'Perfil 1'


class _Conexao:
    """Fachada fina sobre sqlite3/psycopg: mesmo SQL (placeholder `?`) e linhas
    acessíveis por nome nos dois bancos."""

    def __init__(self):
        self.postgres = bool(DATABASE_URL)
        if self.postgres:
            import psycopg
            from psycopg.rows import dict_row
            # prepare_threshold=None: compatível com o pooler do Supabase
            # (pgbouncer), que não aceita prepared statements.
            self._c = psycopg.connect(
                DATABASE_URL, row_factory=dict_row, connect_timeout=10, prepare_threshold=None
            )
        else:
            self._c = sqlite3.connect(DB_PATH)
            self._c.row_factory = sqlite3.Row

    def execute(self, sql, params=()):
        if self.postgres:
            sql = sql.replace('?', '%s')
        return self._c.execute(sql, params)

    def commit(self):
        self._c.commit()

    def close(self):
        self._c.close()


def get_connection():
    return _Conexao()


def init_db():
    """Cria as tabelas se ainda não existirem. Chamado uma vez ao subir o servidor."""
    conn = get_connection()
    pk = 'BIGSERIAL PRIMARY KEY' if conn.postgres else 'INTEGER PRIMARY KEY AUTOINCREMENT'
    conn.execute(f'''
        CREATE TABLE IF NOT EXISTS historico (
            id {pk},
            produto TEXT, porcao TEXT, unidade TEXT,
            carboidratos DOUBLE PRECISION, acucares DOUBLE PRECISION, fibras DOUBLE PRECISION,
            proteinas DOUBLE PRECISION, gorduras DOUBLE PRECISION, calorias DOUBLE PRECISION,
            carbo_total DOUBLE PRECISION, porcoes DOUBLE PRECISION, ric DOUBLE PRECISION,
            dose DOUBLE PRECISION, insulina TEXT, glicemia_atual DOUBLE PRECISION,
            data TEXT, hora TEXT, perfil TEXT, observacao TEXT, user_id TEXT
        )
    ''')
    conn.execute(f'''
        CREATE TABLE IF NOT EXISTS cache_busca (
            id {pk},
            query TEXT UNIQUE,
            resultado TEXT,
            criado_em TEXT
        )
    ''')
    conn.execute(f'''
        CREATE TABLE IF NOT EXISTS produtos_usuario (
            id {pk},
            user_id TEXT NOT NULL,
            codigo TEXT,
            nome TEXT NOT NULL,
            nome_norm TEXT NOT NULL,
            porcao TEXT, unidade TEXT, embalagem TEXT,
            carboidratos DOUBLE PRECISION, acucares DOUBLE PRECISION, fibras DOUBLE PRECISION,
            proteinas DOUBLE PRECISION, gorduras DOUBLE PRECISION, calorias DOUBLE PRECISION,
            criado_em TEXT, atualizado_em TEXT
        )
    ''')
    conn.execute('CREATE INDEX IF NOT EXISTS ix_produtos_usuario_dono ON produtos_usuario (user_id, codigo)')
    if conn.postgres:
        # O Supabase expõe o schema public via API REST com a chave pública
        # (que está no frontend). RLS ligado e sem nenhuma policy = a API
        # REST não enxerga nada; o backend conecta como dono e ignora o RLS.
        conn.execute('ALTER TABLE historico ENABLE ROW LEVEL SECURITY')
        conn.execute('ALTER TABLE cache_busca ENABLE ROW LEVEL SECURITY')
        conn.execute('ALTER TABLE produtos_usuario ENABLE ROW LEVEL SECURITY')
    else:
        # Migração pra bancos SQLite criados antes de existirem estas colunas.
        # (user_id: linhas antigas ficam NULL e não aparecem pra ninguém.)
        for coluna in ('perfil', 'observacao', 'user_id'):
            try:
                conn.execute(f'ALTER TABLE historico ADD COLUMN {coluna} TEXT')
            except sqlite3.OperationalError:
                pass  # coluna já existe
    conn.commit()
    conn.close()


def ping():
    """True se o banco responde. Usado pelo /health/db, que o cron do GitHub
    Actions chama pra manter o projeto do Supabase ativo."""
    try:
        conn = get_connection()
        conn.execute('SELECT 1').fetchone()
        conn.close()
        return True
    except Exception:
        return False


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
        criado_em = datetime.fromisoformat(row['criado_em'])
        if datetime.now() - criado_em < timedelta(hours=validade_horas):
            return json.loads(row['resultado'])
    except Exception:
        pass
    return None


def salvar_no_cache(chave, resultado):
    conn = get_connection()
    conn.execute(
        '''INSERT INTO cache_busca (query, resultado, criado_em) VALUES (?,?,?)
           ON CONFLICT (query) DO UPDATE
           SET resultado = excluded.resultado, criado_em = excluded.criado_em''',
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
        cached = json.loads(row['resultado'])
        idade_dias = (datetime.now() - datetime.fromisoformat(row['criado_em'])).days
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


def limpar_cache():
    conn = get_connection()
    conn.execute('DELETE FROM cache_busca')
    conn.commit()
    conn.close()


# ── Histórico de cálculos ────────────────────────────────────────

def listar_historico(user_id, limite=100):
    conn = get_connection()
    rows = conn.execute(
        'SELECT * FROM historico WHERE user_id = ? ORDER BY id DESC LIMIT ?', (user_id, limite)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def adicionar_historico(d, user_id):
    conn = get_connection()
    agora = datetime.now(ZoneInfo(config.APP_TZ))
    novo_id = conn.execute('''INSERT INTO historico
        (produto,porcao,unidade,carboidratos,acucares,fibras,proteinas,gorduras,
         calorias,carbo_total,porcoes,ric,dose,insulina,glicemia_atual,data,hora,perfil,observacao,user_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        RETURNING id''', (
        d.get('produto', ''), d.get('porcao', ''), d.get('unidade', ''),
        d.get('carboidratos', 0), d.get('acucares', 0), d.get('fibras', 0),
        d.get('proteinas', 0), d.get('gorduras', 0), d.get('calorias', 0),
        d.get('carboTotal', 0), d.get('porcoes', 1), d.get('ric', 15),
        d.get('dose', 0), d.get('insulina', ''), d.get('glicemiaAtual', 0),
        agora.strftime('%d/%m/%Y'), agora.strftime('%H:%M'), d.get('perfil') or PERFIL_PADRAO,
        d.get('observacao') or '', user_id,
    )).fetchone()['id']
    conn.commit()
    conn.close()
    return novo_id


def remover_historico(id, user_id):
    conn = get_connection()
    conn.execute('DELETE FROM historico WHERE id=? AND user_id=?', (id, user_id))
    conn.commit()
    conn.close()


def limpar_historico(user_id):
    conn = get_connection()
    conn.execute('DELETE FROM historico WHERE user_id = ?', (user_id,))
    conn.commit()
    conn.close()


def obter_estatisticas(user_id):
    conn = get_connection()

    where, params = 'WHERE user_id = ?', (user_id,)

    total = conn.execute(f'SELECT COUNT(*) as n FROM historico {where}', params).fetchone()['n']
    media_carbo = conn.execute(f'SELECT AVG(carbo_total) as m FROM historico {where}', params).fetchone()['m']
    media_dose = conn.execute(f'SELECT AVG(dose) as m FROM historico {where}', params).fetchone()['m']
    por_dia = conn.execute(f'''
        SELECT data, SUM(carbo_total) as carbo, SUM(dose) as dose, COUNT(*) as ref,
               AVG(CASE WHEN glicemia_atual > 0 THEN glicemia_atual END) as glicemia
        FROM historico {where} GROUP BY data ORDER BY MAX(id) DESC LIMIT 7
    ''', params).fetchall()
    mais_consumidos = conn.execute(f'''
        SELECT produto, COUNT(*) as v FROM historico {where} GROUP BY produto ORDER BY v DESC LIMIT 5
    ''', params).fetchall()
    conn.close()

    por_dia_processado = []
    for r in por_dia:
        d = dict(r)
        d['glicemia'] = round(d['glicemia'], 1) if d['glicemia'] is not None else None
        por_dia_processado.append(d)

    return {
        'total_calculos': total,
        'media_carbo_por_refeicao': round(media_carbo or 0, 1),
        'media_dose_por_refeicao': round(media_dose or 0, 1),
        'por_dia': por_dia_processado,
        'mais_consumidos': [dict(r) for r in mais_consumidos],
    }


# ── Produtos do usuário ("Meus produtos") ───────────────────────────
# Valores que o próprio usuário confirmou/corrigiu (foto da tabela, digitação
# ou ajuste de um dado errado da base). Ficam POR CONTA: nunca viram sugestão
# pra outra pessoa, porque dado nutricional errado afeta a dose de insulina.

LIMITE_PRODUTOS_USUARIO = 500
_CAMPOS_PRODUTO_NUM = ('carboidratos', 'acucares', 'fibras', 'proteinas', 'gorduras', 'calorias')


def _linha_produto(r):
    d = dict(r)
    return {
        'id': d['id'], 'codigo': d.get('codigo') or '', 'produto': d['nome'], 'nome': d['nome'],
        'porcao': d.get('porcao') or '—', 'unidade': d.get('unidade') or '',
        'embalagem': d.get('embalagem') or '',
        **{c: d.get(c) or 0 for c in _CAMPOS_PRODUTO_NUM},
    }


def salvar_produto_usuario(d, user_id):
    """Insere ou atualiza (mesmo código, ou mesmo nome quando não há código). Retorna o id,
    ou None se a conta já atingiu o limite de produtos salvos."""
    nome = str(d.get('nome') or d.get('produto') or '').strip()[:80]
    codigo = ''.join(ch for ch in str(d.get('codigo') or '') if ch.isdigit())[:14]
    nome_norm = busca.normalizar(nome)
    agora = datetime.now(ZoneInfo(config.APP_TZ)).isoformat(timespec='seconds')
    valores = [float(d.get(c) or 0) for c in _CAMPOS_PRODUTO_NUM]

    conn = get_connection()
    if codigo:
        existente = conn.execute(
            'SELECT id FROM produtos_usuario WHERE user_id=? AND codigo=?', (user_id, codigo)
        ).fetchone()
    else:
        existente = conn.execute(
            "SELECT id FROM produtos_usuario WHERE user_id=? AND (codigo IS NULL OR codigo='') AND nome_norm=?",
            (user_id, nome_norm)
        ).fetchone()

    if existente:
        conn.execute(
            '''UPDATE produtos_usuario SET nome=?, nome_norm=?, porcao=?, unidade=?, embalagem=?,
               carboidratos=?, acucares=?, fibras=?, proteinas=?, gorduras=?, calorias=?, atualizado_em=?
               WHERE id=? AND user_id=?''',
            (nome, nome_norm, d.get('porcao') or '', d.get('unidade') or '', d.get('embalagem') or '',
             *valores, agora, existente['id'], user_id)
        )
        novo_id = existente['id']
    else:
        total = conn.execute(
            'SELECT COUNT(*) AS n FROM produtos_usuario WHERE user_id=?', (user_id,)
        ).fetchone()['n']
        if total >= LIMITE_PRODUTOS_USUARIO:
            conn.close()
            return None
        novo_id = conn.execute(
            '''INSERT INTO produtos_usuario
               (user_id, codigo, nome, nome_norm, porcao, unidade, embalagem,
                carboidratos, acucares, fibras, proteinas, gorduras, calorias, criado_em, atualizado_em)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id''',
            (user_id, codigo, nome, nome_norm, d.get('porcao') or '', d.get('unidade') or '',
             d.get('embalagem') or '', *valores, agora, agora)
        ).fetchone()['id']
    conn.commit()
    conn.close()
    return novo_id


def produto_usuario_por_codigo(user_id, codigos):
    """Produto salvo pela conta pra qualquer uma das formas do código, ou None."""
    if not codigos:
        return None
    conn = get_connection()
    marcas = ','.join('?' for _ in codigos)
    row = conn.execute(
        f'SELECT * FROM produtos_usuario WHERE user_id=? AND codigo IN ({marcas}) '
        'ORDER BY atualizado_em DESC LIMIT 1',
        (user_id, *codigos)
    ).fetchone()
    conn.close()
    return _linha_produto(row) if row else None


def buscar_produtos_usuario(user_id, texto, limite=5):
    """Produtos da conta cujo nome contém todas as palavras da busca."""
    palavras = busca.tokens(texto)
    if not palavras:
        return []
    filtros = ' AND '.join('nome_norm LIKE ?' for _ in palavras)
    conn = get_connection()
    rows = conn.execute(
        f'SELECT * FROM produtos_usuario WHERE user_id=? AND {filtros} '
        'ORDER BY atualizado_em DESC LIMIT ?',
        (user_id, *[f'%{p}%' for p in palavras], limite)
    ).fetchall()
    conn.close()
    return [_linha_produto(r) for r in rows]


def listar_produtos_usuario(user_id, limite=200):
    conn = get_connection()
    rows = conn.execute(
        'SELECT * FROM produtos_usuario WHERE user_id=? ORDER BY nome_norm LIMIT ?', (user_id, limite)
    ).fetchall()
    conn.close()
    return [_linha_produto(r) for r in rows]


def remover_produto_usuario(id, user_id):
    conn = get_connection()
    conn.execute('DELETE FROM produtos_usuario WHERE id=? AND user_id=?', (id, user_id))
    conn.commit()
    conn.close()
