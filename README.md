# GlicoScan

Calculadora de dose de insulina para pessoas com Diabetes Tipo 1 (DM1), a partir
da leitura de código de barras ou foto da tabela nutricional de alimentos.

TCC — Curso de Análise e Desenvolvimento de Sistemas (ADS), FEMA.

## Arquitetura

```
frontend/          React + Vite (SPA)
  src/
    theme.js          → paleta de cores centralizada
    constants.js       → dados fixos (tipos de insulina, perfil padrão)
    api.js              → endereço base da API + apiFetch (injeta o header de autenticação)
    utils/
      nutrition.js     → regras de negócio puras (validação de valores, descrição de porções)
      storage.js        → persistência de PERFIS (plural) no localStorage — ver seção "Perfis"
      *.test.js          → testes unitários (vitest) desses dois arquivos acima
    components/
      Layout.jsx        → Header (mostra perfil ativo), BottomNav, Card
      ScanTab.jsx        → aba de escaneamento + busca manual
      Calculadora.jsx    → confirmação de dados + cálculo de dose
      PerfilTab.jsx      → seletor de perfil + configuração (RIC, FS, alvo, insulina)
      HistTab.jsx        → histórico + estatísticas + gráfico (filtrado por perfil ativo)
    BarcodeScanner.jsx  → captura de câmera (3 modos, ver abaixo)
    App.jsx              → orquestrador (troca de abas, toast)
    main.jsx              → ponto de entrada
  public/
    sw.js               → Service Worker (cache pra uso offline — ver seção "PWA offline")

backend/            Flask + SQLite (API REST)
  config.py          → chaves de API, configuração, APP_TOKEN opcional
  database.py         → acesso ao SQLite (histórico + cache), histórico separado por perfil
  parsing.py           → interpretação do texto extraído por OCR
  services/
    openfoodfacts.py  → 1ª fonte de dados nutricionais
    usda.py             → 2ª fonte (fallback, match exato de código de barras)
    fatsecret.py        → busca complementar por nome
    ocr.py               → extração de texto de fotos (dual engine)
  routes.py             → endpoints HTTP + trava por APP_TOKEN
  server.py             → ponto de entrada (cria o app Flask)
  tests/               → testes automatizados (pytest)
```

## Fluxo principal (escanear produto)

1. `BarcodeScanner.jsx` captura o código de barras pela câmera
   - Android: usa a API nativa `BarcodeDetector` (mais rápida)
   - iPhone: usa a biblioteca `html5-qrcode` (o Safari não tem `BarcodeDetector`)
   - Fallback: captura de foto + decodificação, para navegadores sem suporte a câmera ao vivo
2. Frontend chama `GET /barcode?code=...`
3. Backend busca em cascata (para no primeiro que encontrar dados válidos):
   1. Open Food Facts (4 endpoints — a API é instável, então tenta vários espelhos)
   2. CalorieAPI (opcional)
   3. USDA — **só aceita match exato de código de barras**, nunca por nome parecido
      (decisão tomada após um teste real trazer produto errado por similaridade)
   4. Cache local (SQLite), fresco ou antigo, como último recurso
4. Usuário confirma/corrige os valores nutricionais na `Calculadora.jsx`
5. App calcula a dose com o RIC/FS/alvo do **perfil ativo no momento** (ver seção "Perfis"):
   `dose = (carboidratos / RIC) + (glicemia_atual - glicemia_alvo) / fator_sensibilidade`
6. Resultado pode ser salvo no histórico (`POST /historico`), já marcado com o nome do perfil ativo

## Fluxo alternativo (foto da tabela nutricional)

Quando o produto não tem código de barras reconhecido, o usuário fotografa a
tabela nutricional. O backend roda dois motores de OCR em paralelo
(`services/ocr.py`), escolhe o de melhor pontuação (ou mescla os dois), e o
`parsing.py` interpreta o texto bruto com expressões regulares para extrair
carboidratos, calorias, proteínas etc.

## Bugs relevantes encontrados e corrigidos durante o desenvolvimento

Documentado aqui porque foi um processo de depuração real e vale como
material de discussão técnica:

1. **`localStorage` corrompido derrubando o app inteiro.** `JSON.parse` sem
   tratamento de erro no `storage.getProfile()` lançava exceção não
   capturada durante o render — como o React não tinha Error Boundary, a
   árvore inteira desmontava e a tela ficava em branco/preta sem nenhuma
   mensagem de erro visível. Corrigido com `try/catch` e reset automático
   para o perfil padrão.

2. **`scanner.stop()` chamado duas vezes no modo iPhone (`html5-qrcode`).**
   Ao detectar um código, tanto o callback de detecção quanto o `cleanup`
   do `useEffect` (disparado pelo desmonte do componente) chamavam
   `stop()`. Na segunda chamada, a biblioteca lança um erro **síncrono**
   ("Cannot stop, scanner is not running or paused"), que um simples
   `.catch()` não captura (`.catch` só funciona em cima de uma Promise).
   Corrigido com uma flag de controle (`stopped`) garantindo que `stop()`
   rode no máximo uma vez, dentro de um `try/catch` de verdade.

