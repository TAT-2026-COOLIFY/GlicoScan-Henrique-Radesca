import { describe, it, expect } from 'vitest'
import { detectarPadroes } from './padroes'

function item(hora, glicemia) {
  return { hora, glicemia_atual: glicemia }
}

describe('detectarPadroes', () => {
  it('sem histórico, nenhum padrão', () => {
    expect(detectarPadroes([])).toEqual([])
  })

  it('não acusa nada abaixo do mínimo de ocorrências', () => {
    const historico = [item('07:00', 65), item('08:00', 60)] // só 2x
    expect(detectarPadroes(historico, 3)).toEqual([])
  })

  it('acusa hipoglicemia recorrente de manhã ao bater o mínimo', () => {
    const historico = [item('07:00', 65), item('08:00', 60), item('07:30', 68)]
    const padroes = detectarPadroes(historico, 3)
    expect(padroes).toEqual([{ tipo: 'hipo', periodo: 'manhã', ocorrencias: 3 }])
  })

  it('acusa hiperglicemia separado de hipoglicemia, mesmo período', () => {
    const historico = [
      item('19:00', 220), item('20:00', 210), item('19:30', 230), // hiper à noite
      item('18:30', 60), item('19:15', 55), item('20:15', 65),    // hipo à noite
    ]
    const padroes = detectarPadroes(historico, 3)
    expect(padroes).toContainEqual({ tipo: 'hiper', periodo: 'noite', ocorrencias: 3 })
    expect(padroes).toContainEqual({ tipo: 'hipo', periodo: 'noite', ocorrencias: 3 })
  })

  it('glicemia normal (70-180) nunca conta como padrão', () => {
    const historico = Array.from({ length: 10 }, () => item('08:00', 110))
    expect(detectarPadroes(historico, 3)).toEqual([])
  })

  it('linha sem glicemia registrada é ignorada', () => {
    const historico = [item('08:00', 0), item('08:00', null), item('08:00', undefined)]
    expect(detectarPadroes(historico, 1)).toEqual([])
  })

  it('ordena os padrões do mais frequente pro menos frequente', () => {
    const historico = [
      item('07:00', 65), item('07:00', 65), item('07:00', 65), item('07:00', 65), // 4x hipo manhã
      item('19:00', 220), item('19:00', 220), item('19:00', 220),                 // 3x hiper noite
    ]
    const padroes = detectarPadroes(historico, 3)
    expect(padroes[0]).toEqual({ tipo: 'hipo', periodo: 'manhã', ocorrencias: 4 })
    expect(padroes[1]).toEqual({ tipo: 'hiper', periodo: 'noite', ocorrencias: 3 })
  })
})
