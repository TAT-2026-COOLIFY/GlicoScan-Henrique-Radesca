// ─────────────────────────────────────────────────────────────────
// utils/dose.js — A conta da dose de insulina (função pura, testada)
// ─────────────────────────────────────────────────────────────────
//   base      = carboidratos / RIC
//   correção  = (glicemia − alvo) / FS        (só se houver glicemia)
//   dose      = base + correção − insulina ativa (IOB), nunca negativa,
//               arredondada pro passo da caneta (0,5 UI)
//
// A IOB entra com o valor EXATO (não arredondado antes): arredondar 0,2 UI
// de IOB pra 0 jogava fora proteção contra empilhar insulina.

export const PASSO_UI = 0.5
export const LIMITE_HIPO_MGDL = 70

export function arredondarDose(ui) {
  return Math.round(ui / PASSO_UI) * PASSO_UI
}

/** Valor digitado → mg/dL. Abaixo de 30 assume mmol/L (ex: 6,7 → 121). 0 = sem glicemia. */
export function glicemiaParaMgdl(digitado) {
  const n = parseFloat(String(digitado).replace(',', '.'))
  if (isNaN(n) || n <= 0) return 0
  return n < 30 ? Math.round(n * 18) : n
}

/** Um decimal, pra mostrar a parcela exata (o arredondamento em 0,5 só vale pro total). */
export const umDecimal = (n) => Math.round(n * 10) / 10

export function calcularDose({ carboTotal = 0, ric, alvo, fs, glicemiaMgdl = 0, iob = 0 }) {
  const base = carboTotal / ric
  const correcao = glicemiaMgdl > 0 ? (glicemiaMgdl - alvo) / fs : 0
  const total = Math.max(0, arredondarDose(base + correcao - iob))
  return { base, correcao, iob, total }
}
