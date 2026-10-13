import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest


@pytest.fixture(autouse=True)
def _sempre_sqlite(monkeypatch):
    """Testes nunca tocam o Postgres de produção, mesmo com DATABASE_URL no .env."""
    import database
    monkeypatch.setattr(database, 'DATABASE_URL', '')
