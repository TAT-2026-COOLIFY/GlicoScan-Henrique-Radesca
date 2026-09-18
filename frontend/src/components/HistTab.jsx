// ─────────────────────────────────────────────────────────────────
// components/HistTab.jsx — Aba de histórico de cálculos
// ─────────────────────────────────────────────────────────────────
// Lista os cálculos salvos (GET /historico) e estatísticas agregadas
// (GET /stats), com um mini-gráfico de evolução de carboidratos/dose
// nos últimos dias.

import { useState, useEffect } from 'react'
import { C } from '../theme'
import { apiFetch } from '../api'
import { storage } from '../utils/storage'
import { gerarCSV, baixarArquivo } from '../utils/exportar'
import { gerarRelatorioPdf } from '../utils/exportarPdf'
import { detectarPadroes } from '../utils/padroes'

export default function HistTab({ showToast }) {
  const [list, setList]       = useState([])
  const [stats, setStats]     = useState(null)
  const [loading, setLoading] = useState(true)

  const carregar = async () => {
    try {
      const [historico, estatisticas] = await Promise.all([
        apiFetch('/historico').then(r => r.json()),
        apiFetch('/stats').then(r => r.json()),
      ])
      setList(Array.isArray(historico) ? historico : [])
      setStats(estatisticas)
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [])

  const limparTudo = async () => {
    if (!confirm('Limpar todo o seu histórico?')) return
    await apiFetch('/historico', { method: 'DELETE' })
    carregar()
    showToast('🗑️ Histórico limpo')
  }

  const remover = async (id) => {
    await apiFetch(`/historico/${id}`, { method: 'DELETE' })
    carregar()
  }

  const exportarCSV = () => {
    const nomePerfil = storage.getPerfilAtivo().nome
    baixarArquivo(gerarCSV(list), `glicoscan-${nomePerfil}.csv`, 'text/csv;charset=utf-8;')
    showToast('📄 CSV baixado')
  }

  const exportarPDF = () => {
    const nomePerfil = storage.getPerfilAtivo().nome
    gerarRelatorioPdf({ nomePerfil, historico: list, stats })
    showToast('📄 PDF baixado')
  }

  const padroes = detectarPadroes(list)

  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300 }}>
        <div style={{ width:38, height:38, border:`3px solid ${C.border}`, borderTopColor:C.accent, borderRadius:'50%', animation:'spin .7s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{ padding:'16px 16px 28px' }}>
      <div style={{ fontSize:11, color:C.text3, marginBottom:12, textAlign:'center' }}>
        Histórico de <span style={{ color:C.accent, fontWeight:700 }}>{storage.getPerfilAtivo().nome}</span>
      </div>
      {padroes.length > 0 && <AlertasDePadrao padroes={padroes} />}
      {stats?.total_calculos > 0 && <ResumoEstatisticas stats={stats} />}
      {stats?.por_dia?.length >= 2 && (
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:18, padding:'14px 16px', marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:1.2, textTransform:'uppercase', color:C.text3, marginBottom:8 }}>📈 Evolução</div>
          <MiniChart dados={stats.por_dia} />
        </div>
      )}

      {!list.length ? (
        <EstadoVazio />
      ) : (
        <>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {list.map((h, i) => <ItemHistorico key={h.id} h={h} index={i} onRemover={() => remover(h.id)} />)}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:14 }}>
            <button onClick={exportarCSV}
              style={{ padding:13, background:'none', border:`1px solid ${C.border}`, borderRadius:14, color:C.text2, fontFamily:'inherit', fontSize:13, cursor:'pointer' }}>
              📄 Exportar CSV
            </button>
            <button onClick={exportarPDF}
              style={{ padding:13, background:'none', border:`1px solid ${C.border}`, borderRadius:14, color:C.text2, fontFamily:'inherit', fontSize:13, cursor:'pointer' }}>
              📋 Relatório PDF
            </button>
          </div>
          <button onClick={limparTudo}
            style={{ width:'100%', padding:13, background:'none', border:`1px solid rgba(255,77,109,.2)`, borderRadius:14, color:C.danger, fontFamily:'inherit', fontSize:13, cursor:'pointer', opacity:.7, marginTop:10 }}>
            🗑️ Limpar tudo
          </button>
        </>
      )}
    </div>
  )
}

function AlertasDePadrao({ padroes }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
      {padroes.map(({ tipo, periodo, ocorrencias }) => {
        const hipo = tipo === 'hipo'
        const cor = hipo ? C.danger : C.warn
        return (
          <div key={`${tipo}-${periodo}`}
            style={{ background:`${cor}15`, border:`1px solid ${cor}40`, borderRadius:14, padding:'12px 14px', display:'flex', gap:10, alignItems:'flex-start' }}>
            <span style={{ fontSize:16 }}>⚠️</span>
            <div style={{ fontSize:12, color:C.text2, lineHeight:1.5 }}>
              <strong style={{ color:cor }}>{hipo ? 'Hipoglicemia' : 'Hiperglicemia'} recorrente à {periodo}</strong> —
              {' '}{ocorrencias}x registrado. Vale revisar {hipo ? 'RIC/FS' : 'RIC'} desse horário com seu médico.
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ResumoEstatisticas({ stats }) {
  const cards = [
    ['📊', stats.total_calculos, 'Cálculos'],
    ['🍞', stats.media_carbo_por_refeicao + 'g', 'Média carbo'],
    ['💉', stats.media_dose_por_refeicao + ' UI', 'Média dose'],
  ]
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:16 }}>
      {cards.map(([icone, valor, label]) => (
        <div key={label} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:'14px 10px', textAlign:'center', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', inset:0, background:`radial-gradient(circle at 50% 0%,${C.accentDim} 0%,transparent 70%)`, pointerEvents:'none' }} />
          <div style={{ fontSize:22, marginBottom:6 }}>{icone}</div>
          <div style={{ fontSize:17, fontWeight:800, color:C.accent, marginBottom:3 }}>{valor}</div>
          <div style={{ fontSize:10, color:C.text3, letterSpacing:.5, textTransform:'uppercase' }}>{label}</div>
        </div>
      ))}
    </div>
  )
}

function EstadoVazio() {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:280, color:C.text3, textAlign:'center', gap:14 }}>
      <div style={{ fontSize:48, opacity:.15 }}>📋</div>
      <div style={{ fontSize:15, fontWeight:700, color:C.text2 }}>Nenhum cálculo salvo</div>
      <div style={{ fontSize:13 }}>Escaneie um código de barras para começar!</div>
    </div>
  )
}

