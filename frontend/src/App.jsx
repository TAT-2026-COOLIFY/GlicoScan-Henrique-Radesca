// ─────────────────────────────────────────────────────────────────
// App.jsx — Componente raiz
// ─────────────────────────────────────────────────────────────────
// Responsabilidade única: controlar qual aba está ativa (Scan,
// Perfil, Histórico) e exibir notificações (toast). A lógica de cada
// aba fica isolada no próprio componente dela — ver components/.

import { useState, useRef, useCallback, useEffect } from 'react'
import { C } from './theme'
import { Header, BottomNav } from './components/Layout'
import ScanTab from './components/ScanTab'
import PerfilTab from './components/PerfilTab'
import HistTab from './components/HistTab'
import LoginTela from './components/LoginTela'
import { lembretes } from './utils/lembretes'
import { storage } from './utils/storage'
import { supabase } from './supabase'

// Atalho do PWA (manifest.json → shortcuts) abre direto em "Corrigir
// glicemia sem comida" via ?acao=corrigir, sem passar pela tela inicial.
const ACAO_INICIAL = new URLSearchParams(window.location.search).get('acao')

// Portão de login: sem conta ativa, só a tela de login. `key` recria o app
// inteiro ao trocar de conta — nada do estado do usuário anterior sobra.
export default function App() {
  const [sessao, setSessao] = useState(undefined) // undefined = ainda carregando

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = supabase.auth.onAuthStateChange((_evento, nova) => setSessao(nova))
    return () => data.subscription.unsubscribe()
  }, [])

  if (sessao === undefined) return null
  if (!sessao) return <LoginTela />

  storage.definirUsuario(sessao.user.id)
  return <AppLogado key={sessao.user.id} />
}

function AppLogado() {
  const [tab, setTab]     = useState('scan')
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef()

  // Checa lembretes de medição a cada minuto (só funciona com o app
  // aberto — sem servidor de push, ver utils/lembretes.js).
  useEffect(() => {
    lembretes.verificarEDisparar()
    const id = setInterval(() => lembretes.verificarEDisparar(), 60_000)
    return () => clearInterval(id)
  }, [])

  // Header lê o perfil ativo direto do storage a cada render — mas trocar de
  // perfil dentro da aba Config é estado local dela, então o Header só some
  // do "perfil antigo" quando o App re-renderiza por outro motivo. Esse
  // contador força esse re-render assim que o perfil ativo muda.
  const [perfilVersao, setPerfilVersao] = useState(0)
  const avisarPerfilMudou = useCallback(() => setPerfilVersao(v => v + 1), [])

  const showToast = useCallback((mensagem, tipo = 'ok') => {
    clearTimeout(toastTimerRef.current)
    setToast({ msg: mensagem, type: tipo })
    toastTimerRef.current = setTimeout(() => setToast(null), 3200)
  }, [])

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:'844px', background:C.bg, color:C.text, fontFamily:"'Plus Jakarta Sans', sans-serif", position:'relative', overflow:'hidden', zIndex:1 }}>
      <Header tab={tab} perfilVersao={perfilVersao} />

      <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', position:'relative' }}>
        {tab === 'scan'   && <ScanTab   showToast={showToast} acaoInicial={ACAO_INICIAL} />}
        {tab === 'perfil' && <PerfilTab showToast={showToast} onPerfilMudou={avisarPerfilMudou} />}
        {tab === 'hist'   && <HistTab   showToast={showToast} />}
      </div>

      <BottomNav tab={tab} setTab={setTab} />

      {toast && (
        <div style={{ position:'absolute', bottom:88, left:'50%', transform:'translateX(-50%)', background:'#162338', backdropFilter:'blur(20px)', border:`1px solid ${toast.type==='ok'?'rgba(0,229,160,.3)':'rgba(255,77,109,.3)'}`, color:toast.type==='ok'?C.green:C.danger, padding:'11px 22px', borderRadius:100, fontSize:13, fontWeight:600, whiteSpace:'nowrap', zIndex:999, boxShadow:'0 8px 40px rgba(0,0,0,.6)', animation:'fadeUp .25s ease both' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