3. **Número colado na unidade sumia da extração do OCR.** Em
   `parsing._numeros_da_linha`, o regex era `\b(\d+[,.]?\d*)\b` — com `\b`
   nos dois lados. Só que dígito e letra são ambos `\w`, então não existe
   *boundary* entre eles: em `"20g"` (sem espaço antes da unidade, comum
   no texto bruto do OCR.Space), o `\b` final simplesmente nunca casava, e
   o número "20" desaparecia da lista — o parser então pegava o valor de
   %VD ou do 100g por engano. Encontrado escrevendo os testes automatizados
   de `parsing.py` (ver `backend/tests/test_parsing.py`). Corrigido
   removendo o `\b` final — desnecessário, já que o `\b` inicial já garante
   que o match começa no início do número.

## Como rodar

```
instalar.bat   # primeira vez apenas — instala dependências
RODAR.bat      # sobe backend (porta 5000), frontend (porta 3000) e túnel ngrok
```

O `vite.config.js` faz proxy de `/barcode`, `/historico`, `/stats` etc. da
porta 3000 (frontend) para a porta 5000 (backend), então o app funciona como
uma unidade só do ponto de vista do navegador — inclusive pelo celular via
ngrok.

### Testes automatizados

```
cd backend  && pip install -r requirements-dev.txt && pytest       # 24 testes
cd frontend && npm test                                            # 22 testes (vitest)
```

## Melhorias de robustez (pós-MVP)

Depois de fechar o MVP funcional, estas melhorias foram priorizadas
pensando em estabilidade na apresentação, segurança e uso por mais de
uma pessoa:

1. **Error Boundary** (`components/ErrorBoundary.jsx`) — contém qualquer
   crash futuro numa tela de erro amigável, em vez de derrubar o app
   inteiro sem explicação (proteção permanente contra o tipo de bug
   documentado na seção anterior).

2. **Chaves de API fora do código-fonte** — `config.py` agora usa
   `python-dotenv` e não tem mais nenhuma chave real hardcoded. As
   chaves ficam só no `backend/.env` (nunca commitado — está no
   `.gitignore`), com um `.env.example` de modelo pra quem for clonar
   o projeto.

3. **Validação do formulário de perfil** — `PerfilTab.jsx` agora impede
   salvar RIC ou Fator de Sensibilidade iguais a zero (o cálculo da
   dose divide por esses valores) e valida a faixa de glicemia alvo,
   com mensagem de erro inline.

4. **Pronto para deploy em nuvem** — `API_BASE` configurável via
   variável de ambiente (`VITE_API_URL`), `requirements.txt` +
   `render.yaml` pro backend, porta configurável via `PORT`. Ver
   `DEPLOY.md` para o passo a passo completo (Render + Vercel, ambos
   com plano gratuito).

5. **Testes automatizados** — `backend/tests/` (pytest, 24 testes) cobre
   o parser de OCR (incluindo o bug do item 3 acima), a validação de
   `/historico`, a trava por token e a separação de histórico por perfil.
   `frontend/src/utils/*.test.js` (vitest, 22 testes) cobre as regras de
   negócio puras e toda a lógica de perfis.

6. **App funciona offline (PWA de verdade)** — `frontend/public/sw.js`
   cacheia o app shell (stale-while-revalidate) e a última resposta de
   cada rota da API (network-first com fallback pro cache). Testado
   derrubando backend e frontend juntos e recarregando a página: o app
   abre normal, do cache.

7. **Autenticação simples por token (`APP_TOKEN`)** — sem isso, qualquer
   pessoa com a URL pública do Render lia `/historico` (dose de insulina,
   glicemia) e podia apagar tudo, sem login nenhum. Opcional em dev local
   (fica desativada se a variável não existir); **recomendado em produção**
   — ver `DEPLOY.md`. Frontend manda o token no header `X-App-Token`
   (`frontend/src/api.js`); backend confere em `routes.py`.

## Perfis (família no mesmo aparelho)

O app suporta múltiplos perfis — pensado pra família usando o mesmo
celular/computador, cada pessoa com sua própria "regulagem" (RIC, tipo de
insulina, glicemia alvo, fator de sensibilidade). **Não é sistema de login**:
qualquer um com acesso ao aparelho troca de perfil livremente, sem senha —
o controle é de dado, não de segurança entre pessoas.

- Perfis ficam no `localStorage` do navegador (`utils/storage.js`), trocáveis
  pela aba Config. Quem já usava o app antes dessa feature é migrado
  automaticamente pra um perfil chamado "Perfil 1", sem perder a regulagem.
- O histórico (`backend/database.py`) é gravado com o nome do perfil ativo e
  filtrado por ele nas consultas (`GET /historico?perfil=...`). Linhas salvas
  antes dessa feature (sem perfil gravado) aparecem automaticamente sob
  "Perfil 1", pelo mesmo motivo da migração acima.
