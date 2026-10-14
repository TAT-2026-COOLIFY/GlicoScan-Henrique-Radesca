# backend/data — bases de alimentos

| Arquivo | Conteúdo | Origem |
|---|---|---|
| `taco.csv` | ~580 alimentos genéricos, **valores por 100 g** | TACO 4ª ed. (NEPA/UNICAMP, 2011), valores impressos |
| `complementos.csv` | 3 itens que a TACO deixou sem carboidrato (leite integral/desnatado fluido, macarrão cozido) | USDA FoodData Central (IDs na coluna `fonte`) |
| `medidas.json` | medidas caseiras → gramas, 12 alimentos revisados | IBGE POF 2008-2009 |
| `gerar_medidas.py` | gera `medidas.json` a partir do CSV da POF | — |

## TACO (`taco.csv`)
- **Fonte original:** https://www.nepa.unicamp.br/taco/ (reprodução permitida citando a fonte).
- **Versão estruturada usada:** https://github.com/IgorFZ/taco-br (`data/taco4.json`, MIT,
  extraída do PDF oficial — `LICENSE-igorfz-taco-br`).
- **Verificação cruzada:** os 597 alimentos foram comparados com outra conversão independente
  (https://github.com/brolesi/taco, MIT): **0 divergências** (>0,6 g de carboidrato ou >3 kcal).
- **Descartados (15):** itens sem carboidrato informado (óleos, azeites, sal, cachaça, leite
  integral/desnatado fluido, iogurte de abacaxi, coco verde). Valor ausente nunca vira 0:
  dose zero sem aviso.

## Complementos (`complementos.csv`)
Rotulados na busca como "🇺🇸 USDA (complemento à TACO)". Valores: leite integral 4,8 g carbo/100 g
(#172217), desnatado 5,0 g (#171270), macarrão cozido 30,9 g (#169737).

## Medidas caseiras (`medidas.json`)
Só entram alimentos com uma linha de alimento/preparação da POF revisada à mão
(ver `MAPA` em `gerar_medidas.py`). O mesmo "colher de sopa" pesa diferente cru e cozido,
então não há mapeamento automático. Itens que destoavam (arroz integral colher de servir,
laranja unidade) foram deixados de fora. A tela avisa que é média e que, na dúvida, se pese.

## Bases avaliadas e **não** usadas
- **TBCA/USP:** consulta livre, mas uso em outra ferramenta exige licença; sem CSV/API aberta.
- **Dump do Open Food Facts:** na casa de GB; o plano gratuito do Render não comporta.
  A API ao vivo + "Meus produtos" + foto da tabela cobrem o buraco.
