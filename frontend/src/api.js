// ─────────────────────────────────────────────────────────────────
// api.js — Endereço base da API backend + fetch autenticado
// ─────────────────────────────────────────────────────────────────
// Em desenvolvimento local: fica vazio, e o proxy do vite.config.js
// repassa as chamadas /barcode, /historico etc. pro Flask na porta 5000.
//
// Em produção (frontend e backend em domínios/serviços separados,
// ex: Vercel + Render): defina VITE_API_URL no ambiente de deploy
// com a URL completa do backend, ex: https://glicoscan-api.onrender.com
// Ver DEPLOY.md para o passo a passo.

import { supabase } from './supabase'

export const API_BASE = import.meta.env.VITE_API_URL || ''

/** fetch() já com API_BASE e o token de login da conta atual (o backend usa ele pra saber de quem é cada dado). */
export async function apiFetch(caminho, opcoes = {}) {
  const headers = { ...(opcoes.headers || {}) }
  const { data } = await supabase.auth.getSession()
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`
  return fetch(`${API_BASE}${caminho}`, { ...opcoes, headers })
}
