// ─────────────────────────────────────────────────────────────────
// components/Calculadora.jsx — Tela de cálculo da dose de insulina
// ─────────────────────────────────────────────────────────────────
// Recebe os dados nutricionais já buscados (via scanner ou busca
// manual) e conduz o usuário em duas etapas:
//   1) Confirmar/corrigir os valores nutricionais (com alerta se
//      algum valor parecer implausível)
//   2) Ajustar porções e glicemia atual, ver a dose calculada e
//      salvar no histórico
//
// Fórmula usada:
//   dose_base = (carboidratos_totais / RIC)
//   correção  = (glicemia_atual - glicemia_alvo) / fator_sensibilidade
//   dose_final = dose_base + correção  (nunca negativa)

import { useState, useEffect } from 'react'
import { C } from '../theme'
import { INSULIN_TIPS } from '../constants'
import { storage } from '../utils/storage'
import { valorSuspeito, gerarDescricao } from '../utils/nutrition'
import { Card } from './Layout'
import { apiFetch } from '../api'

const CAMPOS_NUTRICIONAIS = [
  ['carboidratos', '🍞 Carboidratos', 'g',    C.accent],
  ['calorias',     '🔥 Calorias',     'kcal', C.warn],
  ['acucares',     '🍬 Açúcares',     'g',    C.green],
  ['fibras',       '🌾 Fibras',       'g',    C.purple],
  ['proteinas',    '💪 Proteínas',    'g',    C.purple],
  ['gorduras',     '🧈 Gorduras',     'g',    C.orange],
]

export default function Calculadora({ nutrition, showToast, onReset, fonte }) {
  const [editNut, setEditNut]       = useState({ ...nutrition })
  const [portions, setPortions]     = useState(1)
  const [nomeProd, setNomeProd]     = useState(nutrition.produto || '')
  const [glicemia, setGlicemia]     = useState('')
  const [resultado, setResultado]   = useState(null)
  const [confirmado, setConfirmado] = useState(false)
  const [salvou, setSalvou]         = useState(false)

  const camposSuspeitos = CAMPOS_NUTRICIONAIS
    .map(([chave]) => chave)
    .filter(chave => valorSuspeito(chave, editNut[chave], editNut.porcao))

  const calcular = (porcoesAtuais = portions) => {
    const perfil = storage.getPerfilAtivo()
    const { ric = 15, alvo = 100, fs = 50 } = perfil

    const carboTotal = +((editNut.carboidratos || 0) * porcoesAtuais).toFixed(1)
    const doseBase = carboTotal / ric

    const glicemiaNum = parseFloat(String(glicemia).replace(',', '.'))
    let glicemiaMgdl = 0
    if (!isNaN(glicemiaNum) && glicemiaNum > 0) {
      // Se o valor for menor que 30, assume que o usuário digitou em mmol/L e converte
      glicemiaMgdl = glicemiaNum < 30 ? Math.round(glicemiaNum * 18) : glicemiaNum
    }

    const correcao = glicemiaMgdl > 0 ? (glicemiaMgdl - alvo) / fs : 0
    const doseTotal = Math.max(0, Math.round((doseBase + correcao) * 2) / 2)
    const agora = new Date()

    setResultado({
      produto: nomeProd || editNut.produto,
      porcao: editNut.porcao,
      unidade: editNut.unidade,
      embalagem: editNut.embalagem || '',
      carboidratos: editNut.carboidratos,
      acucares: editNut.acucares,
      fibras: editNut.fibras,
      proteinas: editNut.proteinas,
      gorduras: editNut.gorduras,
      calorias: editNut.calorias,
      carboTotal,
      porcoes: porcoesAtuais,
      ric,
      dose: doseTotal,
      doseBase: Math.round(doseBase * 2) / 2,
      doseCorrecao: Math.round(correcao * 2) / 2,
      insulina: perfil.insulin,
      perfil: perfil.nome,
      glicemiaAtual: glicemiaMgdl,
      descricao: gerarDescricao(porcoesAtuais, editNut.porcao, editNut.unidade),
      time: `${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`,
      date: `${String(agora.getDate()).padStart(2,'0')}/${String(agora.getMonth()+1).padStart(2,'0')}`,
    })
  }

  // Recalcula automaticamente ao mudar porções ou editar valores nutricionais
  useEffect(() => {
    if (confirmado) calcular(portions)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portions, editNut])

  const salvarNoHistorico = async () => {
    if (!resultado || salvou) return
    setSalvou(true)
    try {
      await apiFetch('/historico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resultado),
      })
      showToast('✅ Salvo no histórico!')
      setTimeout(() => onReset(), 1500)
    } catch {
      showToast('❌ Erro ao salvar', 'err')
      setSalvou(false)
    }
  }

  const dicaInsulina = INSULIN_TIPS[storage.getPerfilAtivo().insulin] || INSULIN_TIPS['Humalog (lispro)']

  // ── ETAPA 1: confirmar/corrigir dados nutricionais ─────────────
  if (!confirmado) {
    return (
      <TelaConfirmacao
        editNut={editNut} setEditNut={setEditNut}
        nomeProd={nomeProd} setNomeProd={setNomeProd}
        camposSuspeitos={camposSuspeitos}
        fonte={fonte}
        onConfirmar={() => { setConfirmado(true); calcular(1) }}
        onReset={onReset}
      />
    )
  }

  // ── ETAPA 2: ajustar porções/glicemia e ver resultado ──────────
  return (
    <TelaResultado
      editNut={editNut} portions={portions} setPortions={setPortions}
      glicemia={glicemia} setGlicemia={setGlicemia}
      resultado={resultado} dicaInsulina={dicaInsulina}
      salvou={salvou} onSalvar={salvarNoHistorico}
      onEditar={() => { setConfirmado(false); setResultado(null) }}
      onReset={onReset}
      onBlurGlicemia={() => calcular(portions)}
    />
  )
}

