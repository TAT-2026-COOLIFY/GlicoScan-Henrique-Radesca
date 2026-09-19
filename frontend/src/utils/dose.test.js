import { describe, it, expect } from 'vitest'
import { calcularDose, glicemiaParaMgdl, arredondarDose, umDecimal } from './dose'

const perfil = { ric: 15, alvo: 100, fs: 50 }

describe('calcularDose — só correção (alvo 100, FS 50)', () => {
  it('120 mg/dL: correção exata é 0,4 UI (o caso que gerou a dúvida)', () => {
    const r = calcularDose({ ...perfil, glicemiaMgdl: 120 })
    expect(r.correcao).toBeCloseTo(0.4)
    expect(r.total).toBe(0.5) // 0,4 arredondado ao passo de 0,5
  })

  it('na meta ou abaixo dela não dá dose', () => {
    expect(calcularDose({ ...perfil, glicemiaMgdl: 100 }).total).toBe(0)
    expect(calcularDose({ ...perfil, glicemiaMgdl: 80 }).total).toBe(0)
  })

  it('200 mg/dL: 2 UI, que baixariam ~100 mg/dL (FS 50)', () => {
    expect(calcularDose({ ...perfil, glicemiaMgdl: 200 }).total).toBe(2)
  })

  it('sem glicemia informada não corrige nada', () => {
    const r = calcularDose({ ...perfil, carboTotal: 30 })
    expect(r.correcao).toBe(0)
    expect(r.total).toBe(2)
  })
})

describe('calcularDose — refeição', () => {
  it('60 g com RIC 15 = 4 UI', () => {
    expect(calcularDose({ ...perfil, carboTotal: 60 }).total).toBe(4)
  })

  it('refeição + correção somam antes de arredondar', () => {
    // 30/15 = 2,0 + (150-100)/50 = 1,0
    expect(calcularDose({ ...perfil, carboTotal: 30, glicemiaMgdl: 150 }).total).toBe(3)
  })

  it('glicemia abaixo do alvo reduz a dose da refeição', () => {
    // 60/15 = 4,0 + (70-100)/50 = -0,6 → 3,4 → 3,5
    expect(calcularDose({ ...perfil, carboTotal: 60, glicemiaMgdl: 70 }).total).toBe(3.5)
  })

  it('a dose nunca é negativa', () => {
    expect(calcularDose({ ...perfil, carboTotal: 0, glicemiaMgdl: 60 }).total).toBe(0)
  })
})

describe('calcularDose — insulina ativa (IOB)', () => {
  it('desconta a IOB da dose', () => {
    // 3,0 de refeição+correção − 1,0 ativa
    expect(calcularDose({ ...perfil, carboTotal: 30, glicemiaMgdl: 150, iob: 1 }).total).toBe(2)
  })

  it('IOB grande zera a dose em vez de ficar negativa', () => {
    expect(calcularDose({ ...perfil, glicemiaMgdl: 140, iob: 3 }).total).toBe(0)
  })

  it('IOB pequena NÃO é jogada fora por arredondamento antes da conta', () => {
    // correção exata 0,8 − IOB 0,3 = 0,5 → 0,5. Com a IOB arredondada pra 0 daria 0,8 → 1.
    expect(calcularDose({ ...perfil, glicemiaMgdl: 140, iob: 0.3 }).total).toBe(0.5)
  })
})

describe('arredondarDose', () => {
  it('arredonda pro múltiplo de 0,5 mais próximo', () => {
    expect([0.2, 0.25, 0.4, 0.74, 0.75, 1.2].map(arredondarDose)).toEqual([0, 0.5, 0.5, 0.5, 1, 1])
  })
})

describe('glicemiaParaMgdl', () => {
  it('valor em mg/dL passa direto', () => {
    expect(glicemiaParaMgdl('120')).toBe(120)
  })

  it('valor abaixo de 30 é tratado como mmol/L e convertido', () => {
    expect(glicemiaParaMgdl('6,7')).toBe(121)
    expect(glicemiaParaMgdl('6.7')).toBe(121)
  })

  it('vazio, zero, negativo ou texto viram 0 (sem glicemia)', () => {
    expect(['', '0', '-5', 'abc'].map(glicemiaParaMgdl)).toEqual([0, 0, 0, 0])
  })
})

describe('umDecimal', () => {
  it('mostra a parcela exata em vez do passo de 0,5', () => {
    expect(umDecimal(0.4)).toBe(0.4)
    expect(umDecimal(3.3333)).toBe(3.3)
  })
})