function ItemHistorico({ h, index, onRemover }) {
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:18, padding:'14px 16px', display:'flex', alignItems:'center', gap:14, animation:`slideIn .3s ease ${index*.03}s both` }}>
      <div style={{ width:46, height:46, background:C.surface2, borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>📦</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:700, marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textTransform:'capitalize' }}>{h.produto}</div>
        {h.unidade && <div style={{ fontSize:12, color:C.accent, marginBottom:2 }}>🍽️ {h.unidade}</div>}
        <div style={{ fontSize:11, color:C.text3 }}>{h.carbo_total}g carbo · RIC 1:{h.ric}</div>
        {h.observacao && <div style={{ fontSize:11, color:C.text3, marginTop:3, fontStyle:'italic', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>📝 {h.observacao}</div>}
      </div>
      <div style={{ textAlign:'right', flexShrink:0 }}>
        <div style={{ fontSize:24, fontWeight:800, color:C.accent, lineHeight:1 }}>{h.dose} UI</div>
        <div style={{ fontSize:10, color:C.text3, marginTop:2 }}>{h.data} · {h.hora}</div>
        <button onClick={onRemover} style={{ fontSize:11, color:C.danger, background:'none', border:'none', cursor:'pointer', padding:0, marginTop:4, opacity:.6 }}>🗑️ remover</button>
      </div>
    </div>
  )
}

// Gráfico de linhas simples (SVG puro, sem lib externa) mostrando
// carboidratos e dose ao longo dos últimos dias registrados.
function MiniChart({ dados }) {
  if (!dados || dados.length < 2) return null

  const invertido = [...dados].reverse()
  const maxCarbo = Math.max(...invertido.map(d => d.carbo || 0), 1)
  const maxDose  = Math.max(...invertido.map(d => d.dose || 0), 1)
  const diasComGlicemia = invertido.map((d, i) => ({ i, v: d.glicemia })).filter(p => p.v != null)
  const maxGlicemia = Math.max(...diasComGlicemia.map(p => p.v), 1)
  const LARGURA = 330, ALTURA = 80, PADDING = 24

  const posX = i => PADDING + (i / (invertido.length - 1)) * (LARGURA - PADDING * 2)

  const gerarPontos = (chave, max) => invertido.map((d, i) => {
    const y = ALTURA - PADDING - ((d[chave] || 0) / max) * (ALTURA - PADDING * 2)
    return `${posX(i)},${y}`
  }).join(' ')

  // Glicemia não tem valor todo dia — pula os dias sem registro em vez de "cair pra zero"
  const pontosGlicemia = diasComGlicemia
    .map(({ i, v }) => `${posX(i)},${ALTURA - PADDING - (v / maxGlicemia) * (ALTURA - PADDING * 2)}`)
    .join(' ')

  return (
    <div style={{ padding:'4px 0 12px' }}>
      <svg width={LARGURA} height={ALTURA} style={{ overflow:'visible' }}>
        {[0, .5, 1].map(p => (
          <line key={p} x1={PADDING} y1={PADDING+p*(ALTURA-PADDING*2)} x2={LARGURA-PADDING} y2={PADDING+p*(ALTURA-PADDING*2)} stroke={C.border} strokeWidth="1" strokeDasharray="3,3" />
        ))}
        <polyline points={gerarPontos('carbo', maxCarbo)} fill="none" stroke={C.accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={gerarPontos('dose', maxDose)} fill="none" stroke={C.green} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="4,2" />
        {pontosGlicemia && <polyline points={pontosGlicemia} fill="none" stroke={C.purple} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="1,3" />}
        {invertido.map((d, i) => {
          const x = posX(i)
          const yCarbo = ALTURA - PADDING - ((d.carbo || 0) / maxCarbo) * (ALTURA - PADDING * 2)
          const yDose  = ALTURA - PADDING - ((d.dose || 0) / maxDose) * (ALTURA - PADDING * 2)
          return (
            <g key={i}>
              <circle cx={x} cy={yCarbo} r="3" fill={C.accent} />
              <circle cx={x} cy={yDose} r="3" fill={C.green} />
              {d.glicemia != null && <circle cx={x} cy={ALTURA - PADDING - (d.glicemia / maxGlicemia) * (ALTURA - PADDING * 2)} r="3" fill={C.purple} />}
              <text x={x} y={ALTURA-4} textAnchor="middle" fontSize="8" fill={C.text3}>{d.data?.split('/').slice(0,2).join('/')}</text>
            </g>
          )
        })}
      </svg>
      <div style={{ display:'flex', gap:16, paddingLeft:4, marginTop:4, flexWrap:'wrap' }}>
        {[[C.accent, 'Carbo (g)'], [C.green, 'Dose (UI)'], ...(pontosGlicemia ? [[C.purple, 'Glicemia (mg/dL)']] : [])].map(([cor, label]) => (
          <div key={label} style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, color:C.text3 }}>
            <div style={{ width:18, height:2, background:cor, borderRadius:2 }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}
