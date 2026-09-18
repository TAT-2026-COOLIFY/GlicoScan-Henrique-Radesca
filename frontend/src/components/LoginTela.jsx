// ─────────────────────────────────────────────────────────────────
// components/LoginTela.jsx — Entrar / criar conta (Supabase Auth)
// ─────────────────────────────────────────────────────────────────
// Depois do login o App troca sozinho de tela (onAuthStateChange em
// App.jsx) — aqui só chamamos o Supabase e mostramos o erro, se houver.

import { useState } from 'react'
import { C } from '../theme'
import { supabase } from '../supabase'

const MENSAGENS = {
  'Invalid login credentials': 'E-mail ou senha incorretos',
  'User already registered': 'Esse e-mail já tem conta — use "Entrar"',
  'Email not confirmed': 'E-mail ainda não confirmado',
}

const estiloCampo = {
  width: '100%', padding:'13px 16px', background:C.surface2, border:`1px solid ${C.border}`,
  borderRadius:14, color:C.text, fontSize:14, outline:'none', fontFamily:'inherit', boxSizing:'border-box',
}

export default function LoginTela() {
  const [criando, setCriando] = useState(false)
  const [email, setEmail]     = useState('')
  const [senha, setSenha]     = useState('')
  const [erro, setErro]       = useState('')
  const [aviso, setAviso]     = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e) => {
    e.preventDefault()
    setErro(''); setAviso(''); setEnviando(true)
    const credenciais = { email: email.trim(), password: senha }
    const { data, error } = criando
      ? await supabase.auth.signUp(credenciais)
      : await supabase.auth.signInWithPassword(credenciais)
    setEnviando(false)

    if (error) {
      setErro(MENSAGENS[error.message] || error.message)
    } else if (criando && !data.session) {
      setAviso('Conta criada. Confirme o e-mail que enviamos e depois use "Entrar".')
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', height:'100%', minHeight:'844px', padding:'0 24px', background:C.bg, color:C.text, fontFamily:"'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ textAlign:'center', marginBottom:28 }}>
        <div style={{ fontSize:44, marginBottom:8 }}>💉</div>
        <div style={{ fontSize:26, fontWeight:800 }}>Glico<span style={{ color:C.accent }}>Scan</span></div>
        <div style={{ fontSize:13, color:C.text3, marginTop:6 }}>{criando ? 'Crie sua conta' : 'Entre na sua conta'}</div>
      </div>

      <form onSubmit={enviar} style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mail"
          autoComplete="email" required style={estiloCampo} />
        <input type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="Senha (mín. 6 caracteres)"
          autoComplete={criando ? 'new-password' : 'current-password'} minLength={6} required style={estiloCampo} />

        {erro && <div style={{ fontSize:12, color:C.danger, fontWeight:600 }}>⚠️ {erro}</div>}
        {aviso && <div style={{ fontSize:12, color:C.green, fontWeight:600 }}>✓ {aviso}</div>}

        <button type="submit" disabled={enviando}
          style={{ padding:16, border:'none', borderRadius:16, background:`linear-gradient(135deg,${C.accent},#0099CC)`, color:'#020C18', fontFamily:'inherit', fontSize:15, fontWeight:700, cursor:enviando?'default':'pointer', opacity:enviando?.6:1 }}>
          {enviando ? '...' : criando ? 'Criar conta' : 'Entrar'}
        </button>
      </form>

      <button onClick={() => { setCriando(c => !c); setErro(''); setAviso('') }}
        style={{ marginTop:16, background:'none', border:'none', color:C.accent, fontFamily:'inherit', fontSize:13, fontWeight:600, cursor:'pointer' }}>
        {criando ? 'Já tenho conta — Entrar' : 'Não tenho conta — Criar'}
      </button>

      <div style={{ marginTop:24, fontSize:11, color:C.text3, textAlign:'center', lineHeight:1.6 }}>
        ⚕️ Auxiliar de decisão. Valide sempre com seu médico.
      </div>
    </div>
  )
}
