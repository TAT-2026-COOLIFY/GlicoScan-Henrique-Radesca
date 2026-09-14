import { describe, it, expect } from 'vitest'
import { gerarCSV } from './exportar'

describe('gerarCSV', () => {
  it('gera cabeçalho mesmo com histórico vazio', () => {
    const csv = gerarCSV([])
    expect(csv).toContain('Data;Hora;Produto')
  })

  it('gera uma linha por item do histórico, na ordem das colunas', () => {
    const csv = gerarCSV([{
      data: '14/09/2026', hora: '12:30', produto: 'Bolacha',
      porcoes: 2, carbo_total: 20, dose: 1.5, glicemia_atual: 110, insulina: 'Humalog (lispro)',
    }])
    const linhas = csv.split('\r\n')
    expect(linhas[1]).toBe('14/09/2026;12:30;Bolacha;2;20;1.5;110;Humalog (lispro)')
  })

  it('escapa produto com ponto e vírgula ou aspas dentro do nome', () => {
    const csv = gerarCSV([{ data: '', hora: '', produto: 'Suco; "Natural"', porcoes: 1, carbo_total: 0, dose: 0, glicemia_atual: 0, insulina: '' }])
    expect(csv).toContain('"Suco; ""Natural"""')
  })

  it('campo ausente vira string vazia, não "undefined"', () => {
    const csv = gerarCSV([{ produto: 'Item sem os outros campos' }])
    expect(csv).not.toContain('undefined')
  })
})
