// ─────────────────────────────────────────────────────────────────
// components/ScanTab.jsx — Aba principal: escanear código de barras
// ─────────────────────────────────────────────────────────────────
// Fluxo:
//   1) Usuário abre o scanner (câmera) e escaneia um código
//   2) Frontend chama GET /barcode?code=... no backend
//   3) Se achar → mostra <Calculadora> com os dados
//   4) Se não achar → oferece busca manual por nome do produto

import { useState, useEffect } from 'react'
import { C } from '../theme'
import { Card } from './Layout'
import { apiFetch } from '../api'
import Calculadora from './Calculadora'
import BarcodeScanner from '../BarcodeScanner'

export default function ScanTab({ showToast, acaoInicial }) {
  const [scanning, setScanning]   = useState(false)
  const [loading, setLoading]     = useState(false)
  const [nutrition, setNutrition] = useState(null)
  const [lastCode, setLastCode]   = useState(null)
  const [notFound, setNotFound]   = useState(false)
  const [busca, setBusca]         = useState('')
  const [sugestoes, setSugestoes] = useState([])
  const [somenteCorrecao, setSomenteCorrecao] = useState(false)

  // Atalho do PWA (tela inicial → segurar ícone → "Corrigir glicemia")
  // pula direto pra essa tela, sem passar pelo scanner.
  useEffect(() => {
    if (acaoInicial === 'corrigir') iniciarCorrecaoSemAlimento()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleBarcode = async (code) => {
    if (loading) return
    setScanning(false)
    setLoading(true)
    setLastCode(code)
    try {
      const r = await apiFetch(`/barcode?code=${code}`)
      const data = await r.json()

      if (!data.erro) {
        setNutrition(data)
        showToast('✅ Produto encontrado!')
        return
      }

      // Produto não encontrado pelo código — oferece busca manual por nome
      showToast('⚠️ Produto não encontrado. Busque pelo nome!', 'err')
      setNotFound(true)
    } catch {
      showToast('❌ Erro ao buscar produto', 'err')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setNutrition(null); setLastCode(null); setScanning(false)
    setNotFound(false); setBusca(''); setSugestoes([]); setSomenteCorrecao(false)
  }

  const iniciarCorrecaoSemAlimento = () => {
    setNutrition({
      produto: 'Correção de glicemia', porcao: '', unidade: '',
      calorias: 0, carboidratos: 0, acucares: 0, fibras: 0, proteinas: 0, gorduras: 0, texto_bruto: '',
    })
    setSomenteCorrecao(true)
  }

  const buscarPorNome = async (nome) => {
    if (!nome.trim()) return
    setLoading(true)
    try {
      const r = await apiFetch(`/barcode/fallback?nome=${encodeURIComponent(nome)}`)
      const data = await r.json()
      setSugestoes(data.produtos || [])
      if (!data.produtos?.length) showToast('Nenhum resultado', 'err')
    } catch {
      showToast('❌ Erro', 'err')
    } finally {
      setLoading(false)
    }
  }

  const selecionarSugestao = (p) => {
    setNutrition({
      produto: p.nome, porcao: p.porcao || '—', unidade: '',
      calorias: p.calorias, carboidratos: p.carboidratos, acucares: p.acucares,
      fibras: p.fibras, proteinas: p.proteinas, gorduras: p.gorduras, texto_bruto: '',
    })
    setNotFound(false); setSugestoes([])
  }

  if (nutrition) {
    return <Calculadora nutrition={nutrition} showToast={showToast} onReset={reset}
      fonte={somenteCorrecao ? null : 'Open Food Facts'} somenteCorrecao={somenteCorrecao} />
  }

  return (
    <div style={{ padding:'16px 16px 28px' }}>
      {!scanning && !loading && <TelaInicial onAbrirScanner={() => setScanning(true)} onCorrecaoSemAlimento={iniciarCorrecaoSemAlimento} />}

      {loading && (
        <div style={{ textAlign:'center', padding:'60px 0', animation:'fadeIn .3s ease' }}>
          <div style={{ width:52, height:52, border:`3px solid ${C.border}`, borderTopColor:C.accent, borderRadius:'50%', animation:'spin .7s linear infinite', margin:'0 auto 20px', boxShadow:`0 0 20px ${C.accentGlow}` }} />
          <div style={{ fontSize:16, fontWeight:700, color:C.accent, marginBottom:6 }}>Buscando produto...</div>
          <div style={{ fontSize:12, color:C.text3 }}>Código: {lastCode}</div>
        </div>
      )}

      {scanning && <BarcodeScanner onResult={handleBarcode} onClose={() => setScanning(false)} />}

      {notFound && !scanning && !loading && (
        <BuscaManual
          lastCode={lastCode} busca={busca} setBusca={setBusca}
          sugestoes={sugestoes} onBuscar={buscarPorNome}
          onSelecionar={selecionarSugestao} onReset={reset}
        />
      )}
    </div>
  )
}

function TelaInicial({ onAbrirScanner, onCorrecaoSemAlimento }) {
  return (
    <>
      <div style={{ background:`linear-gradient(135deg,${C.surface2},${C.surface3})`, border:`1px solid ${C.border}`, borderRadius:24, padding:'32px 24px', marginBottom:20, textAlign:'center', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:-30, right:-30, width:120, height:120, background:`radial-gradient(circle,${C.accentGlow} 0%,transparent 70%)`, pointerEvents:'none' }} />
        <div style={{ width:80, height:80, borderRadius:22, background:C.accentDim, border:`1px solid rgba(0,212,255,.2)`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', boxShadow:`0 0 30px ${C.accentGlow}` }}>
          <IconeBarras cor={C.accent} tamanho={40} />
        </div>
        <div style={{ fontSize:20, fontWeight:800, color:C.text, marginBottom:8 }}>Escanear Código de Barras</div>
        <div style={{ fontSize:13, color:C.text2, lineHeight:1.6, marginBottom:4 }}>Aponte a câmera para o código de barras da embalagem</div>
        <div style={{ fontSize:12, color:C.text3 }}>Dados nutricionais carregam automaticamente</div>
      </div>

      <button onClick={onAbrirScanner}
        style={{ width:'100%', padding:18, border:'none', borderRadius:16, background:`linear-gradient(135deg,${C.accent},#0099CC)`, color:'#020C18', fontFamily:'inherit', fontSize:16, fontWeight:700, cursor:'pointer', marginBottom:12, boxShadow:`0 8px 32px ${C.accentGlow}`, display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
        <IconeBarras cor="#020C18" tamanho={20} />
        Abrir Scanner
      </button>

      <button onClick={onCorrecaoSemAlimento}
        style={{ width:'100%', padding:14, border:`1px solid ${C.border}`, borderRadius:14, background:'none', color:C.text2, fontFamily:'inherit', fontSize:13, fontWeight:600, cursor:'pointer', marginBottom:16, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
        🩸 Só corrigir glicemia (sem comida)
      </button>

      <Card>
        <div style={{ padding:'12px 16px 4px', fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color:C.text3 }}>Dicas</div>
        {[
          ['💡', 'Boa iluminação — evite sombras sobre o código'],
          ['📐', 'Mantenha a câmera paralela ao código'],
          ['🎯', 'Centralize o código na mira da câmera'],
          ['🇧🇷', 'Códigos 789 são produtos brasileiros'],
        ].map(([icone, texto]) => (
          <div key={texto} style={{ display:'flex', gap:12, alignItems:'center', padding:'10px 16px', borderTop:`1px solid ${C.border}` }}>
            <span style={{ fontSize:15, width:20, textAlign:'center' }}>{icone}</span>
            <span style={{ fontSize:12, color:C.text2 }}>{texto}</span>
          </div>
        ))}
      </Card>
    </>
  )
}

function IconeBarras({ cor, tamanho }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 40 40" fill="none">
      <rect x="2" y="6" width="3" height="28" fill={cor}/>
      <rect x="7" y="6" width="2" height="28" fill={cor}/>
      <rect x="11" y="6" width="4" height="28" fill={cor}/>
      <rect x="17" y="6" width="2" height="28" fill={cor}/>
      <rect x="21" y="6" width="3" height="28" fill={cor}/>
      <rect x="26" y="6" width="2" height="28" fill={cor}/>
      <rect x="30" y="6" width="4" height="28" fill={cor}/>
    </svg>
  )
}

function BuscaManual({ lastCode, busca, setBusca, sugestoes, onBuscar, onSelecionar, onReset }) {
  return (
    <div style={{ animation:'fadeIn .3s ease' }}>
      <div style={{ background:'rgba(255,115,64,.08)', border:'1px solid rgba(255,115,64,.3)', borderRadius:18, padding:'18px 16px', marginBottom:16, textAlign:'center' }}>
        <div style={{ fontSize:32, marginBottom:10 }}>🔍</div>
        <div style={{ fontSize:14, fontWeight:700, color:C.orange, marginBottom:6 }}>Produto não encontrado</div>
        <div style={{ fontSize:12, color:C.text2, lineHeight:1.6 }}>
          O código <strong style={{ color:C.text }}>{lastCode}</strong> não está na base de dados.<br/>Tente buscar pelo nome do produto:
        </div>
      </div>

      <div style={{ display:'flex', gap:10, marginBottom:14 }}>
        <input value={busca} onChange={e => setBusca(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onBuscar(busca)}
          placeholder="Ex: Ketchup Heinz..."
          style={{ flex:1, padding:'13px 16px', background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, color:C.text, fontSize:14, outline:'none', fontFamily:'inherit' }}
          autoFocus />
        <button onClick={() => onBuscar(busca)}
          style={{ padding:'13px 18px', border:'none', borderRadius:14, background:`linear-gradient(135deg,${C.accent},#0099CC)`, color:'#020C18', fontFamily:'inherit', fontSize:14, fontWeight:700, cursor:'pointer' }}>
          Buscar
        </button>
      </div>

      {sugestoes.map((p, i) => (
        <div key={i} onClick={() => onSelecionar(p)}
          style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:'12px 14px', marginBottom:8, cursor:'pointer', display:'flex', gap:12, alignItems:'center' }}>
          {p.imagem
            ? <img src={p.imagem} style={{ width:52, height:52, objectFit:'contain', borderRadius:12, background:'white', padding:4, flexShrink:0 }} alt="" onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
            : null}
          <div style={{ width:52, height:52, background:C.surface2, borderRadius:12, display:p.imagem?'none':'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>📦</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.nome}</div>
            <div style={{ fontSize:10, color:C.purple, marginBottom:3 }}>{p.fonte}</div>
            <div style={{ fontSize:12, color:C.accent }}>{p.carboidratos}g carbo · {p.calorias} kcal</div>
          </div>
          <span style={{ color:C.accent, fontSize:18, opacity:.6 }}>›</span>
        </div>
      ))}

      <button onClick={onReset}
        style={{ width:'100%', padding:12, background:'none', border:`1px solid ${C.border}`, borderRadius:14, color:C.text3, fontFamily:'inherit', fontSize:13, cursor:'pointer', marginTop:8 }}>
        🔄 Escanear outro código
      </button>
    </div>
  )
}
