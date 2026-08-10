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
    utils/
      nutrition.js     → regras de negócio puras (validação de valores, descrição de porções)
      storage.js        → persistência do perfil no localStorage
    components/
      Layout.jsx        → Header, BottomNav, Card (peças reutilizáveis)
      ScanTab.jsx        → aba de escaneamento + busca manual
      Calculadora.jsx    → confirmação de dados + cálculo de dose
      PerfilTab.jsx      → configuração do perfil do usuário
      HistTab.jsx        → histórico + estatísticas + gráfico
    BarcodeScanner.jsx  → captura de câmera (3 modos, ver abaixo)
    App.jsx              → orquestrador (troca de abas, toast)
    main.jsx              → ponto de entrada

backend/            Flask + SQLite (API REST)
  config.py          → chaves de API e configuração
  database.py         → acesso ao SQLite (histórico + cache)
  parsing.py           → interpretação do texto extraído por OCR
  services/
    openfoodfacts.py  → 1ª fonte de dados nutricionais
    usda.py             → 2ª fonte (fallback, match exato de código de barras)
    fatsecret.py        → busca complementar por nome
    ocr.py               → extração de texto de fotos (dual engine)
  routes.py             → endpoints HTTP
  server.py             → ponto de entrada (cria o app Flask)
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
5. App calcula a dose: `dose = (carboidratos / RIC) + (glicemia_atual - glicemia_alvo) / fator_sensibilidade`
6. Resultado pode ser salvo no histórico (`POST /historico`)

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

## Como rodar

```
instalar.bat   # primeira vez apenas — instala dependências
RODAR.bat      # sobe backend (porta 5000), frontend (porta 3000) e túnel ngrok
```

O `vite.config.js` faz proxy de `/barcode`, `/historico`, `/stats` etc. da
porta 3000 (frontend) para a porta 5000 (backend), então o app funciona como
uma unidade só do ponto de vista do navegador — inclusive pelo celular via
ngrok.

## Melhorias de robustez (pós-MVP)

Depois de fechar o MVP funcional, quatro melhorias foram priorizadas
pensando em estabilidade na apresentação e boas práticas de segurança:

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