// ── Subcomponente: tela de confirmação dos valores ────────────────
function TelaConfirmacao({ editNut, setEditNut, nomeProd, setNomeProd, camposSuspeitos, fonte, onConfirmar, onReset }) {
  return (
    <div style={{ padding:'16px 16px 28px', animation:'fadeIn .3s ease' }}>
      {camposSuspeitos.length > 0 ? (
        <div style={{ background:'rgba(255,115,64,.08)', border:'1px solid rgba(255,115,64,.3)', borderRadius:16, padding:'14px 16px', marginBottom:16, display:'flex', gap:12 }}>
          <span style={{ fontSize:20 }}>⚠️</span>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:C.orange, marginBottom:3 }}>{camposSuspeitos.length} valor(es) suspeito(s)</div>
            <div style={{ fontSize:12, color:'rgba(255,115,64,.7)', lineHeight:1.5 }}>Campos em laranja podem estar errados. Corrija antes de calcular.</div>
          </div>
        </div>
      ) : (
        <div style={{ background:C.greenDim, border:'1px solid rgba(0,229,160,.2)', borderRadius:16, padding:'12px 16px', marginBottom:16, display:'flex', gap:10, alignItems:'center' }}>
          <span>✅</span><span style={{ fontSize:13, color:C.green, fontWeight:500 }}>Valores parecem corretos!</span>
        </div>
      )}

      {fonte && <div style={{ textAlign:'center', fontSize:11, color:C.text3, marginBottom:12 }}>Fonte: <span style={{ color:C.accent }}>{fonte}</span></div>}

      <Card style={{ marginBottom:16 }}>
        <div style={{ padding:'12px 16px 4px', fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color:C.text3 }}>Confirmar Dados</div>

        <div style={{ margin:'8px 14px 4px', padding:'10px 14px', background:C.surface2, borderRadius:14, border:`1px solid ${C.border}` }}>
          <div style={{ fontSize:10, color:C.text3, marginBottom:4, letterSpacing:.8, textTransform:'uppercase' }}>📦 Produto</div>
          <input value={nomeProd} onChange={e => setNomeProd(e.target.value)}
            style={{ width:'100%', background:'none', border:'none', outline:'none', color:C.text, fontSize:14, fontFamily:'inherit', fontWeight:600 }}
            placeholder="Nome do produto..." />
        </div>

        <div style={{ margin:'6px 14px 4px', padding:'10px 14px', background:C.surface2, borderRadius:14, border:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:12, color:C.text3 }}>📏 Porção</span>
          <span style={{ fontSize:13, color:C.text2, fontWeight:500 }}>{editNut.porcao || '—'}</span>
        </div>

        {editNut.unidade && (
          <div style={{ margin:'4px 14px 4px', padding:'10px 14px', background:C.surface2, borderRadius:14, border:`1px solid rgba(0,212,255,.15)`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:12, color:C.text3 }}>📦 Unidade</span>
            <span style={{ fontSize:13, color:C.accent, fontWeight:600 }}>{editNut.unidade}</span>
          </div>
        )}

        {editNut.embalagem && (
          <div style={{ margin:'4px 14px 4px', padding:'10px 14px', background:C.surface2, borderRadius:14, border:`1px solid rgba(0,229,160,.15)`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:12, color:C.text3 }}>🏷️ Embalagem</span>
            <span style={{ fontSize:13, color:C.green, fontWeight:600 }}>{editNut.embalagem}</span>
          </div>
        )}

        <div style={{ margin:'6px 14px 14px', borderRadius:14, overflow:'hidden', border:`1px solid ${C.border}` }}>
          {CAMPOS_NUTRICIONAIS.map(([chave, label, unidade, cor], i, arr) => {
            const suspeito = valorSuspeito(chave, editNut[chave], editNut.porcao)
            return (
              <div key={chave} style={{ display:'flex', alignItems:'center', padding:'11px 14px', background:suspeito?'rgba(255,115,64,.06)':(i%2===0?C.surface2:'transparent'), borderBottom:i<arr.length-1?`1px solid ${C.border}`:'none' }}>
                <span style={{ flex:1, fontSize:13, color:suspeito?C.orange:C.text2, fontWeight:500 }}>
                  {label}{suspeito && <span style={{ marginLeft:6, fontSize:11 }}>⚠️</span>}
                </span>
                <div style={{ display:'flex', alignItems:'center', gap:6, background:suspeito?'rgba(255,115,64,.1)':C.surface3, border:`1px solid ${suspeito?'rgba(255,115,64,.3)':C.border}`, borderRadius:10, padding:'4px 8px' }}>
                  <input type="number" value={editNut[chave] ?? ''}
                    onChange={e => setEditNut(n => ({ ...n, [chave]: parseFloat(e.target.value) || 0 }))}
                    style={{ width:56, textAlign:'right', background:'none', border:'none', outline:'none', color:suspeito?C.orange:cor, fontSize:15, fontWeight:700, fontFamily:'inherit' }} />
                  <span style={{ fontSize:11, color:C.text3 }}>{unidade}</span>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <AvisoMedico />

      <button onClick={onConfirmar}
        style={{ width:'100%', padding:17, border:'none', borderRadius:16, background:`linear-gradient(135deg,${C.accent},#0099CC)`, color:'#020C18', fontFamily:'inherit', fontSize:15, fontWeight:700, cursor:'pointer', marginBottom:10, boxShadow:`0 8px 32px ${C.accentGlow}` }}>
        ✅  Confirmar e Calcular
      </button>
      <button onClick={onReset} style={{ width:'100%', padding:12, background:'none', border:`1px solid ${C.border}`, borderRadius:14, color:C.text3, fontFamily:'inherit', fontSize:13, cursor:'pointer' }}>
        🔄 Escanear outro produto
      </button>
    </div>
  )
}

// ── Subcomponente: tela de resultado (dose calculada) ─────────────
function TelaResultado({ editNut, portions, setPortions, glicemia, setGlicemia, resultado, dicaInsulina, salvou, onSalvar, onEditar, onReset, onBlurGlicemia }) {
  return (
    <div style={{ padding:'16px 16px 28px' }}>
      <Card style={{ marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px', borderBottom:`1px solid ${C.border}` }}>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:4 }}>Porções</div>
            <div style={{ fontSize:12, color:C.accent, marginTop:4 }}>🍽️ {gerarDescricao(portions, editNut.porcao, editNut.unidade)}</div>
            <div style={{ fontSize:11, color:C.text3, marginTop:2 }}>{+((editNut.carboidratos || 0) * portions).toFixed(1)}g de carboidrato</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', background:C.surface2, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden' }}>
            <button onClick={() => setPortions(p => +(Math.max(0.5, p - .5).toFixed(1)))} style={{ width:40, height:42, background:'none', border:'none', color:C.accent, fontSize:20, cursor:'pointer' }}>−</button>
            <div style={{ width:44, textAlign:'center', fontSize:18, fontWeight:700, color:C.accent, borderLeft:`1px solid ${C.border}`, borderRight:`1px solid ${C.border}` }}>{portions}</div>
            <button onClick={() => setPortions(p => +(Math.min(20, p + .5).toFixed(1)))} style={{ width:40, height:42, background:'none', border:'none', color:C.accent, fontSize:20, cursor:'pointer' }}>+</button>
          </div>
        </div>

        <div style={{ padding:'14px 18px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
            <span style={{ fontSize:13, color:C.text2, flex:1 }}>🩸 Glicemia atual <span style={{ fontSize:11, color:C.text3 }}>(opcional)</span></span>
            <input type="text" value={glicemia} onChange={e => setGlicemia(e.target.value)} onBlur={onBlurGlicemia}
              placeholder="ex: 120"
              style={{ width:90, padding:'8px 12px', background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, color:C.text, fontSize:14, outline:'none', fontFamily:'inherit', textAlign:'center', fontWeight:600 }} />
          </div>
          <IndicadorGlicemia glicemia={glicemia} />
        </div>
      </Card>

      <AvisoMedico />

      {resultado && (
        <ResultadoDose resultado={resultado} dicaInsulina={dicaInsulina} salvou={salvou}
          onSalvar={onSalvar} onEditar={onEditar} onReset={onReset} />
      )}
    </div>
  )
}

function IndicadorGlicemia({ glicemia }) {
  const g = parseFloat(String(glicemia).replace(',', '.'))
  if (isNaN(g) || g <= 0) return null

  const isMmol = g < 30
  const mgdl = isMmol ? Math.round(g * 18) : g
  const [cor, label] = mgdl < 70 ? [C.danger, '⚠️ Hipo'] : mgdl > 180 ? [C.warn, '⚠️ Hiper'] : [C.green, '✓ Normal']

  return (
    <div style={{ fontSize:12, color:cor, padding:'5px 12px', background:`${cor}15`, borderRadius:100, display:'inline-flex', gap:6, border:`1px solid ${cor}30` }}>
      {isMmol ? <span>{g} mmol/L = {mgdl} mg/dL</span> : <span>{mgdl} mg/dL</span>}
      <strong>{label}</strong>
    </div>
  )
}

function AvisoMedico() {
  return (
    <div style={{ background:'rgba(255,179,64,.06)', border:'1px solid rgba(255,179,64,.2)', borderRadius:14, padding:'10px 14px', display:'flex', gap:10, fontSize:12, color:'rgba(255,179,64,.8)', lineHeight:1.6, marginBottom:14 }}>
      <span>⚕️</span><span>Auxiliar de decisão. Valide sempre com seu médico.</span>
    </div>
  )
}

function ResultadoDose({ resultado, dicaInsulina, salvou, onSalvar, onEditar, onReset }) {
  const botoes = [
    [salvou ? '✅ Salvo!' : '💾 Salvar', C.green, 'rgba(0,229,160,.1)', 'rgba(0,229,160,.25)', onSalvar],
    ['✏️ Editar', C.accent, C.accentDim, 'rgba(0,212,255,.25)', onEditar],
    ['🔄 Novo', C.text3, 'transparent', C.border, onReset],
  ]

  return (
    <div style={{ animation:'fadeUp .4s ease both' }}>
      <div style={{ background:'linear-gradient(135deg,#081828,#0A2040)', border:`1px solid rgba(0,212,255,.2)`, borderRadius:24, padding:'24px 22px', marginBottom:14, position:'relative', overflow:'hidden', boxShadow:`0 0 40px rgba(0,212,255,.1)` }}>
        <div style={{ position:'absolute', top:-40, right:-40, width:160, height:160, background:`radial-gradient(circle,${C.accentGlow} 0%,transparent 70%)`, pointerEvents:'none' }} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div style={{ fontSize:10, fontWeight:700, letterSpacing:2, textTransform:'uppercase', color:C.text3 }}>💉 Dose Recomendada</div>
          {resultado.perfil && <div style={{ fontSize:11, color:C.accent, fontWeight:600 }}>👤 {resultado.perfil}</div>}
        </div>

        <div style={{ display:'flex', alignItems:'flex-end', gap:8, marginBottom:resultado.doseCorrecao?8:16 }}>
          <span style={{ fontSize:72, fontWeight:800, color:C.accent, lineHeight:1, textShadow:`0 0 40px ${C.accentGlow}`, animation:'numberPop .4s ease' }}>{resultado.dose}</span>
          <span style={{ fontSize:20, color:C.text3, paddingBottom:10 }}>UI</span>
        </div>

        {resultado.doseCorrecao !== 0 && (
          <div style={{ fontSize:12, color:C.text2, marginBottom:16, padding:'8px 12px', background:'rgba(255,255,255,.03)', borderRadius:10, border:`1px solid ${C.border}` }}>
            Base: <strong style={{ color:C.text }}>{resultado.doseBase} UI</strong>
            {resultado.doseCorrecao > 0
              ? <> + correção: <strong style={{ color:C.danger }}>+{resultado.doseCorrecao} UI</strong></>
              : <> − desconto: <strong style={{ color:C.green }}>{resultado.doseCorrecao} UI</strong></>}
          </div>
        )}

        <div style={{ padding:'10px 14px', background:C.accentDim, border:`1px solid rgba(0,212,255,.15)`, borderRadius:12, fontSize:13, color:C.accent, fontWeight:500, marginBottom:resultado.embalagem?8:12 }}>
          🍽️ {resultado.descricao}
        </div>

        {resultado.embalagem && (
          <div style={{ padding:'8px 14px', background:'rgba(0,229,160,.08)', border:'1px solid rgba(0,229,160,.15)', borderRadius:12, fontSize:12, color:C.green, marginBottom:12, display:'flex', gap:8, alignItems:'center' }}>
            <span>🏷️</span><span>Embalagem total: <strong>{resultado.embalagem}</strong></span>
          </div>
        )}

        <div style={{ padding:'10px 14px', background:`rgba(${dicaInsulina.rgb},.08)`, border:`1px solid rgba(${dicaInsulina.rgb},.2)`, borderRadius:12, fontSize:13, color:dicaInsulina.cor, display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
          <span>{dicaInsulina.icone}</span><span><strong>{resultado.insulina}</strong> — aplique <strong>{dicaInsulina.tempo}</strong></span>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8 }}>
          {[['Carbo', resultado.carboTotal+'g'], ['RIC', '1:'+resultado.ric], ['Porções', resultado.porcoes+'x'], ['Hora', resultado.time]].map(([l, v]) => (
            <div key={l} style={{ textAlign:'center', padding:'8px 4px', background:'rgba(255,255,255,.03)', borderRadius:10, border:`1px solid ${C.border}` }}>
              <div style={{ fontSize:13, color:C.text, fontWeight:700, marginBottom:2 }}>{v}</div>
              <div style={{ fontSize:9, color:C.text3, letterSpacing:.5, textTransform:'uppercase' }}>{l}</div>
            </div>
          ))}
        </div>

        {resultado.dose === 0 && (
          <div style={{ marginTop:14, padding:'10px 14px', background:C.greenDim, border:'1px solid rgba(0,229,160,.2)', borderRadius:12, fontSize:13, color:C.green }}>
            ✅ Sem carboidratos — nenhuma dose necessária!
          </div>
        )}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
        {botoes.map(([label, cor, bg, border, fn]) => (
          <button key={label} onClick={fn} style={{ padding:'13px 8px', background:bg, border:`1px solid ${border}`, borderRadius:14, color:cor, fontFamily:'inherit', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all .2s' }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
