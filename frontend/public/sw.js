// ─────────────────────────────────────────────────────────────────
// sw.js — Service Worker do GlicoScan (cache pra uso offline)
// ─────────────────────────────────────────────────────────────────
// Versão anterior deste arquivo era "kamikaze": só existia pra matar
// um SW antigo (cache-first) que servia versões velhas do app depois
// de deploy. Ela já rodou/rodará uma vez em cada aparelho que tinha o
// SW velho instalado e se autodesregistra — então é seguro registrar
// este SW novo por cima: em quem ainda tem o kamikaze, ele primeiro
// desregistra, e na visita seguinte este arquivo é buscado de novo e
// instalado do zero.
//
// Estratégia por tipo de requisição:
//   navegação (recarregar o app)     → network-first, cai pro cache se offline
//   API do backend (GET)             → network-first, cai pro último resultado salvo
//   assets estáticos (JS/CSS/img)    → stale-while-revalidate (mostra cache na hora,
//                                       atualiza em segundo plano)
// POST/DELETE nunca são interceptados — sempre vão direto pra rede.

const CACHE_VERSION = 'glicoscan-v3'
const CAMINHOS_API = ['/barcode', '/buscar', '/historico', '/stats', '/health']

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const chaves = await caches.keys()
      await Promise.all(chaves.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

function ehChamadaDeApi(url, method) {
  if (method !== 'GET') return false
  return CAMINHOS_API.some(p => url.pathname === p || url.pathname.startsWith(`${p}/`))
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION)
  try {
    const resposta = await fetch(request)
    if (resposta && resposta.ok) cache.put(request, resposta.clone())
    return resposta
  } catch (erro) {
    const cacheada = await cache.match(request)
    if (cacheada) return cacheada
    throw erro
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION)
  const cacheada = await cache.match(request)

  const buscaNaRede = fetch(request)
    .then(resposta => {
      if (resposta && (resposta.ok || resposta.type === 'opaque')) {
        cache.put(request, resposta.clone())
      }
      return resposta
    })
    .catch(() => null)

  return cacheada || (await buscaNaRede) || Response.error()
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  if (url.origin === self.location.origin && ehChamadaDeApi(url, request.method)) {
    event.respondWith(networkFirst(request))
    return
  }

  event.respondWith(staleWhileRevalidate(request))
})
