import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { medico } from './medico'

function criarSessionStorageFalso() {
  let dados = {}
  return {
    getItem: (k) => (k in dados ? dados[k] : null),
    setItem: (k, v) => { dados[k] = String(v) },
    removeItem: (k) => { delete dados[k] },
    clear: () => { dados = {} },
  }
}

beforeEach(() => {
  globalThis.sessionStorage = criarSessionStorageFalso()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('medico — trava de edição por 15 minutos', () => {
  it('começa trancado (nada desbloqueado ainda)', () => {
    expect(medico.estaDesbloqueado()).toBe(false)
  })

  it('marcarDesbloqueado libera na hora', () => {
    medico.marcarDesbloqueado()
    expect(medico.estaDesbloqueado()).toBe(true)
  })

  it('trancar reverte o desbloqueio', () => {
    medico.marcarDesbloqueado()
    medico.trancar()
    expect(medico.estaDesbloqueado()).toBe(false)
  })

  it('expira sozinho depois de 15 minutos', () => {
    vi.useFakeTimers()
    medico.marcarDesbloqueado()
    expect(medico.estaDesbloqueado()).toBe(true)

    vi.advanceTimersByTime(15 * 60 * 1000 + 1)
    expect(medico.estaDesbloqueado()).toBe(false)
  })

  it('minutosRestantes conta pra baixo e não fica negativo', () => {
    vi.useFakeTimers()
    medico.marcarDesbloqueado()
    expect(medico.minutosRestantes()).toBe(15)

    vi.advanceTimersByTime(20 * 60 * 1000)
    expect(medico.minutosRestantes()).toBe(0)
  })
})
