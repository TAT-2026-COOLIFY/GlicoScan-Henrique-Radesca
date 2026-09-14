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

export const API_BASE = import.meta.env.VITE_API_URL || ''

// Se o backend exigir APP_TOKEN (ver backend/config.py — recomendado em
// deploy público, já que /historico expõe dado de saúde), o frontend
// precisa mandar o mesmo valor em VITE_APP_TOKEN pra não tomar 401.
const APP_TOKEN = import.meta.env.VITE_APP_TOKEN || ''

/** fetch() já com API_BASE e o header de autenticação (quando configurado). */
export function apiFetch(caminho, opcoes = {}) {
  const headers = { ...(opcoes.headers || {}) }
  if (APP_TOKEN) headers['X-App-Token'] = APP_TOKEN
  return fetch(`${API_BASE}${caminho}`, { ...opcoes, headers })
}
