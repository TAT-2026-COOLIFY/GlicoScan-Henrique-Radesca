// ─────────────────────────────────────────────────────────────────
// utils/lembretes.js — Lembretes locais de medição de glicemia
// ─────────────────────────────────────────────────────────────────
// Sem servidor de push — funciona só enquanto o app está aberto (aba
// ou janela do PWA instalado), checando a cada minuto se bateu algum
// horário configurado. Suficiente pra lembrete de medição de rotina;
// não substitui alarme de celular pra algo crítico.

const CHAVE_HORARIOS = 'gs_lembretes'
const CHAVE_DISPARADOS = 'gs_lembretes_disparados'

function _hojeStr() {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function _horaAtual() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const lembretes = {
  listar: () => {
    try {
      const raw = localStorage.getItem(CHAVE_HORARIOS)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  },

  adicionar: (horario) => {
    if (!/^\d{2}:\d{2}$/.test(horario)) return
    const atuais = lembretes.listar()
    if (atuais.includes(horario)) return
    const novos = [...atuais, horario].sort()
    localStorage.setItem(CHAVE_HORARIOS, JSON.stringify(novos))
  },

  remover: (horario) => {
    const novos = lembretes.listar().filter(h => h !== horario)
    localStorage.setItem(CHAVE_HORARIOS, JSON.stringify(novos))
  },

  permissaoConcedida: () => typeof Notification !== 'undefined' && Notification.permission === 'granted',

  pedirPermissao: async () => {
    if (typeof Notification === 'undefined') return false
    if (Notification.permission === 'granted') return true
    const resultado = await Notification.requestPermission()
    return resultado === 'granted'
  },

  /** Chamado a cada minuto (App.jsx) — dispara notificação se bateu algum horário configurado, uma vez por dia. */
  verificarEDisparar: () => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const horarios = lembretes.listar()
    if (!horarios.length) return

    const agora = _horaAtual()
    if (!horarios.includes(agora)) return

    let disparados = { dia: '', horarios: [] }
    try {
      disparados = JSON.parse(localStorage.getItem(CHAVE_DISPARADOS)) || disparados
    } catch { /* ignora, usa padrão */ }

    const hoje = _hojeStr()
    if (disparados.dia !== hoje) disparados = { dia: hoje, horarios: [] }
    if (disparados.horarios.includes(agora)) return

    new Notification('GlicoScan', { body: '🩸 Hora de medir sua glicemia', icon: '/icon-192.png' })
    disparados.horarios.push(agora)
    localStorage.setItem(CHAVE_DISPARADOS, JSON.stringify(disparados))
  },
}
