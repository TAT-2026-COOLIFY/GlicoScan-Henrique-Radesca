import { useEffect, useRef, useState } from 'react'

const C = {
  bg:'#050A12', surface:'#0A1220', surface2:'#0F1B2D',
  border:'#1E3050', accent:'#00D4FF', accentGlow:'rgba(0,212,255,.25)',
  green:'#00E5A0', danger:'#FF4D6D', warn:'#FFB340',
  text:'#E8F4FF', text2:'#8BA8C8', text3:'#4A6A8A',
}

// Detecta se é iOS
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)

// Detecta se BarcodeDetector está disponível (Android Chrome)
const temDetectorNativo = 'BarcodeDetector' in window

export default function BarcodeScanner({ onResult, onClose }) {
  const [modo,    setModo]    = useState(temDetectorNativo ? 'nativo' : isIOS ? 'html5' : 'foto')
  const [status,  setStatus]  = useState('iniciando')
  const [dica,    setDica]    = useState(false)
  const [torch,   setTorch]   = useState(false)
  const [error,   setError]   = useState(null)
  const videoRef   = useRef(null)
  const inputRef   = useRef(null)
  const streamRef  = useRef(null)
  const rafRef     = useRef(null)
  const trackRef   = useRef(null)

  // ── MODO NATIVO: BarcodeDetector (Android Chrome 83+) ──────────
  useEffect(() => {
    if (modo !== 'nativo') return
    let active = true

    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width:  { ideal: 1280 },
            height: { ideal: 720 },
          }
        })
        if (!active) { stream.getTracks().forEach(t => t.stop()); return }

        streamRef.current = stream
        trackRef.current  = stream.getVideoTracks()[0]

        // Tenta foco contínuo
        try {
          await trackRef.current.applyConstraints({
            advanced: [{ focusMode: 'continuous' }]
          })
        } catch {}

        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setStatus('ativo')

        const detector = new window.BarcodeDetector({
          formats: ['ean_13','ean_8','code_128','code_39','upc_a','upc_e','itf','qr_code']
        })

        const scan = async () => {
          if (!active) return
          if (videoRef.current?.readyState >= 2) {
            try {
              const results = await detector.detect(videoRef.current)
              if (results?.length > 0) {
                stopAll()
                onResult(results[0].rawValue)
                return
              }
            } catch {}
          }
          rafRef.current = requestAnimationFrame(scan)
        }
        rafRef.current = requestAnimationFrame(scan)
        setTimeout(() => { if (active) setDica(true) }, 6000)

      } catch(e) {
        if (!active) return
        if (/NotAllowed|Permission/i.test(e?.name + e?.message)) {
          setError('Permissão negada.\nToque no cadeado → Câmera → Permitir')
        } else {
          // BarcodeDetector falhou — tenta modo foto
          setModo('foto')
        }
      }
    }

    init()
    return () => { active = false; stopAll() }
  }, [modo])

  // ── MODO HTML5: iPhone via html5-qrcode ────────────────────────
  useEffect(() => {
    if (modo !== 'html5') return
    let active = true
    let scanner = null
    // Trava pra garantir que stop() só é chamado UMA vez.
    // O html5-qrcode lança erro SÍNCRONO (não Promise rejeitada)
    // se stop() for chamado num scanner que já não está rodando —
    // e um .catch() não pega throw síncrono, então sem essa trava
    // a segunda chamada (do cleanup do useEffect) derrubava a tela.
    let stopped = false

    const safeStop = async () => {
      if (stopped || !scanner) return
      stopped = true
      try {
        await scanner.stop()
      } catch (e) {
        console.warn('Erro ao parar scanner (ignorado):', e)
      }
    }

    const init = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (!active) return
        scanner = new Html5Qrcode('gs-html5-reader')
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 15, qrbox: { width: 240, height: 100 },
            experimentalFeatures: { useBarCodeDetectorIfSupported: true } },
          (code) => { safeStop(); onResult(code) },
          () => {}
        )
        setStatus('ativo')
        setTimeout(() => { if (active) setDica(true) }, 6000)
      } catch(e) {
        if (!active) return
        setError('Erro câmera: ' + (e?.message || String(e)))
      }
    }

    init()
    return () => {
      active = false
      safeStop()
    }
  }, [modo])

  const stopAll = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
  }

  const toggleTorch = async () => {
    if (!trackRef.current) return
    try {
      await trackRef.current.applyConstraints({ advanced: [{ torch: !torch }] })
      setTorch(!torch)
    } catch {}
  }

  // ── MODO FOTO: captura imagem e decodifica ────────────────────
  const handleFoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus('processando')

    try {
      // Tenta BarcodeDetector na imagem
      if (temDetectorNativo) {
        const img = await createImageBitmap(file)
        const detector = new window.BarcodeDetector({
          formats: ['ean_13','ean_8','code_128','code_39','upc_a','upc_e','itf','qr_code']
        })
        const results = await detector.detect(img)
        if (results?.length > 0) {
          onResult(results[0].rawValue)
          return
        }
      }
      setError('Nenhum código encontrado na foto.\nTente novamente com melhor iluminação.')
      setStatus('ativo')
    } catch(e) {
      setError('Erro ao processar foto: ' + e?.message)
    }
  }

  const handleClose = () => { stopAll(); onClose() }

  if (error) return (
    <div style={{ textAlign:'center', padding:'32px 20px' }}>
      <div style={{ fontSize:44, marginBottom:14 }}>📷</div>
      <div style={{ fontSize:14, color:C.danger, fontWeight:700, marginBottom:10 }}>Ops!</div>
      <div style={{ fontSize:12, color:C.text2, lineHeight:1.8, whiteSpace:'pre-line', marginBottom:24 }}>{error}</div>
      <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
        <button onClick={()=>{ setError(null); setStatus('iniciando') }}
          style={{ padding:'11px 20px', background:C.accentDim, border:`1px solid rgba(0,212,255,.3)`, borderRadius:12, color:C.accent, fontFamily:'inherit', fontSize:13, cursor:'pointer' }}>
          Tentar de novo
        </button>
        <button onClick={handleClose}
          style={{ padding:'11px 20px', background:C.surface2, border:`1px solid ${C.border}`, borderRadius:12, color:C.text2, fontFamily:'inherit', fontSize:13, cursor:'pointer' }}>
          Voltar
        </button>
      </div>
    </div>
  )

  // ── MODO FOTO (Android sem foco) ─────────────────────────────
  if (modo === 'foto') return (
    <div style={{ borderRadius:20, overflow:'hidden', background:C.surface }}>
      <div style={{ padding:'28px 24px', textAlign:'center' }}>
        <div style={{ width:80, height:80, borderRadius:22, background:C.accentDim, border:`1px solid rgba(0,212,255,.2)`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', boxShadow:`0 0 30px ${C.accentGlow}`, fontSize:38 }}>
          📸
        </div>
        <div style={{ fontSize:17, fontWeight:700, color:C.text, marginBottom:8 }}>Fotografar Código</div>
        <div style={{ fontSize:13, color:C.text2, lineHeight:1.7, marginBottom:24 }}>
          Abra a câmera do celular, fotografe o código de barras e selecione a foto.
          <br/>
          <span style={{ color:C.accent }}>A câmera nativa foca perfeitamente!</span>
        </div>

        <input ref={inputRef} type="file" accept="image/*" capture="environment"
          onChange={handleFoto} style={{ display:'none' }} />

        {status === 'processando' ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, border:`3px solid ${C.border}`, borderTopColor:C.accent, borderRadius:'50%', animation:'spin .7s linear infinite' }} />
            <div style={{ fontSize:13, color:C.text3 }}>Lendo código...</div>
          </div>
        ) : (
          <button onClick={()=>inputRef.current?.click()}
            style={{ width:'100%', padding:16, border:'none', borderRadius:16, background:`linear-gradient(135deg,${C.accent},#0099CC)`, color:'#020C18', fontFamily:'inherit', fontSize:15, fontWeight:700, cursor:'pointer', boxShadow:`0 8px 32px ${C.accentGlow}` }}>
            📸 Abrir Câmera
          </button>
        )}
      </div>

      <div style={{ background:C.surface2, padding:'12px 18px', display:'flex', gap:10, alignItems:'flex-start', borderTop:`1px solid ${C.border}` }}>
        <span style={{ fontSize:16, flexShrink:0 }}>💡</span>
        <span style={{ fontSize:12, color:C.text3, lineHeight:1.6 }}>
          Dica: fotografe o código de barras com boa iluminação e segure firme para não borrar.
        </span>
      </div>

      <button onClick={handleClose}
        style={{ width:'100%', padding:13, background:'none', border:'none', borderTop:`1px solid ${C.border}`, color:C.text3, fontFamily:'inherit', fontSize:13, cursor:'pointer' }}>
        ← Voltar
      </button>
    </div>
  )

  // ── MODO NATIVO / HTML5: câmera ao vivo ────────────────────────
  return (
    <div style={{ borderRadius:20, overflow:'hidden', background:'#000', position:'relative' }}>
      {/* Vídeo nativo */}
      {modo === 'nativo' && (
        <div style={{ position:'relative', width:'100%', aspectRatio:'4/3' }}>
          <video ref={videoRef} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} playsInline muted />

          {/* Overlay */}
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
            <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.45)' }} />
            <div style={{ position:'relative', width:260, height:110, zIndex:2 }}>
              <div style={{ position:'absolute', inset:0, border:`2px solid ${C.accent}`, borderRadius:10, boxShadow:`0 0 0 999px rgba(0,0,0,.5), 0 0 20px ${C.accentGlow}` }} />
              <div style={{ position:'absolute', left:4, right:4, height:2, background:`linear-gradient(90deg,transparent,${C.accent},transparent)`, borderRadius:2, animation:'scanLine 2s ease-in-out infinite' }} />
              {[['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(([v,h],i)=>(
                <div key={i} style={{ position:'absolute', width:18, height:18, [v]:-1, [h]:-1, borderColor:C.green, borderStyle:'solid',
                  borderWidth:v==='top'&&h==='left'?'3px 0 0 3px':v==='top'&&h==='right'?'3px 3px 0 0':v==='bottom'&&h==='left'?'0 0 3px 3px':'0 3px 3px 0' }} />
              ))}
            </div>
          </div>

          {dica && (
            <div style={{ position:'absolute', bottom:8, left:12, right:12, zIndex:5 }}>
              <div style={{ background:'rgba(5,10,18,.9)', border:`1px solid rgba(255,179,64,.3)`, borderRadius:12, padding:'8px 14px', fontSize:12, color:C.warn, textAlign:'center', lineHeight:1.6 }}>
                💡 Não está focando? Toque em <strong>Foto</strong> abaixo
              </div>
            </div>
          )}
        </div>
      )}

      {/* HTML5 fallback (iPhone) */}
      {modo === 'html5' && <div id="gs-html5-reader" style={{ width:'100%' }} />}

      {/* Loading */}
      {status === 'iniciando' && (
        <div style={{ height:280, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, position:'absolute', inset:0, background:C.bg }}>
          <div style={{ width:44, height:44, border:`3px solid ${C.border}`, borderTopColor:C.accent, borderRadius:'50%', animation:'spin .7s linear infinite' }} />
          <div style={{ fontSize:13, color:C.text3 }}>Iniciando câmera...</div>
        </div>
      )}

      {/* Controles topo */}
      <div style={{ position:'absolute', top:12, left:12, right:12, display:'flex', justifyContent:'space-between', zIndex:10 }}>
        <button onClick={handleClose} style={{ width:38, height:38, borderRadius:10, background:'rgba(5,10,18,.85)', border:`1px solid rgba(0,212,255,.2)`, color:C.text, fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        <div style={{ display:'flex', gap:8 }}>
          {modo === 'nativo' && (
            <button onClick={toggleTorch} style={{ width:38, height:38, borderRadius:10, background:torch?'rgba(0,212,255,.2)':'rgba(5,10,18,.85)', border:`1px solid ${torch?C.accent:'rgba(0,212,255,.2)'}`, color:torch?C.accent:C.text2, fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>🔦</button>
          )}
          {/* Botão para modo foto (fallback manual) */}
          {modo === 'nativo' && (
            <button onClick={()=>setModo('foto')} style={{ height:38, padding:'0 12px', borderRadius:10, background:'rgba(5,10,18,.85)', border:`1px solid rgba(0,212,255,.2)`, color:C.text2, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>📸 Foto</button>
          )}
        </div>
      </div>

      {/* Instrução */}
      <div style={{ background:C.surface, padding:'12px 18px', display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:8, height:8, borderRadius:'50%', background:C.green, animation:'pulse 1.5s infinite', flexShrink:0 }}/>
        <span style={{ fontSize:12, color:C.text2, lineHeight:1.5 }}>
          {modo==='nativo' ? 'Aponte para o código • Se não focar, toque em 📸 Foto' : 'Centralize o código na moldura • 20-30cm de distância'}
        </span>
      </div>

      <style>{`
        @keyframes scanLine { 0%,100%{top:10%;opacity:0} 10%{opacity:1} 50%{top:80%} 90%{opacity:1} }
        #gs-html5-reader video { width:100% !important; }
        #gs-html5-reader img { display:none !important; }
      `}</style>
    </div>
  )
}
