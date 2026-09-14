import { describe, it, expect } from 'vitest'
import { calcularIOB } from './iob'

const AGORA = new Date(2026, 8, 14, 12, 0) // 14/09/2026 12:00

describe('calcularIOB', () => {
  it('sem histórico, IOB é zero', () => {
    expect(calcularIOB([], 4, AGORA)).toBe(0)
  })

  it('dose de 1h atrás (duração 4h) ainda tem 75% ativa', () => {
    const historico = [{ dose: 4, data: '14/09/2026', hora: '11:00' }]
    expect(calcularIOB(historico, 4, AGORA)).toBeCloseTo(3, 5) // 4 * (1 - 1/4)
  })

  it('dose já fora da duração (mais velha que a insulina age) não conta', () => {
    const historico = [{ dose: 10, data: '14/09/2026', hora: '07:00' }] // 5h atrás, duração 4h
    expect(calcularIOB(historico, 4, AGORA)).toBe(0)
  })

  it('dose no futuro (relógio do aparelho errado, etc) não conta', () => {
    const historico = [{ dose: 10, data: '14/09/2026', hora: '13:00' }]
    expect(calcularIOB(historico, 4, AGORA)).toBe(0)
  })

  it('soma várias doses recentes', () => {
    const historico = [
      { dose: 4, data: '14/09/2026', hora: '11:00' }, // 1h atrás → 75% de 4 = 3
      { dose: 2, data: '14/09/2026', hora: '11:30' }, // 30min atrás → 87.5% de 2 = 1.75
    ]
    expect(calcularIOB(historico, 4, AGORA)).toBeCloseTo(4.75, 5)
  })

  it('linha de histórico sem data/hora válida é ignorada, não quebra', () => {
    const historico = [{ dose: 5, data: '', hora: '' }, { dose: 3, data: '14/09/2026', hora: '11:30' }]
    expect(() => calcularIOB(historico, 4, AGORA)).not.toThrow()
    expect(calcularIOB(historico, 4, AGORA)).toBeCloseTo(2.625, 5)
  })

  it('duração zero ou ausente devolve zero (evita divisão por zero)', () => {
    const historico = [{ dose: 4, data: '14/09/2026', hora: '11:00' }]
    expect(calcularIOB(historico, 0, AGORA)).toBe(0)
  })
})
