import { describe, it, expect } from 'vitest'
import { valorSuspeito, gerarDescricao } from './nutrition'

describe('valorSuspeito', () => {
  it('acusa carboidrato maior que o peso da porção', () => {
    expect(valorSuspeito('carboidratos', 35, '30g')).toBe(true)
  })

  it('não acusa carboidrato dentro do peso da porção', () => {
    expect(valorSuspeito('carboidratos', 20, '30g')).toBe(false)
  })

  it('acusa carboidrato acima de 150g mesmo sem porção conhecida', () => {
    expect(valorSuspeito('carboidratos', 200, null)).toBe(true)
  })

  it('acusa caloria acima de 900 kcal', () => {
    expect(valorSuspeito('calorias', 950, '100g')).toBe(true)
  })

  it('não acusa caloria plausível', () => {
    expect(valorSuspeito('calorias', 140, '30g')).toBe(false)
  })

  it('ignora valor nulo', () => {
    expect(valorSuspeito('carboidratos', null, '30g')).toBe(false)
  })
})

describe('gerarDescricao', () => {
  it('multiplica unidade contável (biscoitos) pelas porções', () => {
    expect(gerarDescricao(2, '30g', '3 biscoitos')).toBe('6 biscoitos')
  })

  it('usa singular quando o total dá 1', () => {
    expect(gerarDescricao(0.5, '30g', '2 fatias')).toBe('1 fatia')
  })

  it('cai pra gramas quando não tem unidade contável', () => {
    expect(gerarDescricao(2, '30g', '')).toBe('60g')
  })

  it('cai pra mililitros quando a porção é líquida', () => {
    expect(gerarDescricao(3, '150ml', '')).toBe('450ml')
  })

  it('usa fallback genérico quando não há porção nem unidade', () => {
    expect(gerarDescricao(2, '—', '—')).toBe('2 porção(ões)')
  })
})
