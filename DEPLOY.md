# Deploy do GlicoScan em produção

Guia passo a passo pra tirar o app do ngrok/localhost e colocar num link
fixo, público, sem depender do seu PC ligado.

**Combinação usada aqui:** Render (backend Flask, plano gratuito) +
Vercel (frontend React, plano gratuito). Ambos têm free tier suficiente
pra um TCC. Eu não consigo criar essas contas nem fazer o deploy por
você — isso exige login nas suas contas — mas todo o código e as
configs já estão prontos, é só seguir os passos abaixo.

---

## 0. Pré-requisito: subir o projeto pro GitHub

Se ainda não tem um repositório:

```bash
cd glicoscan-clean
git init
git add .
git commit -m "GlicoScan — versão organizada"
```

Cria um repositório novo no GitHub (pode ser privado) e sobe:

```bash
git remote add origin https://github.com/SEU_USUARIO/glicoscan.git
git push -u origin main
```

⚠️ **Confira antes de subir**: o arquivo `backend/.env` (com suas chaves
reais) **não deve** ir junto — ele já está listado no `.gitignore`, mas
vale conferir com `git status` que ele não aparece na lista de arquivos
a serem commitados.

---

## 1. Backend no Render

1. Cria uma conta em [render.com](https://render.com) (dá pra logar com GitHub)
2. **New +** → **Blueprint**
3. Conecta o repositório do GitHub que você acabou de criar
4. O Render vai detectar o arquivo `backend/render.yaml` automaticamente
   e configurar o serviço sozinho
5. Antes de finalizar, ele vai pedir pra preencher as variáveis de
   ambiente marcadas como `sync: false` — cola aqui os valores do seu
   `backend/.env`:
   - `OCR_API_KEY`
   - `FS_CLIENT_ID`
   - `FS_CLIENT_SECRET`
   - `APP_TOKEN` — **importante em produção**: invente um valor aleatório
     aqui (ex: uma senha longa qualquer). Sem isso, qualquer pessoa com a
     URL pública do Render lê seu histórico de dose/glicemia e pode
     apagar tudo, sem login nenhum. Anota esse valor — você vai colar o
     mesmo no Vercel no próximo passo.
   - `ALLOWED_ORIGINS` — deixa **em branco** por enquanto (libera geral).
     Você volta aqui no passo 6 pra travar na URL do Vercel, depois que
     ela existir.
6. Clica em **Apply** / **Create**. Vai levar uns 2-5 minutos pro primeiro deploy
7. Quando terminar, você vai ter uma URL tipo:
   `https://glicoscan-api.onrender.com`

   **Guarda essa URL** — você vai precisar dela no próximo passo.

⚠️ **Nota sobre o plano gratuito do Render**: o serviço "dorme" depois de
15 minutos sem uso, e a primeira requisição depois disso demora uns 30-50
segundos pra "acordar". Pra apresentação, é bom acessar o link uns minutos
antes de começar, só pra garantir que o backend já está "acordado".

---

## 2. Frontend no Vercel

1. Cria uma conta em [vercel.com](https://vercel.com) (dá pra logar com GitHub)
2. **Add New** → **Project** → seleciona o mesmo repositório
3. Na configuração do projeto:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite (o Vercel deve detectar sozinho)
   - **Build Command**: `npm run build` (padrão, não precisa mexer)
   - **Output Directory**: `dist` (padrão, não precisa mexer)
4. Em **Environment Variables**, adiciona:
   - `VITE_API_URL` = a URL do Render que você guardou no passo anterior
     (ex: `https://glicoscan-api.onrender.com`)
   - `VITE_APP_TOKEN` = o **mesmo** valor de `APP_TOKEN` que você definiu
     no Render — se os dois não baterem exatamente, o app carrega mas
     toda chamada à API volta 401 "Não autorizado"
5. Clica em **Deploy**

Depois de alguns minutos, você recebe um link público fixo, tipo
`https://glicoscan.vercel.app` — esse é o link que você acessa no
celular e apresenta pro seu orientador, sem precisar do ngrok nem do
seu PC ligado.

---

## 3. Travando o CORS na URL do Vercel (opcional, mas recomendado)

Agora que você tem a URL do Vercel, volta no Render:

1. Abre o serviço `glicoscan-api` → **Environment**
2. Edita `ALLOWED_ORIGINS`, cola a URL do Vercel (ex:
   `https://glicoscan.vercel.app`, **sem** barra `/` no final)
3. Salva — o Render redeploya sozinho em ~1 minuto

Sem esse passo o backend aceita chamada de qualquer origem (`*`), o que
funciona mas é mais aberto que o necessário — travar não custa nada.

---

## 4. Testando

1. Abre o link do Vercel no navegador do celular
2. Escaneia um produto — se aparecer o resultado, o backend e o
   frontend estão conversando direitinho
3. Se der erro de CORS ou "Failed to fetch": confere se o `VITE_API_URL`
   no Vercel está exatamente igual à URL do Render (sem barra `/` no final)
4. Se aparecer "Muitas requisições — aguarde um instante": é o rate limit
   (proteção contra abuso das APIs pagas de OCR/nutrição). Normal só se
   você escanear/buscar muitas vezes seguidas rápido — espera um minuto

---

## Resumo do que muda em relação ao ambiente local

| | Local (ngrok) | Produção (Render + Vercel) |
|---|---|---|
| Backend | `localhost:5000`, via proxy do Vite | URL fixa do Render |
| Frontend | `localhost:3000` | URL fixa do Vercel |
| Link muda a cada reinício? | Sim (ngrok free) | Não |
| Precisa do PC ligado? | Sim | Não |
| Banco de dados | Arquivo local `glicoscan.db` | Reseta a cada novo deploy no plano gratuito do Render (sem disco persistente) — ok pra demo, mas para produção real seria necessário Render Disk ou trocar para Postgres |
