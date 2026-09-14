// ─────────────────────────────────────────────────────────────────
// components/Layout.jsx — Peças estruturais reutilizáveis da UI
// ─────────────────────────────────────────────────────────────────
// Header (topo), BottomNav (navegação inferior) e Card (contêiner
// padrão com cantos arredondados) são usados em várias telas, então
// ficam agrupados aqui em vez de duplicados em cada arquivo.

import { C } from '../theme'
import { storage } from '../utils/storage'

export function Header({ tab }) {
  const labels = { scan: 'Escanear Código', perfil: 'Configurações', hist: 'Histórico' }
  const nomePerfil = storage.getPerfilAtivo().nome
  return (
    <div style={{ padding:'20px 22px 14px', flexShrink:0, borderBottom:`1px solid ${C.border}`, background:`linear-gradient(180deg,${C.surface} 0%,transparent 100%)` }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:38, height:38, borderRadius:12, background:`linear-gradient(135deg,${C.accent},${C.green})`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 20px ${C.accentGlow}`, flexShrink:0 }}>
            <span style={{ fontSize:18 }}>💉</span>
          </div>
          <div>
            <div style={{ fontSize:20, fontWeight:800, letterSpacing:'-.5px', lineHeight:1 }}>
              Glico<span style={{ color:C.accent }}>Scan</span>
            </div>
            <div style={{ fontSize:11, color:C.text3, marginTop:2 }}>{labels[tab]}</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', background:C.accentDim, border:`1px solid rgba(0,212,255,.2)`, borderRadius:100 }}>
          <span style={{ fontSize:13 }}>👤</span>
          <span style={{ fontSize:11, fontWeight:700, color:C.accent, letterSpacing:.3, maxWidth:90, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{nomePerfil}</span>
        </div>
      </div>
    </div>
  )
}

export function BottomNav({ tab, setTab }) {
  const abas = [['scan','📷','Scan'], ['perfil','⚙️','Config'], ['hist','📋','Log']]
  return (
    <div style={{ display:'flex', background:C.surface, borderTop:`1px solid ${C.border}`, flexShrink:0, padding:'4px 8px 8px', gap:4 }}>
      {abas.map(([id, icon, label]) => {
        const ativo = tab === id
        return (
          <button key={id} onClick={() => setTab(id)} style={{ flex:1, padding:'8px 4px 6px', background:ativo?C.accentDim:'none', border:ativo?`1px solid rgba(0,212,255,.2)`:'1px solid transparent', borderRadius:14, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:3, color:ativo?C.accent:C.text3, transition:'all .2s' }}>
            <span style={{ fontSize:19, filter:ativo?`drop-shadow(0 0 8px ${C.accentGlow})`:'none' }}>{icon}</span>
            <span style={{ fontSize:9, fontWeight:ativo?700:400 }}>{label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function Card({ children, style = {} }) {
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:20, overflow:'hidden', ...style }}>
      {children}
    </div>
  )
}
