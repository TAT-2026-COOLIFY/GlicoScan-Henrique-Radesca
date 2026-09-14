// ─────────────────────────────────────────────────────────────────
// utils/exportar.js — Geração de CSV do histórico + download de arquivo
// ─────────────────────────────────────────────────────────────────
// CSV em vez de PDF de propósito: nenhuma dependência nova, abre em
// qualquer planilha (Excel, Google Sheets) e imprime igual de bem pra
// levar numa consulta.

const COLUNAS = [
  ['data',           'Data'],
  ['hora',           'Hora'],
  ['produto',        'Produto'],
  ['porcoes',        'Porções'],
  ['carbo_total',    'Carboidratos (g)'],
  ['dose',           'Dose (UI)'],
  ['glicemia_atual', 'Glicemia (mg/dL)'],
  ['insulina',       'Insulina'],
]

function _escaparCampoCSV(valor) {
  const texto = String(valor ?? '')
  return /[",\n;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

/** Gera o texto CSV (com BOM, pro Excel reconhecer acentuação certinho). */
export function gerarCSV(historico) {
  const cabecalho = COLUNAS.map(([, titulo]) => titulo)
  const linhas = historico.map(h => COLUNAS.map(([chave]) => _escaparCampoCSV(h[chave])))
  const texto = [cabecalho, ...linhas].map(l => l.join(';')).join('\r\n')
  return '﻿' + texto
}

/** Dispara o download de um arquivo no navegador (funciona pra CSV, JSON, etc). */
export function baixarArquivo(conteudo, nomeArquivo, tipo) {
  const blob = new Blob([conteudo], { type: tipo })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
