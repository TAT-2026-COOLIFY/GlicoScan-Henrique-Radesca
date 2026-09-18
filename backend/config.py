"""
config.py — Configuração central do GlicoScan (chaves de API, caminhos)
─────────────────────────────────────────────────────────────────────
As chaves de API SEMPRE vêm de variáveis de ambiente (arquivo .env,
que NUNCA deve ser commitado no Git — ver .gitignore). Não existe
mais fallback com chave real hardcoded no código: se faltar alguma
chave, o app avisa no terminal em vez de silenciosamente usar uma
chave de outra pessoa.

Use o .env.example como modelo: copie pra .env e preencha com suas
próprias chaves.
"""
import os
from dotenv import load_dotenv

load_dotenv()  # carrega o arquivo .env (se existir) para as variáveis de ambiente

OCR_API_KEY      = os.environ.get('OCR_API_KEY', '')
FS_CLIENT_ID     = os.environ.get('FS_CLIENT_ID', '')
FS_CLIENT_SECRET = os.environ.get('FS_CLIENT_SECRET', '')
CALORIE_API_KEY  = os.environ.get('CALORIE_API_KEY', '')  # opcional

# Login por conta (Supabase Auth). Sem SUPABASE_URL a API roda aberta,
# com todos os dados num único usuário "local" — só serve pra dev local.
# Em produção SEMPRE configurar: é o que separa o histórico de cada pessoa.
# SUPABASE_KEY é a chave "publishable" (pública por design).
SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY', '')

# Senha mestra do médico — desbloqueia edição de RIC/insulina/glicemia
# alvo/fator de sensibilidade (só leitura sem ela). Não é por perfil:
# é uma senha única que qualquer médico usa, em qualquer aparelho, pra
# liberar a edição temporariamente. Vazio = trava desativada (config
# fica sempre editável — comportamento antigo, útil em dev local).
DOCTOR_PASSWORD = os.environ.get('DOCTOR_PASSWORD', '')

# Origens liberadas pro CORS, separadas por vírgula (ex: a URL do Vercel
# em produção). '*' (padrão) libera geral — ok em dev local, mas em
# produção é melhor travar pro domínio do frontend (ver DEPLOY.md).
ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS') or '*'


def parse_origins(valor):
    """'*' vira '*' (flask-cors entende como 'libera geral'); senão vira lista, sem espaços/vazios."""
    if valor == '*':
        return '*'
    return [o.strip() for o in valor.split(',') if o.strip()]


CORS_ORIGINS = parse_origins(ALLOWED_ORIGINS)

_CHAVES_OBRIGATORIAS = {
    'OCR_API_KEY': OCR_API_KEY,
    'FS_CLIENT_ID': FS_CLIENT_ID,
    'FS_CLIENT_SECRET': FS_CLIENT_SECRET,
}
_faltando = [nome for nome, valor in _CHAVES_OBRIGATORIAS.items() if not valor]
if _faltando:
    print(f"⚠️  Faltam variáveis de ambiente no .env: {', '.join(_faltando)}")
    print("   Copie backend/.env.example para backend/.env e preencha suas chaves.")

OCR_URL        = 'https://api.ocr.space/parse/image'
OFF_SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl'
FS_TOKEN_URL   = 'https://oauth.fatsecret.com/connect/token'
FS_API_URL     = 'https://platform.fatsecret.com/rest/server.api'

# Endpoints do Open Food Facts em cascata: tenta na ordem até um responder
OFF_BARCODE_ENDPOINTS = [
    'https://world.openfoodfacts.net/api/v2/product/{code}?fields=product_name,product_name_pt,brands,nutriments,serving_size,serving_quantity,image_small_url,categories_tags',
    'https://world.openfoodfacts.org/api/v2/product/{code}?fields=product_name,product_name_pt,brands,nutriments,serving_size,serving_quantity,image_small_url,categories_tags',
    'https://world.openfoodfacts.net/api/v0/product/{code}.json',
    'https://br.openfoodfacts.org/api/v0/product/{code}.json',
]

# Em produção (Render, Railway etc.) normalmente não há disco persistente
# garantido — use um volume/persistent disk se quiser manter o SQLite
# entre deploys. Para desenvolvimento local, fica ao lado deste arquivo.
DB_PATH = os.environ.get('DB_PATH', os.path.join(os.path.dirname(__file__), 'glicoscan.db'))
