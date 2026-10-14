// ─────────────────────────────────────────────────────────────────
// components/ScanTab.jsx — Aba principal: achar o alimento
// ─────────────────────────────────────────────────────────────────
// Três caminhos pro mesmo destino (<Calculadora> com os valores):
//   1) Código de barras → GET /barcode?code=...
//   2) Busca por nome   → GET /barcode/fallback?nome=...  (inclui alimentos
//      genéricos da tabela TACO e os "Meus produtos" da conta)
//   3) Foto da tabela nutricional → POST /analisar (OCR)
//
// Quando o código existe na base mas SEM tabela nutricional, o backend avisa
// (`incompleto`) e esta tela oferece foto/digitação em vez de "não encontrado".

import { useState, useEffect, useRef } from 'react'
import { C } from '../theme'
import { Card } from './Layout'
import { apiFetch } from '../api'
import { reduzirImagem } from '../utils/imagem'
import Calculadora from './Calculadora'
import BarcodeScanner from '../BarcodeScanner'

const NUTRICAO_ZERADA = {
  porcao: '', unidade: '', calorias: 0, carboidratos: 0, acucares: 0,
  fibras: 0, proteinas: 0, gorduras: 0, texto_bruto: '',
}

export default function ScanTab({ showToast, acaoInicial }) {
  const [scanning, setScanning]   = useState(false)
  const [loading, setLoading]     = useState(false)
  const [msgLoading, setMsgLoading] = useState('Buscando produto...')
  const [nutrition, setNutrition] = useState(null)
  const [lastCode, setLastCode]   = useState(null)
  const [notFound, setNotFound]   = useState(false)    // código não achado → busca por nome
  const [buscaLivre, setBuscaLivre] = useState(false)  // busca por nome aberta direto da tela inicial
  const [incompleto, setIncompleto] = useState(null)   // { produto, imagem, codigo } sem tabela nutricional
  const [busca, setBusca]         = useState('')
  const [sugestoes, setSugestoes] = useState([])
  const [somenteCorrecao, setSomenteCorrecao] = useState(false)
  const inputFoto = useRef(null)

  // Atalho do PWA (tela inicial → segurar ícone → "Corrigir glicemia")
  // pula direto pra essa tela, sem passar pelo scanner.
  useEffect(() => {
    if (acaoInicial === 'corrigir') iniciarCorrecaoSemAlimento()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleBarcode = async (code) => {
    if (loading) return
    setScanning(false)
    setMsgLoading('Buscando produto...')
    setLoading(true)
    setLastCode(code)
    try {
      const r = await apiFetch(`/barcode?code=${code}`)
      const data = await r.json()

      if (data.incompleto) {
        setIncompleto(data)
        showToast('🟡 Produto sem tabela nutricional na base', 'err')
        return
      }
      if (!data.erro) {
        setNutrition({ ...data, codigo: data.codigo || code, origem: data.fonte === 'Meus produtos' ? 'meu' : 'base' })
        showToast('✅ Produto encontrado!')
        return
      }

      // Produto não encontrado pelo código — oferece busca por nome
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
    setNotFound(false); setBuscaLivre(false); setIncompleto(null)
    setBusca(''); setSugestoes([]); setSomenteCorrecao(false)
  }

  const iniciarCorrecaoSemAlimento = () => {
    setNutrition({ ...NUTRICAO_ZERADA, produto: 'Correção de glicemia' })
    setSomenteCorrecao(true)
  }

  const buscarPorNome = async (nome) => {
    if (!nome.trim()) return
    setMsgLoading('Buscando alimento...')
    setLoading(true)
    try {
      const r = await apiFetch(`/barcode/fallback?nome=${encodeURIComponent(nome)}`)
      const data = await r.json()
      setSugestoes(data.produtos || [])
      if (!data.produtos?.length) showToast('Nenhum resultado — tente a foto da tabela', 'err')
    } catch {
      showToast('❌ Erro na busca', 'err')
    } finally {
      setLoading(false)
    }
  }

  const selecionarSugestao = (p) => {
    setNutrition({
      produto: p.nome, porcao: p.porcao || '—', unidade: p.unidade || '', base: p.base,
      calorias: p.calorias, carboidratos: p.carboidratos, acucares: p.acucares,
      fibras: p.fibras, proteinas: p.proteinas, gorduras: p.gorduras, texto_bruto: '',
      fonte: p.fonte, codigo: lastCode || '', origem: 'busca',
    })
    setNotFound(false); setBuscaLivre(false); setIncompleto(null); setSugestoes([])
  }

  const digitarValores = () => {
    setNutrition({
      ...NUTRICAO_ZERADA, produto: incompleto?.produto || busca || '',
      codigo: lastCode || '', origem: 'manual', fonte: 'Digitado por você',
    })
    setNotFound(false); setBuscaLivre(false); setIncompleto(null)
  }

  const abrirFoto = () => inputFoto.current?.click()

  const aoEscolherFoto = async (e) => {
    const arquivo = e.target.files?.[0]
    e.target.value = ''  // permite escolher a mesma foto de novo
    if (!arquivo) return
    setMsgLoading('Lendo a tabela nutricional...')
    setLoading(true)
    try {
      const imagem = await reduzirImagem(arquivo)
      const r = await apiFetch('/analisar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagem }),
      })
      const data = await r.json()
      if (data.erro) { showToast(`⚠️ ${data.erro}`, 'err'); return }

      const leuAlgo = ['carboidratos', 'calorias'].some(k => Number(data[k]) > 0)
      if (!leuAlgo) {
        showToast('⚠️ Não consegui ler os valores. Tente uma foto mais nítida ou digite.', 'err')
        return
      }
      const nomeLido = data.produto && data.produto !== '—' ? data.produto : ''
      setNutrition({
        ...data, produto: incompleto?.produto || nomeLido || busca || '',
        codigo: lastCode || '', origem: 'ocr', fonte: 'Foto da tabela — confira com a embalagem',
      })
      setNotFound(false); setBuscaLivre(false); setIncompleto(null)
    } catch {
      showToast('❌ Erro ao ler a foto', 'err')
    } finally {
      setLoading(false)
    }
  }

  const inputDeFoto = (
    <input ref={inputFoto} type="file" accept="image/*" capture="environment"
      onChange={aoEscolherFoto} style={{ display:'none' }} />
  )

  if (nutrition) {
    return <Calculadora nutrition={nutrition} showToast={showToast} onReset={reset}
      fonte={somenteCorrecao ? null : (nutrition.fonte || 'Open Food Facts')} somenteCorrecao={somenteCorrecao} />
  }

  const mostrandoBusca = (notFound || buscaLivre) && !scanning && !loading && !incompleto

  return (
    <div style={{ padding:'16px 16px 28px' }}>
      {inputDeFoto}

      {!scanning && !loading && !mostrandoBusca && !incompleto && (
        <TelaInicial onAbrirScanner={() => setScanning(true)}
          onCorrecaoSemAlimento={iniciarCorrecaoSemAlimento}
          onBuscarNome={() => setBuscaLivre(true)} onFoto={abrirFoto} />
      )}

      {loading && (
        <div style={{ textAlign:'center', padding:'60px 0', animation:'fadeIn .3s ease' }}>
          <div style={{ width:52, height:52, border:`3px solid ${C.border}`, borderTopColor:C.accent, borderRadius:'50%', animation:'spin .7s linear infinite', margin:'0 auto 20px', boxShadow:`0 0 20px ${C.accentGlow}` }} />
          <div style={{ fontSize:16, fontWeight:700, color:C.accent, marginBottom:6 }}>{msgLoading}</div>
          {lastCode && <div style={{ fontSize:12, color:C.text3 }}>Código: {lastCode}</div>}
        </div>
      )}

      {scanning && <BarcodeScanner onResult={handleBarcode} onClose={() => setScanning(false)} />}

      {incompleto && !loading && !scanning && (
        <ProdutoSemTabela dados={incompleto} onFoto={abrirFoto} onDigitar={digitarValores}
          onBuscar={() => { setIncompleto(null); setNotFound(true) }} onReset={reset} />
      )}

      {mostrandoBusca && (
        <BuscaManual
          lastCode={buscaLivre ? null : lastCode} busca={busca} setBusca={setBusca}
          sugestoes={sugestoes} onBuscar={buscarPorNome}
          onSelecionar={selecionarSugestao} onFoto={abrirFoto} onDigitar={digitarValores} onReset={reset}
        />
      )}
    </div>
  )
}

function TelaInicial({ onAbrirScanner, onCorrecaoSemAlimento, onBuscarNome, onFoto }) {
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

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
        <button onClick={onBuscarNome}
          style={{ padding:14, border:`1px solid ${C.border}`, borderRadius:14, background:C.surface, color:C.text, fontFamily:'inherit', fontSize:13, fontWeight:600, cursor:'pointer' }}>
          🔍 Buscar pelo nome
        </button>
        <button onClick={onFoto}
          style={{ padding:14, border:`1px solid ${C.border}`, borderRadius:14, background:C.surface, color:C.text, fontFamily:'inherit', fontSize:13, fontWeight:600, cursor:'pointer' }}>
          📷 Foto da tabela
        </button>
      </div>

      <button onClick={onCorrecaoSemAlimento}
        style={{ width:'100%', padding:14, border:`1px solid ${C.border}`, borderRadius:14, background:'none', color:C.text2, fontFamily:'inherit', fontSize:13, fontWeight:600, cursor:'pointer', marginBottom:16, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
        🩸 Só corrigir glicemia (sem comida)
      </button>

      <Card>
        <div style={{ padding:'12px 16px 4px', fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color:C.text3 }}>Dicas</div>
        {[
          ['🍚', 'Comida de casa (arroz, feijão, pão...)? Use "Buscar pelo nome"'],
          ['💡', 'Boa iluminação — evite sombras sobre o código'],
          ['📷', 'Sem código na base? Fotografe a tabela nutricional'],
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

const estiloBotaoSecundario = {
  width:'100%', padding:14, border:`1px solid ${C.border}`, borderRadius:14, background:C.surface,
  color:C.text, fontFamily:'inherit', fontSize:13, fontWeight:600, cursor:'pointer', marginBottom:10,
}

// O código existe na base, mas ninguém cadastrou a tabela nutricional.
function ProdutoSemTabela({ dados, onFoto, onDigitar, onBuscar, onReset }) {
  return (
    <div style={{ animation:'fadeIn .3s ease' }}>
      <div style={{ background:'rgba(255,179,64,.08)', border:'1px solid rgba(255,179,64,.3)', borderRadius:18, padding:'18px 16px', marginBottom:16, textAlign:'center' }}>
        {dados.imagem && <img src={dados.imagem} alt="" style={{ width:72, height:72, objectFit:'contain', borderRadius:12, background:'white', padding:4, marginBottom:10 }} />}
        <div style={{ fontSize:14, fontWeight:700, color:C.warn, marginBottom:6 }}>{dados.produto}</div>
        <div style={{ fontSize:12, color:C.text2, lineHeight:1.6 }}>
          Este produto existe na base, mas <strong style={{ color:C.text }}>sem tabela nutricional cadastrada</strong>.
          Fotografe a tabela da embalagem ou digite os valores.
          {dados.embalagem ? <><br/>Embalagem: {dados.embalagem}</> : null}
        </div>
      </div>

      <button onClick={onFoto}
        style={{ width:'100%', padding:16, border:'none', borderRadius:16, background:`linear-gradient(135deg,${C.accent},#0099CC)`, color:'#020C18', fontFamily:'inherit', fontSize:15, fontWeight:700, cursor:'pointer', marginBottom:10 }}>
        📷 Fotografar tabela nutricional
      </button>
      <button onClick={onDigitar} style={estiloBotaoSecundario}>✍️ Digitar os valores</button>
      <button onClick={onBuscar} style={estiloBotaoSecundario}>🔍 Buscar outro produto pelo nome</button>
      <button onClick={onReset}
        style={{ width:'100%', padding:12, background:'none', border:`1px solid ${C.border}`, borderRadius:14, color:C.text3, fontFamily:'inherit', fontSize:13, cursor:'pointer' }}>
        🔄 Escanear outro código
      </button>
    </div>
  )
}

function BuscaManual({ lastCode, busca, setBusca, sugestoes, onBuscar, onSelecionar, onFoto, onDigitar, onReset }) {
  return (
    <div style={{ animation:'fadeIn .3s ease' }}>
      {lastCode ? (
        <div style={{ background:'rgba(255,115,64,.08)', border:'1px solid rgba(255,115,64,.3)', borderRadius:18, padding:'18px 16px', marginBottom:16, textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:10 }}>🔍</div>
          <div style={{ fontSize:14, fontWeight:700, color:C.orange, marginBottom:6 }}>Produto não encontrado</div>
          <div style={{ fontSize:12, color:C.text2, lineHeight:1.6 }}>
            O código <strong style={{ color:C.text }}>{lastCode}</strong> não está na base de dados.<br/>Tente buscar pelo nome:
          </div>
        </div>
      ) : (
        <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:12 }}>🔍 Buscar alimento pelo nome</div>
      )}

      <div style={{ display:'flex', gap:10, marginBottom:14 }}>
        <input value={busca} onChange={e => setBusca(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onBuscar(busca)}
          placeholder="Ex: arroz, pão francês, ketchup Heinz..."
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
          <div style={{ width:52, height:52, background:C.surface2, borderRadius:12, display:p.imagem?'none':'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>{p.base === '100g' && !p.imagem ? '🍽️' : '📦'}</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.nome}</div>
            <div style={{ fontSize:10, color:C.purple, marginBottom:3 }}>{p.fonte}</div>
            <div style={{ fontSize:12, color:C.accent }}>
              {p.carboidratos}g carbo · {p.calorias} kcal
              <span style={{ color:C.text3 }}> · por {p.porcao && p.porcao !== '—' ? p.porcao : 'porção'}</span>
            </div>
          </div>
          <span style={{ color:C.accent, fontSize:18, opacity:.6 }}>›</span>
        </div>
      ))}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:12 }}>
        <button onClick={onFoto} style={{ ...estiloBotaoSecundario, marginBottom:0 }}>📷 Foto da tabela</button>
        <button onClick={onDigitar} style={{ ...estiloBotaoSecundario, marginBottom:0 }}>✍️ Digitar valores</button>
      </div>

      <button onClick={onReset}
        style={{ width:'100%', padding:12, background:'none', border:`1px solid ${C.border}`, borderRadius:14, color:C.text3, fontFamily:'inherit', fontSize:13, cursor:'pointer', marginTop:10 }}>
        ↩️ Voltar
      </button>
    </div>
  )
}
