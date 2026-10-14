import { describe, it, expect } from 'vitest'
import { valorSuspeito, gerarDescricao, gramasParaPorcoes, porcoesParaGramas, gramasDeMedida } from './nutrition'

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

describe('gramasParaPorcoes / porcoesParaGramas (alimentos por 100g)', () => {
  it('converte gramas em porções de 100g', () => {
    expect(gramasParaPorcoes(150)).toBe(1.5)
    expect(gramasParaPorcoes('30')).toBe(0.3)
    expect(gramasParaPorcoes('87,5')).toBe(0.88)
  })

  it('texto inválido, zero ou negativo viram 0', () => {
    expect(gramasParaPorcoes('')).toBe(0)
    expect(gramasParaPorcoes('abc')).toBe(0)
    expect(gramasParaPorcoes(0)).toBe(0)
    expect(gramasParaPorcoes(-20)).toBe(0)
  })

  it('limita a 5000g (50 porções) pra um dedo escorregado não gerar dose absurda', () => {
    expect(gramasParaPorcoes(999999)).toBe(50)
  })

  it('porcoesParaGramas é o inverso', () => {
    expect(porcoesParaGramas(1.5)).toBe(150)
    expect(porcoesParaGramas(0.3)).toBe(30)
    expect(porcoesParaGramas(undefined)).toBe(0)
  })
})

describe('gramasDeMedida (medidas caseiras)', () => {
  it('multiplica a quantidade pelo peso da medida', () => {
    expect(gramasDeMedida(2, 45)).toBe(90)
    expect(gramasDeMedida('1,5', 25)).toBe(38)
    expect(gramasDeMedida('0.5', 140)).toBe(70)
  })

  it('entrada inválida vira 0', () => {
    expect(gramasDeMedida('', 45)).toBe(0)
    expect(gramasDeMedida(2, 0)).toBe(0)
    expect(gramasDeMedida(-1, 45)).toBe(0)
    expect(gramasDeMedida('abc', 45)).toBe(0)
    expect(gramasDeMedida(2, undefined)).toBe(0)
  })
})
