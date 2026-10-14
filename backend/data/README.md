# data/taco.csv

Alimentos genéricos brasileiros, **valores por 100 g**, usados na busca por nome
(`backend/services/taco.py`).

- **Fonte original:** Tabela Brasileira de Composição de Alimentos (TACO), 4ª edição
  revisada e ampliada, NEPA/UNICAMP, 2011 — https://www.nepa.unicamp.br/taco/
- **Versão estruturada:** https://github.com/brolesi/taco
  (`data/processed/taco/taco_composicao.csv`, licença MIT — ver `LICENSE-brolesi-taco`)
- **Conversão:** só as colunas usadas pelo app; valores com 1 casa decimal; alimentos
  **sem carboidrato informado foram descartados** (ausente não vira 0: dose zero sem aviso).
  15 itens ficaram de fora, todos óleos/azeites.
- **Conferência:** `backend/tests/test_taco_dados_reais.py` compara 7 alimentos comuns
  com os valores oficiais.
