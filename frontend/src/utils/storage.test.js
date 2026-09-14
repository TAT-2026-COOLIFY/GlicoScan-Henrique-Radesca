import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock mínimo de localStorage (o ambiente de teste roda em Node puro, sem
// DOM — mais leve que puxar jsdom/happy-dom só por causa desse arquivo).
function criarLocalStorageFalso() {
  let dados = {}
  return {
    getItem: (k) => (k in dados ? dados[k] : null),
    setItem: (k, v) => { dados[k] = String(v) },
    removeItem: (k) => { delete dados[k] },
    clear: () => { dados = {} },
  }
}

beforeEach(() => {
  globalThis.localStorage = criarLocalStorageFalso()
  vi.resetModules() // storage.js guarda migração dentro de closures dos testes — zera o módulo entre casos
})

// storage é importado dinamicamente em cada teste (depois do localStorage
// falso estar no ar) pra evitar import de nível de módulo antes do mock.
async function getStorage() {
  const mod = await import('./storage')
  return mod.storage
}

describe('storage — perfil único (primeiro uso)', () => {
  it('cria "Perfil 1" com valores padrão quando não há nada salvo', async () => {
    const storage = await getStorage()
    const ativo = storage.getPerfilAtivo()
    expect(ativo.nome).toBe('Perfil 1')
    expect(ativo.ric).toBe(15)
  })

  it('listarPerfis devolve só esse perfil inicial', async () => {
    const storage = await getStorage()
    expect(storage.listarPerfis()).toHaveLength(1)
  })
})

describe('storage — migração do formato antigo (perfil único, chave gs_p)', () => {
  it('herda os valores do perfil antigo em vez do padrão', async () => {
    localStorage.setItem('gs_p', JSON.stringify({ ric: 8, insulin: 'Regular', alvo: 110, fs: 40 }))
    const storage = await getStorage()
    const ativo = storage.getPerfilAtivo()
    expect(ativo.nome).toBe('Perfil 1')
    expect(ativo.ric).toBe(8)
    expect(ativo.insulin).toBe('Regular')
  })

  it('não migra de novo se o formato novo já existe', async () => {
    localStorage.setItem('gs_p', JSON.stringify({ ric: 8 }))
    localStorage.setItem('gs_perfis', JSON.stringify({ ativoId: 'x', perfis: { x: { nome: 'Já Migrado', ric: 99, insulin: 'Regular', alvo: 100, fs: 50 } } }))
    const storage = await getStorage()
    expect(storage.getPerfilAtivo().nome).toBe('Já Migrado')
    expect(storage.getPerfilAtivo().ric).toBe(99)
  })
})

describe('storage — múltiplos perfis', () => {
  it('criarPerfil adiciona um novo perfil e já o torna ativo', async () => {
    const storage = await getStorage()
    const id = storage.criarPerfil('Ana')
    expect(storage.getPerfilAtivo().id).toBe(id)
    expect(storage.getPerfilAtivo().nome).toBe('Ana')
    expect(storage.listarPerfis()).toHaveLength(2)
  })

  it('definirPerfilAtivo troca qual perfil está ativo', async () => {
    const storage = await getStorage()
    const original = storage.getPerfilAtivo().id
    const novoId = storage.criarPerfil('Ana')

    storage.definirPerfilAtivo(original)
    expect(storage.getPerfilAtivo().id).toBe(original)

    storage.definirPerfilAtivo(novoId)
    expect(storage.getPerfilAtivo().id).toBe(novoId)
  })

  it('definirPerfilAtivo ignora id inexistente (mantém o perfil ativo atual)', async () => {
    const storage = await getStorage()
    const original = storage.getPerfilAtivo().id
    storage.definirPerfilAtivo('id-que-nao-existe')
    expect(storage.getPerfilAtivo().id).toBe(original)
  })

  it('salvarPerfil altera só os campos daquele perfil, sem afetar os outros', async () => {
    const storage = await getStorage()
    const p1 = storage.getPerfilAtivo().id
    const p2 = storage.criarPerfil('Ana')

    storage.salvarPerfil(p2, { nome: 'Ana', ric: 20, insulin: 'Regular', alvo: 120, fs: 30 })

    expect(storage.getPerfilAtivo().ric).toBe(20) // Ana continua ativo
    storage.definirPerfilAtivo(p1)
    expect(storage.getPerfilAtivo().ric).toBe(15) // Perfil 1 não foi tocado
  })

  it('removerPerfil apaga o perfil e promove outro a ativo se o removido era o ativo', async () => {
    const storage = await getStorage()
    const p1 = storage.getPerfilAtivo().id
    const p2 = storage.criarPerfil('Ana') // Ana fica ativa

    const removeu = storage.removerPerfil(p2)

    expect(removeu).toBe(true)
    expect(storage.listarPerfis()).toHaveLength(1)
    expect(storage.getPerfilAtivo().id).toBe(p1)
  })

  it('removerPerfil recusa apagar o último perfil restante', async () => {
    const storage = await getStorage()
    const unico = storage.getPerfilAtivo().id
    const removeu = storage.removerPerfil(unico)

    expect(removeu).toBe(false)
    expect(storage.listarPerfis()).toHaveLength(1)
  })
})

describe('storage — PIN por perfil', () => {
  it('perfil novo não tem PIN (livre pra trocar)', async () => {
    const storage = await getStorage()
    const id = storage.getPerfilAtivo().id
    expect(storage.perfilTemPin(id)).toBe(false)
    expect(await storage.verificarPin(id, 'qualquer coisa')).toBe(true)
  })

  it('definirPin passa a exigir o PIN certo', async () => {
    const storage = await getStorage()
    const id = storage.getPerfilAtivo().id
    await storage.definirPin(id, '1234')

    expect(storage.perfilTemPin(id)).toBe(true)
    expect(await storage.verificarPin(id, '1234')).toBe(true)
    expect(await storage.verificarPin(id, '0000')).toBe(false)
  })

  it('não guarda o PIN em texto puro', async () => {
    const storage = await getStorage()
    const id = storage.getPerfilAtivo().id
    await storage.definirPin(id, '1234')

    const bruto = localStorage.getItem('gs_perfis')
    expect(bruto).not.toContain('1234')
  })

  it('removerPin libera o perfil de novo', async () => {
    const storage = await getStorage()
    const id = storage.getPerfilAtivo().id
    await storage.definirPin(id, '1234')
    storage.removerPin(id)

    expect(storage.perfilTemPin(id)).toBe(false)
    expect(await storage.verificarPin(id, 'errado')).toBe(true)
  })

  it('PIN de um perfil não afeta o de outro', async () => {
    const storage = await getStorage()
    const p1 = storage.getPerfilAtivo().id
    const p2 = storage.criarPerfil('Ana')
    await storage.definirPin(p2, '9999')

    expect(storage.perfilTemPin(p1)).toBe(false)
    expect(storage.perfilTemPin(p2)).toBe(true)
  })
})

describe('storage — dado corrompido no localStorage', () => {
  it('reseta pro padrão em vez de quebrar quando gs_perfis tem JSON inválido', async () => {
    localStorage.setItem('gs_perfis', '{ isso não é json')
    const storage = await getStorage()
    expect(() => storage.getPerfilAtivo()).not.toThrow()
    expect(storage.getPerfilAtivo().nome).toBe('Perfil 1')
  })
})
