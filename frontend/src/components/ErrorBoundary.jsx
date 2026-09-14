// ─────────────────────────────────────────────────────────────────
// components/ErrorBoundary.jsx — Rede de segurança contra crashes
// ─────────────────────────────────────────────────────────────────
// Sem isso, QUALQUER exceção não tratada em qualquer componente
// (inclusive de bibliotecas de terceiros, tipo o html5-qrcode)
// derruba a árvore React inteira e a tela fica em branco, sem
// nenhuma pista do que aconteceu — foi exatamente esse tipo de bug
// que a gente caçou durante o desenvolvimento (ver README.md).
//
// Com o Error Boundary, o crash fica CONTIDO: aparece uma tela de
// erro amigável com um botão de "tentar de novo", em vez de travar
// o app inteiro sem explicação.

import { Component } from 'react'
import { C } from '../theme'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Em produção isso poderia mandar o erro pra um serviço de log
    // (Sentry, LogRocket etc). Por enquanto, só loga no console.
    console.error('Erro capturado pelo ErrorBoundary:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', background: C.bg, color: C.text,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: 32, fontFamily: "'Plus Jakarta Sans', sans-serif",
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💥</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
            Algo deu errado
          </div>
          <div style={{
            fontSize: 12, color: C.text3, fontFamily: 'monospace',
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: '12px 16px', marginBottom: 24,
            maxWidth: 340, wordBreak: 'break-word',
          }}>
            {this.state.error?.message || String(this.state.error)}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              padding: '13px 28px', border: 'none', borderRadius: 14,
              background: `linear-gradient(135deg,${C.accent},#0099CC)`,
              color: '#020C18', fontFamily: 'inherit', fontSize: 14,
              fontWeight: 700, cursor: 'pointer',
            }}
          >
            Tentar novamente
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
