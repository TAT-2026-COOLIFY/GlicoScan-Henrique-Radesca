// ─────────────────────────────────────────────────────────────────
// utils/medico.js — Trava de edição de RIC/insulina/alvo/FS
// ─────────────────────────────────────────────────────────────────
// A senha em si mora só no backend (DOCTOR_PASSWORD) — aqui só
// guardamos, nesta aba (sessionStorage: some ao fechar), até quando o
// desbloqueio vale. Não é sessão de verdade nem conta de médico, só
// uma janela de tempo curta pra não pedir senha de novo a cada campo.

const CHAVE = 'gs_medico_desbloqueado_ate'
const DURACAO_MS = 15 * 60 * 1000 // 15 minutos

export const medico = {
  estaDesbloqueado: () => {
    try {
      return Date.now() < Number(sessionStorage.getItem(CHAVE) || 0)
    } catch {
      return false
    }
  },

  minutosRestantes: () => {
    try {
      const ate = Number(sessionStorage.getItem(CHAVE) || 0)
      return Math.max(0, Math.ceil((ate - Date.now()) / 60000))
    } catch {
      return 0
    }
  },

  marcarDesbloqueado: () => {
    try {
      sessionStorage.setItem(CHAVE, String(Date.now() + DURACAO_MS))
    } catch { /* sem sessionStorage disponível — fica sempre trancado, sem crashar */ }
  },

  trancar: () => {
    try {
      sessionStorage.removeItem(CHAVE)
    } catch { /* nada a limpar */ }
  },
}
