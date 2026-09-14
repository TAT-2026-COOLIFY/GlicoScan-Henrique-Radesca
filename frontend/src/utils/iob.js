// ─────────────────────────────────────────────────────────────────
// utils/iob.js — Insulina ativa (IOB, "bolus na ativa")
// ─────────────────────────────────────────────────────────────────
// Cada dose de insulina rápida continua agindo por algumas horas
// depois de aplicada (ver DURACAO_INSULINA_HORAS em constants.js). Se
// a pessoa come de novo antes disso, parte da dose anterior ainda tá
// "ativa" — sem descontar isso, o cálculo da nova dose pode empilhar
// insulina (mais UI do que o corpo consegue processar de uma vez) e
// causar hipoglicemia. Modelo linear simples (decaimento reto até
// zerar na duração total) — modelos clínicos reais usam curvas mais
// complexas, mas o linear já é uma proteção melhor que nenhuma.

function _parseDataHora(data, hora) {
  const dataMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data || '')
  const horaMatch = /^(\d{2}):(\d{2})$/.exec(hora || '')
  if (!dataMatch || !horaMatch) return null
  const [, dia, mes, ano] = dataMatch
  const [, h, min] = horaMatch
  return new Date(+ano, +mes - 1, +dia, +h, +min)
}

/**
 * Soma quanto de insulina de doses recentes ainda está "ativa" agora.
 * `historico`: itens com {dose, data, hora} (formato salvo pelo backend).
 * `duracaoHoras`: por quanto tempo essa insulina age (ver DURACAO_INSULINA_HORAS).
 */
export function calcularIOB(historico, duracaoHoras, agora = new Date()) {
  if (!duracaoHoras || duracaoHoras <= 0) return 0

  return historico.reduce((total, h) => {
    const quando = _parseDataHora(h.data, h.hora)
    if (!quando) return total

    const horasPassadas = (agora - quando) / 3_600_000
    if (horasPassadas < 0 || horasPassadas >= duracaoHoras) return total

    const fracaoAindaAtiva = 1 - horasPassadas / duracaoHoras
    return total + (h.dose || 0) * fracaoAindaAtiva
  }, 0)
}
