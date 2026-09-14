// ─────────────────────────────────────────────────────────────────
// components/PerfilTab.jsx — Aba de configuração do perfil do usuário
// ─────────────────────────────────────────────────────────────────
// RIC, tipo de insulina, glicemia alvo e fator de sensibilidade.
// Esses valores são definidos junto com o médico/endocrinologista
// e usados pela Calculadora para todo cálculo de dose.
//
// Validação: RIC e Fator de Sensibilidade não podem ser zero nem
// negativos (o cálculo da dose divide por esses valores — um zero
// aqui quebraria a conta com divisão por zero). Os limites de
// glicemia seguem faixas fisiologicamente plausíveis, só pra pegar
// erro de digitação óbvio (ex: "1000" em vez de "100").

import { useState, useEffect } from 'react'
import { C } from '../theme'
import { INSULIN_TIPS } from '../constants'
import { storage } from '../utils/storage'
import { Card } from './Layout'

const CAMPOS = [
  ['Razão I:C (RIC)', 'number', 'ric', 'Ex: 15 → 1 UI para 15g carbo'],
  ['Tipo de Insulina', 'select', 'insulin', ''],
  ['Glicemia Alvo (mg/dL)', 'number', 'alvo', 'Sua glicemia ideal antes das refeições'],
  ['Fator Sensibilidade (FS)', 'number', 'fs', 'Quanto 1 UI reduz a glicemia'],
]

function validar({ nome, ric, alvo, fs }) {
  const erros = {}
  const ricNum = Number(ric), alvoNum = Number(alvo), fsNum = Number(fs)

  if (!nome || !nome.trim()) {
    erros.nome = 'Dá um nome pro perfil'
  }

  if (!ric || isNaN(ricNum) || ricNum <= 0) {
    erros.ric = 'RIC precisa ser maior que zero'
  } else if (ricNum > 100) {
    erros.ric = 'Valor muito alto — confira se está certo'
  }

  if (!alvo || isNaN(alvoNum) || alvoNum < 60 || alvoNum > 200) {
    erros.alvo = 'Glicemia alvo deve estar entre 60 e 200 mg/dL'
  }

  if (!fs || isNaN(fsNum) || fsNum <= 0) {
    erros.fs = 'Fator de sensibilidade precisa ser maior que zero'
  } else if (fsNum > 500) {
    erros.fs = 'Valor muito alto — confira se está certo'
  }

  return erros
}

