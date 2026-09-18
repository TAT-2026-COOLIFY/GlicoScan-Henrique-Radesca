// ─────────────────────────────────────────────────────────────────
// components/LoginTela.jsx — Entrar (Supabase Auth)
// ─────────────────────────────────────────────────────────────────
// Só login: contas são criadas por quem administra, no painel do
// Supabase (Authentication → Users). Cadastro público está desligado lá.
// Depois do login o App troca sozinho de tela (onAuthStateChange em
// App.jsx) — aqui só chamamos o Supabase e mostramos o erro, se houver.

import { useState } from 'react'
import { C } from '../theme'
import { supabase } from '../supabase'

const MENSAGENS = {
  'Invalid login credentials': 'E-mail ou senha incorretos',
  'Email not confirmed': 'E-mail ainda não confirmado',
}

const estiloCampo = {
  width: '100%', padding:'13px 16px', background:C.surface2, border:`1px solid ${C.border}`,
  borderRadius:14, color:C.text, fontSize:14, outline:'none', fontFamily:'inherit', boxSizing:'border-box',
}

export default function LoginTela() {
  const [email, setEmail]     = useState('')
  const [senha, setSenha]     = useState('')
  const [erro, setErro]       = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e) => {
    e.preventDefault()
    setErro(''); setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    setEnviando(false)
    if (error) setErro(MENSAGENS[error.message] || error.message)
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', height:'100%', minHeight:'844px', padding:'0 24px', background:C.bg, color:C.text, fontFamily:"'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ textAlign:'center', marginBottom:28 }}>
        <div style={{ fontSize:44, marginBottom:8 }}>💉</div>
        <div style={{ fontSize:26, fontWeight:800 }}>Glico<span style={{ color:C.accent }}>Scan</span></div>
        <div style={{ fontSize:13, color:C.text3, marginTop:6 }}>Entre na sua conta</div>
      </div>

      <form onSubmit={enviar} style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mail"
          autoComplete="email" required style={estiloCampo} />
        <input type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="Senha"
          autoComplete="current-password" required style={estiloCampo} />

        {erro && <div style={{ fontSize:12, color:C.danger, fontWeight:600 }}>⚠️ {erro}</div>}

        <button type="submit" disabled={enviando}
          style={{ padding:16, border:'none', borderRadius:16, background:`linear-gradient(135deg,${C.accent},#0099CC)`, color:'#020C18', fontFamily:'inherit', fontSize:15, fontWeight:700, cursor:enviando?'default':'pointer', opacity:enviando?.6:1 }}>
          {enviando ? '...' : 'Entrar'}
        </button>
      </form>

      <div style={{ marginTop:24, fontSize:11, color:C.text3, textAlign:'center', lineHeight:1.6 }}>
        ⚕️ Auxiliar de decisão. Valide sempre com seu médico.
      </div>
    </div>
  )
}
