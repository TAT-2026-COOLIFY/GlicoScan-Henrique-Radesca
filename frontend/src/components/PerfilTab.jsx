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
//
// Trava médica: se o backend tiver DOCTOR_PASSWORD configurada, os 4
// campos clínicos (RIC/insulina/alvo/FS) ficam só leitura até digitar
// essa senha — desbloqueio vale 15min nesta aba (ver utils/medico.js).
// Sem DOCTOR_PASSWORD configurada no servidor, fica como antes (sempre
// editável) — dev local não precisa se preocupar com isso.
//
// PIN por perfil: cada perfil pode, opcionalmente, ter um PIN de 4
// dígitos (hash SHA-256, nunca texto puro — ver utils/storage.js) pra
// não deixar qualquer um no aparelho trocar livremente pra ele.

import { useState, useEffect } from 'react'
import { C } from '../theme'
import { INSULIN_TIPS } from '../constants'
import { storage } from '../utils/storage'
import { medico } from '../utils/medico'
import { apiFetch } from '../api'
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

  // Troca de perfil protegida por PIN — se o alvo tem PIN, fica pendente
  // aqui até confirmar, em vez de trocar na hora.
  const [pinAlvo, setPinAlvo]       = useState(null)
  const [pinDigitado, setPinDigitado] = useState('')
  const [erroPin, setErroPin]       = useState('')

  // Gerenciar o PIN do próprio perfil ativo (Config → seção PIN)
  const [gerenciandoPin, setGerenciandoPin] = useState(false)
  const [pinNovo, setPinNovo]       = useState('')

  // Trava médica (RIC/insulina/alvo/FS) — só existe se o backend tiver
  // DOCTOR_PASSWORD configurada (senão fica sempre editável, como antes).
  const [travaAtiva, setTravaAtiva]     = useState(false)
  const [desbloqueado, setDesbloqueado] = useState(() => medico.estaDesbloqueado())
  const [desbloqueando, setDesbloqueando] = useState(false)
  const [senhaMedico, setSenhaMedico]   = useState('')
  const [verificando, setVerificando]   = useState(false)
  const [erroMedico, setErroMedico]     = useState('')

  useEffect(() => {
    apiFetch('/health').then(r => r.json()).then(d => setTravaAtiva(Boolean(d.trava_medica))).catch(() => {})
  }, [])

  // Carrega os campos do perfil ativo sempre que a troca de perfil muda
  useEffect(() => {
    const p = storage.getPerfilAtivo()
    setNome(p.nome); setRic(p.ric); setInsulin(p.insulin); setAlvo(p.alvo); setFs(p.fs)
    setErros({})
    setGerenciandoPin(false); setPinNovo('')
  }, [perfilId])

  const _trocarDireto = (id) => {
    storage.definirPerfilAtivo(id)
    setPerfilId(id)
    onPerfilMudou?.()
  }

  const pedirTroca = (id) => {
    if (id === perfilId) return
    if (storage.perfilTemPin(id)) {
      setPinAlvo(id); setPinDigitado(''); setErroPin('')
    } else {
      _trocarDireto(id)
    }
  }

  const confirmarTrocaComPin = async () => {
    const ok = await storage.verificarPin(pinAlvo, pinDigitado)
    if (!ok) {
      setErroPin('PIN incorreto')
      return
    }
    _trocarDireto(pinAlvo)
    setPinAlvo(null); setPinDigitado('')
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

  const definirPinAtual = async () => {
    if (!/^\d{4}$/.test(pinNovo)) {
      showToast('⚠️ PIN precisa ter 4 números', 'err')
      return
    }
    await storage.definirPin(perfilId, pinNovo)
    setPerfis(storage.listarPerfis())
    setGerenciandoPin(false); setPinNovo('')
    showToast('✓ PIN definido!')
  }

  const removerPinAtual = () => {
    storage.removerPin(perfilId)
    setPerfis(storage.listarPerfis())
    showToast('🔓 PIN removido')
  }

  const desbloquearMedico = async () => {
    setVerificando(true); setErroMedico('')
    try {
      const r = await apiFetch('/medico/verificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha: senhaMedico }),
      })
      if (r.ok) {
        medico.marcarDesbloqueado()
        setDesbloqueado(true)
        setDesbloqueando(false); setSenhaMedico('')
        showToast('🔓 Edição liberada por 15min')
      } else {
        const data = await r.json().catch(() => ({}))
        setErroMedico(data.erro || 'Senha incorreta')
      }
    } catch {
      setErroMedico('Erro de conexão')
    } finally {
      setVerificando(false)
    }
  }

  const trancarMedico = () => {
    medico.trancar()
    setDesbloqueado(false)
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

  const temPin = storage.perfilTemPin(perfilId)
  const editavel = !travaAtiva || desbloqueado

  return (
    <div style={{ padding:'16px 16px 28px' }}>
      <SeletorDePerfis perfis={perfis} perfilAtivoId={perfilId} onTrocar={pedirTroca} onExcluir={excluirPerfil}
        criandoNovo={criandoNovo} onIniciarNovo={() => setCriandoNovo(true)}
        novoNome={novoNome} onMudarNovoNome={setNovoNome}
        onConfirmarNovo={confirmarNovoPerfil} onCancelarNovo={() => { setCriandoNovo(false); setNovoNome('') }}
        pinAlvo={pinAlvo} pinDigitado={pinDigitado} erroPin={erroPin}
        onMudarPinDigitado={v => { setPinDigitado(v); setErroPin('') }}
        onConfirmarPin={confirmarTrocaComPin} onCancelarPin={() => setPinAlvo(null)} />

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

        <PinDoPerfil temPin={temPin} gerenciando={gerenciandoPin} pinNovo={pinNovo}
          onAbrir={() => setGerenciandoPin(true)} onFechar={() => { setGerenciandoPin(false); setPinNovo('') }}
          onMudarPin={setPinNovo} onDefinir={definirPinAtual} onRemover={removerPinAtual} />

        {travaAtiva && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color:C.text3 }}>⚙️ Configuração</div>
            {!desbloqueado
              ? <span style={{ fontSize:10, fontWeight:700, color:C.text3, display:'flex', alignItems:'center', gap:4 }}>🔒 Só leitura</span>
              : <span style={{ fontSize:10, fontWeight:700, color:C.green, display:'flex', alignItems:'center', gap:4 }}>🔓 Liberado ({medico.minutosRestantes()}min)</span>
            }
          </div>
        )}

        <div style={{ display:'flex', flexDirection:'column', gap:14, opacity:editavel?1:.55 }}>
          {CAMPOS.map(([label, tipo, chave, dicaTexto]) => {
            const erro = erros[chave]
            return (
              <div key={chave}>
                <div style={{ fontSize:11, color:C.text3, marginBottom:6, fontWeight:600, letterSpacing:.5 }}>{label}</div>
                {tipo === 'select' ? (
                  <select value={valores[chave]} onChange={e => setters[chave](e.target.value)} disabled={!editavel}
                    style={{ width:'100%', padding:'12px 14px', background:C.surface2, border:`1px solid ${C.border}`, borderRadius:12, color:C.text, fontSize:14, outline:'none', fontFamily:'inherit', cursor:editavel?'pointer':'not-allowed' }}>
                    {Object.keys(INSULIN_TIPS).map(o => <option key={o} style={{ background:C.surface2 }}>{o}</option>)}
                  </select>
                ) : (
                  <input type="number" value={valores[chave]} onChange={e => setters[chave](e.target.value)} disabled={!editavel}
                    style={{ width:'100%', padding:'12px 14px', background:C.surface2, border:`1px solid ${erro?C.danger:C.border}`, borderRadius:12, color:C.text, fontSize:14, outline:'none', fontFamily:'inherit', fontWeight:600, boxSizing:'border-box', cursor:editavel?'text':'not-allowed' }} />
                )}
                {erro
                  ? <div style={{ fontSize:11, color:C.danger, marginTop:4, fontWeight:600 }}>⚠️ {erro}</div>
                  : dicaTexto && <div style={{ fontSize:11, color:C.text3, marginTop:4 }}>{dicaTexto}</div>
                }
              </div>
            )
          })}
        </div>

        {travaAtiva && <TravaMedica desbloqueado={desbloqueado} desbloqueando={desbloqueando} senha={senhaMedico}
          verificando={verificando} erro={erroMedico}
          onAbrir={() => setDesbloqueando(true)} onCancelar={() => { setDesbloqueando(false); setSenhaMedico(''); setErroMedico('') }}
          onMudarSenha={setSenhaMedico} onConfirmar={desbloquearMedico} onTrancar={trancarMedico} />}
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

