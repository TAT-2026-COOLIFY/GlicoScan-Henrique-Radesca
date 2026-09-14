// ─────────────────────────────────────────────────────────────────
// utils/exportarPdf.js — Relatório em PDF pro médico
// ─────────────────────────────────────────────────────────────────
// Além do CSV (dado bruto pra planilha), gera um relatório formatado
// — resumo + tabela — pra imprimir/anexar numa consulta.

import { jsPDF } from 'jspdf'

export function gerarRelatorioPdf({ nomePerfil, historico, stats }) {
  const doc = new jsPDF()
  const margem = 14
  let y = 20

  doc.setFontSize(18)
  doc.setFont(undefined, 'bold')
  doc.text('GlicoScan — Relatório de Doses', margem, y)
  y += 8

  doc.setFontSize(11)
  doc.setFont(undefined, 'normal')
  doc.text(`Perfil: ${nomePerfil}`, margem, y)
  y += 6
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, margem, y)
  y += 10

  if (stats) {
    doc.setFont(undefined, 'bold')
    doc.text('Resumo', margem, y)
    y += 7
    doc.setFont(undefined, 'normal')
    doc.text(`Total de cálculos: ${stats.total_calculos}`, margem, y); y += 6
    doc.text(`Média de carboidratos por refeição: ${stats.media_carbo_por_refeicao}g`, margem, y); y += 6
    doc.text(`Média de dose por refeição: ${stats.media_dose_por_refeicao} UI`, margem, y); y += 10
  }

  doc.setFont(undefined, 'bold')
  doc.text('Histórico', margem, y)
  y += 8

  doc.setFontSize(9)
  const colunas = [
    ['Data/Hora', 32], ['Produto', 48], ['Carbo', 18], ['Dose', 16], ['Glicemia', 20], ['Obs.', 40],
  ]
  let x = margem
  doc.setFont(undefined, 'bold')
  colunas.forEach(([titulo, largura]) => { doc.text(titulo, x, y); x += largura })
  y += 5
  doc.setLineWidth(0.2)
  doc.line(margem, y - 3, 200, y - 3)
  doc.setFont(undefined, 'normal')

  for (const h of historico) {
    if (y > 280) { doc.addPage(); y = 20 }
    x = margem
    const valores = [
      `${h.data} ${h.hora}`,
      String(h.produto || '').slice(0, 26),
      `${h.carbo_total ?? 0}g`,
      `${h.dose ?? 0} UI`,
      h.glicemia_atual ? `${h.glicemia_atual}` : '—',
      String(h.observacao || '').slice(0, 22),
    ]
    valores.forEach((v, i) => { doc.text(v, x, y); x += colunas[i][1] })
    y += 6
  }

  doc.save(`glicoscan-relatorio-${nomePerfil}.pdf`)
}
