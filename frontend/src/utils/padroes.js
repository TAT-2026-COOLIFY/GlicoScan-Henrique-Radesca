// ─────────────────────────────────────────────────────────────────
// utils/padroes.js — Detecção de hipo/hiperglicemia recorrente
// ─────────────────────────────────────────────────────────────────
// Varre o histórico salvo procurando repetição de hipo (<70 mg/dL) ou
// hiper (>180 mg/dL) sempre no mesmo período do dia — sinal de que o
// RIC/FS daquele horário pode estar desregulado. Não é diagnóstico:
// só aponta o padrão pra discutir com o médico.

const PERIODOS = [
  { nome: 'madrugada', inicio: 0,  fim: 6  },
  { nome: 'manhã',     inicio: 6,  fim: 12 },
  { nome: 'tarde',     inicio: 12, fim: 18 },
  { nome: 'noite',     inicio: 18, fim: 24 },
]

function _periodoDaHora(hora) {
  const h = parseInt(String(hora || '').split(':')[0], 10)
  if (isNaN(h)) return null
  return PERIODOS.find(p => h >= p.inicio && h < p.fim)?.nome ?? 'noite'
}

/**
 * Devolve os padrões encontrados: [{ tipo: 'hipo'|'hiper', periodo, ocorrencias }, ...]
 * `minimoOcorrencias`: quantas vezes precisa repetir no mesmo período pra virar alerta.
 */
export function detectarPadroes(historico, minimoOcorrencias = 3) {
  const contagem = {}

  for (const h of historico) {
    const glicemia = Number(h.glicemia_atual)
    if (!glicemia || glicemia <= 0) continue

    const tipo = glicemia < 70 ? 'hipo' : glicemia > 180 ? 'hiper' : null
    if (!tipo) continue

    const periodo = _periodoDaHora(h.hora)
    if (!periodo) continue

    const chave = `${tipo}|${periodo}`
    contagem[chave] = (contagem[chave] || 0) + 1
  }

  return Object.entries(contagem)
    .filter(([, ocorrencias]) => ocorrencias >= minimoOcorrencias)
    .map(([chave, ocorrencias]) => {
      const [tipo, periodo] = chave.split('|')
      return { tipo, periodo, ocorrencias }
    })
    .sort((a, b) => b.ocorrencias - a.ocorrencias)
}