// ── Trava médica — desbloqueia os campos clínicos com a senha do médico ──
function TravaMedica({ desbloqueado, desbloqueando, senha, verificando, erro, onAbrir, onCancelar, onMudarSenha, onConfirmar, onTrancar }) {
  if (desbloqueado) {
    return (
      <button onClick={onTrancar}
        style={{ width:'100%', marginTop:14, padding:10, background:'none', border:`1px solid ${C.border}`, borderRadius:12, color:C.text3, fontFamily:'inherit', fontSize:12, cursor:'pointer' }}>
        🔒 Trancar agora
      </button>
    )
  }

  if (!desbloqueando) {
    return (
      <button onClick={onAbrir}
        style={{ width:'100%', marginTop:14, padding:12, background:C.accentDim, border:`1px solid rgba(0,212,255,.2)`, borderRadius:12, color:C.accent, fontFamily:'inherit', fontSize:13, fontWeight:700, cursor:'pointer' }}>
        🔓 Desbloquear com senha do médico
      </button>
    )
  }

  return (
    <div style={{ marginTop:14 }}>
      <div style={{ display:'flex', gap:8 }}>
        <input type="password" value={senha} onChange={e => onMudarSenha(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onConfirmar()}
          placeholder="Senha do médico..." autoFocus
          style={{ flex:1, padding:'10px 14px', background:C.surface2, border:`1px solid ${erro?C.danger:C.border}`, borderRadius:12, color:C.text, fontSize:13, outline:'none', fontFamily:'inherit' }} />
        <button onClick={onConfirmar} disabled={verificando}
          style={{ padding:'10px 16px', border:'none', borderRadius:12, background:C.accent, color:'#020C18', fontFamily:'inherit', fontSize:13, fontWeight:700, cursor:verificando?'default':'pointer', opacity:verificando?.6:1 }}>
          {verificando ? '...' : 'OK'}
        </button>
        <button onClick={onCancelar}
          style={{ padding:'10px 14px', border:`1px solid ${C.border}`, borderRadius:12, background:'none', color:C.text3, fontFamily:'inherit', fontSize:13, cursor:'pointer' }}>
          ✕
        </button>
      </div>
      {erro && <div style={{ fontSize:11, color:C.danger, marginTop:6, fontWeight:600 }}>⚠️ {erro}</div>}
    </div>
  )
}

// ── PIN do perfil ativo — protege esse perfil de troca livre por outros no aparelho ──
function PinDoPerfil({ temPin, gerenciando, pinNovo, onAbrir, onFechar, onMudarPin, onDefinir, onRemover }) {
  if (!gerenciando) {
    return (
      <div style={{ margin:'6px 0 16px', padding:'10px 14px', background:C.surface2, borderRadius:14, border:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:12, color:C.text3 }}>🔢 PIN deste perfil</span>
        {temPin ? (
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <span style={{ fontSize:12, color:C.green, fontWeight:600 }}>Ativo</span>
            <button onClick={onRemover} style={{ background:'none', border:'none', color:C.danger, fontSize:11, cursor:'pointer', padding:0 }}>remover</button>
          </div>
        ) : (
          <button onClick={onAbrir} style={{ background:'none', border:'none', color:C.accent, fontSize:12, fontWeight:600, cursor:'pointer', padding:0 }}>
            + definir
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ margin:'6px 0 16px', padding:'12px 14px', background:C.surface2, borderRadius:14, border:`1px solid ${C.border}` }}>
      <div style={{ fontSize:12, color:C.text3, marginBottom:8 }}>Novo PIN (4 números)</div>
      <div style={{ display:'flex', gap:8 }}>
        <input type="password" inputMode="numeric" maxLength={4} value={pinNovo} onChange={e => onMudarPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => e.key === 'Enter' && onDefinir()}
          placeholder="0000" autoFocus
          style={{ flex:1, padding:'10px 14px', background:C.surface3, border:`1px solid ${C.border}`, borderRadius:12, color:C.text, fontSize:14, outline:'none', fontFamily:'inherit', letterSpacing:4, textAlign:'center' }} />
        <button onClick={onDefinir}
          style={{ padding:'10px 16px', border:'none', borderRadius:12, background:C.accent, color:'#020C18', fontFamily:'inherit', fontSize:13, fontWeight:700, cursor:'pointer' }}>
          Salvar
        </button>
        <button onClick={onFechar}
          style={{ padding:'10px 14px', border:`1px solid ${C.border}`, borderRadius:12, background:'none', color:C.text3, fontFamily:'inherit', fontSize:13, cursor:'pointer' }}>
          ✕
        </button>
      </div>
    </div>
  )
}

// ── Seletor de perfis — troca de "regulagem" quando mais de uma pessoa usa o app ──
function SeletorDePerfis({ perfis, perfilAtivoId, onTrocar, onExcluir, criandoNovo, onIniciarNovo, novoNome, onMudarNovoNome, onConfirmarNovo, onCancelarNovo,
  pinAlvo, pinDigitado, erroPin, onMudarPinDigitado, onConfirmarPin, onCancelarPin }) {
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color:C.text3, marginBottom:8 }}>👤 Perfil</div>
      <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:2 }}>
        {perfis.map(p => {
          const ativo = p.id === perfilAtivoId
          return (
            <div key={p.id} onClick={() => onTrocar(p.id)}
              style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, padding:'8px 8px 8px 14px', borderRadius:100, cursor:'pointer', background:ativo?C.accentDim:C.surface2, border:`1px solid ${ativo?'rgba(0,212,255,.3)':C.border}`, color:ativo?C.accent:C.text2, fontSize:13, fontWeight:ativo?700:500, whiteSpace:'nowrap' }}>
              {p.pinHash && <span style={{ fontSize:11, opacity:.7 }}>🔒</span>}
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

      {pinAlvo && (
        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          <input type="password" inputMode="numeric" maxLength={4} value={pinDigitado} onChange={e => onMudarPinDigitado(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && onConfirmarPin()}
            placeholder="PIN..." autoFocus
            style={{ flex:1, padding:'10px 14px', background:C.surface2, border:`1px solid ${erroPin?C.danger:C.border}`, borderRadius:12, color:C.text, fontSize:14, outline:'none', fontFamily:'inherit', letterSpacing:4, textAlign:'center' }} />
          <button onClick={onConfirmarPin}
            style={{ padding:'10px 16px', border:'none', borderRadius:12, background:C.accent, color:'#020C18', fontFamily:'inherit', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            Entrar
          </button>
          <button onClick={onCancelarPin}
            style={{ padding:'10px 14px', border:`1px solid ${C.border}`, borderRadius:12, background:'none', color:C.text3, fontFamily:'inherit', fontSize:13, cursor:'pointer' }}>
            ✕
          </button>
        </div>
      )}
      {pinAlvo && erroPin && <div style={{ fontSize:11, color:C.danger, marginTop:6, fontWeight:600 }}>⚠️ {erroPin}</div>}
    </div>
  )
}