export default function PerfilTab({ showToast, onPerfilMudou }) {
  const [perfis, setPerfis]         = useState(() => storage.listarPerfis())
  const [perfilId, setPerfilId]     = useState(() => storage.getPerfilAtivo().id)
  const [nome, setNome]             = useState('')
  const [ric, setRic]               = useState('')
  const [insulin, setInsulin]       = useState('')
  const [alvo, setAlvo]             = useState('')
  const [fs, setFs]                 = useState('')
  const [saved, setSaved]           = useState(false)
  const [erros, setErros]           = useState({})
  const [criandoNovo, setCriandoNovo] = useState(false)
  const [novoNome, setNovoNome]       = useState('')

  // Carrega os campos do perfil ativo sempre que a troca de perfil muda
  useEffect(() => {
    const p = storage.getPerfilAtivo()
    setNome(p.nome); setRic(p.ric); setInsulin(p.insulin); setAlvo(p.alvo); setFs(p.fs)
    setErros({})
  }, [perfilId])

  const trocarPerfil = (id) => {
    storage.definirPerfilAtivo(id)
    setPerfilId(id)
    onPerfilMudou?.()
  }

  const confirmarNovoPerfil = () => {
    if (!novoNome.trim()) return
    const id = storage.criarPerfil(novoNome)
    setPerfis(storage.listarPerfis())
    setPerfilId(id)
    setCriandoNovo(false)
    setNovoNome('')
    onPerfilMudou?.()
    showToast('✓ Perfil criado!')
  }

  const excluirPerfil = (id, nomePerfil) => {
    if (!confirm(`Excluir o perfil "${nomePerfil}"? O histórico salvo dele continua no app.`)) return
    const removeu = storage.removerPerfil(id)
    if (!removeu) {
      showToast('⚠️ Precisa deixar pelo menos 1 perfil', 'err')
      return
    }
    setPerfis(storage.listarPerfis())
    setPerfilId(storage.getPerfilAtivo().id)
    onPerfilMudou?.()
    showToast('🗑️ Perfil excluído')
  }

  const dica = INSULIN_TIPS[insulin] || INSULIN_TIPS['Humalog (lispro)']
  const valores = { ric, insulin, alvo, fs }
  const setters = { ric: setRic, insulin: setInsulin, alvo: setAlvo, fs: setFs }

  const salvar = () => {
    const errosEncontrados = validar({ nome, ric, alvo, fs })
    setErros(errosEncontrados)

    if (Object.keys(errosEncontrados).length > 0) {
      showToast('⚠️ Corrija os campos destacados', 'err')
      return
    }

    storage.salvarPerfil(perfilId, { nome: nome.trim(), ric: +ric, insulin, alvo: +alvo, fs: +fs })
    setPerfis(storage.listarPerfis())
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
    onPerfilMudou?.() // pode ter renomeado o perfil ativo — Header precisa refletir
    showToast('✓ Perfil salvo!')
  }

  return (
    <div style={{ padding:'16px 16px 28px' }}>
      <SeletorDePerfis perfis={perfis} perfilAtivoId={perfilId} onTrocar={trocarPerfil} onExcluir={excluirPerfil}
        criandoNovo={criandoNovo} onIniciarNovo={() => setCriandoNovo(true)}
        novoNome={novoNome} onMudarNovoNome={setNovoNome}
        onConfirmarNovo={confirmarNovoPerfil} onCancelarNovo={() => { setCriandoNovo(false); setNovoNome('') }} />

      <div style={{ background:`rgba(${dica.rgb},.08)`, border:`1px solid rgba(${dica.rgb},.2)`, borderRadius:18, padding:'16px 18px', marginBottom:16, display:'flex', gap:14, alignItems:'center' }}>
        <div style={{ width:44, height:44, borderRadius:14, background:`rgba(${dica.rgb},.15)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>{dica.icone}</div>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:dica.cor, marginBottom:3 }}>{insulin}</div>
          <div style={{ fontSize:12, color:dica.cor, opacity:.8 }}>Aplique <strong>{dica.tempo}</strong></div>
        </div>
      </div>

      <Card style={{ padding:18, marginBottom:14 }}>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11, color:C.text3, marginBottom:6, fontWeight:600, letterSpacing:.5 }}>Nome do Perfil</div>
          <input value={nome} onChange={e => setNome(e.target.value)}
            style={{ width:'100%', padding:'12px 14px', background:C.surface2, border:`1px solid ${erros.nome?C.danger:C.border}`, borderRadius:12, color:C.text, fontSize:14, outline:'none', fontFamily:'inherit', fontWeight:600, boxSizing:'border-box' }} />
          {erros.nome && <div style={{ fontSize:11, color:C.danger, marginTop:4, fontWeight:600 }}>⚠️ {erros.nome}</div>}
        </div>
        <div style={{ fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color:C.text3, marginBottom:16 }}>⚙️ Configuração</div>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {CAMPOS.map(([label, tipo, chave, dicaTexto]) => {
            const erro = erros[chave]
            return (
              <div key={chave}>
                <div style={{ fontSize:11, color:C.text3, marginBottom:6, fontWeight:600, letterSpacing:.5 }}>{label}</div>
                {tipo === 'select' ? (
                  <select value={valores[chave]} onChange={e => setters[chave](e.target.value)}
                    style={{ width:'100%', padding:'12px 14px', background:C.surface2, border:`1px solid ${C.border}`, borderRadius:12, color:C.text, fontSize:14, outline:'none', fontFamily:'inherit' }}>
                    {Object.keys(INSULIN_TIPS).map(o => <option key={o} style={{ background:C.surface2 }}>{o}</option>)}
                  </select>
                ) : (
                  <input type="number" value={valores[chave]} onChange={e => setters[chave](e.target.value)}
                    style={{ width:'100%', padding:'12px 14px', background:C.surface2, border:`1px solid ${erro?C.danger:C.border}`, borderRadius:12, color:C.text, fontSize:14, outline:'none', fontFamily:'inherit', fontWeight:600, boxSizing:'border-box' }} />
                )}
                {erro
                  ? <div style={{ fontSize:11, color:C.danger, marginTop:4, fontWeight:600 }}>⚠️ {erro}</div>
                  : dicaTexto && <div style={{ fontSize:11, color:C.text3, marginTop:4 }}>{dicaTexto}</div>
                }
              </div>
            )
          })}
        </div>
      </Card>

      <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:14, padding:'14px 16px', fontSize:12, color:C.text2, lineHeight:1.9, marginBottom:16 }}>
        ⚕️ Esses valores são definidos com seu médico ou educador em diabetes.<br/>
        <span style={{ color:C.text3 }}>Nunca altere sem orientação profissional.</span>
      </div>

      <button onClick={salvar}
        style={{ width:'100%', padding:16, background:saved?C.greenDim:`linear-gradient(135deg,${C.accent},#0099CC)`, border:saved?`1px solid rgba(0,229,160,.3)`:'none', borderRadius:16, color:saved?C.green:'#020C18', fontFamily:'inherit', fontSize:15, fontWeight:700, cursor:'pointer', transition:'all .3s', boxShadow:saved?'none':`0 8px 32px ${C.accentGlow}` }}>
        {saved ? '✓ Salvo com sucesso!' : '✓ Salvar Perfil'}
      </button>
    </div>
  )
}

// ── Seletor de perfis — troca de "regulagem" quando mais de uma pessoa usa o app ──
function SeletorDePerfis({ perfis, perfilAtivoId, onTrocar, onExcluir, criandoNovo, onIniciarNovo, novoNome, onMudarNovoNome, onConfirmarNovo, onCancelarNovo }) {
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color:C.text3, marginBottom:8 }}>👤 Perfil</div>
      <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:2 }}>
        {perfis.map(p => {
          const ativo = p.id === perfilAtivoId
          return (
            <div key={p.id} onClick={() => onTrocar(p.id)}
              style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, padding:'8px 8px 8px 14px', borderRadius:100, cursor:'pointer', background:ativo?C.accentDim:C.surface2, border:`1px solid ${ativo?'rgba(0,212,255,.3)':C.border}`, color:ativo?C.accent:C.text2, fontSize:13, fontWeight:ativo?700:500, whiteSpace:'nowrap' }}>
              {p.nome}
              {perfis.length > 1 && (
                <button onClick={e => { e.stopPropagation(); onExcluir(p.id, p.nome) }}
                  style={{ background:'none', border:'none', color:'inherit', opacity:.5, cursor:'pointer', fontSize:12, padding:'2px 4px', lineHeight:1 }}>
                  ✕
                </button>
              )}
            </div>
          )
        })}
        {!criandoNovo && (
          <button onClick={onIniciarNovo}
            style={{ flexShrink:0, padding:'8px 16px', borderRadius:100, cursor:'pointer', background:'none', border:`1px dashed ${C.border}`, color:C.text3, fontSize:13, fontWeight:600 }}>
            + Novo
          </button>
        )}
      </div>

      {criandoNovo && (
        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          <input value={novoNome} onChange={e => onMudarNovoNome(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onConfirmarNovo()}
            placeholder="Nome da pessoa..." autoFocus
            style={{ flex:1, padding:'10px 14px', background:C.surface2, border:`1px solid ${C.border}`, borderRadius:12, color:C.text, fontSize:13, outline:'none', fontFamily:'inherit' }} />
          <button onClick={onConfirmarNovo}
            style={{ padding:'10px 16px', border:'none', borderRadius:12, background:C.accent, color:'#020C18', fontFamily:'inherit', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            Criar
          </button>
          <button onClick={onCancelarNovo}
            style={{ padding:'10px 14px', border:`1px solid ${C.border}`, borderRadius:12, background:'none', color:C.text3, fontFamily:'inherit', fontSize:13, cursor:'pointer' }}>
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
