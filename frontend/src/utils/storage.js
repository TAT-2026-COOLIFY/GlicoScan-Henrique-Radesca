// ─────────────────────────────────────────────────────────────────
// utils/storage.js — Persistência de perfis do usuário (localStorage)
// ─────────────────────────────────────────────────────────────────
// Guarda RIC, tipo de insulina, glicemia alvo e fator de sensibilidade
// diretamente no navegador (não depende do backend). Suporta MÚLTIPLOS
// perfis (ex: família usando o mesmo aparelho) — cada um com sua
// própria "regulagem", trocáveis pela aba Config. Sem login/senha: é
// controle de perfil, não autenticação entre pessoas.
//
// IMPORTANTE: leitura é protegida com try/catch porque um JSON.parse
// direto e sem tratamento, se o dado salvo estiver corrompido, lança
// uma exceção não capturada durante o render do React — e como não
// existe Error Boundary pra esse caso específico, isso derrubaria a
// árvore inteira. Esse foi inclusive um bug real encontrado durante
// o desenvolvimento (antes de existir mais de um perfil).

import { DEFAULT_PROFILE } from '../constants'

const STORAGE_KEY = 'gs_perfis'
const CHAVE_ANTIGA = 'gs_p' // formato de perfil único (versão anterior) — migrado uma vez

function _lerBruto() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const dados = JSON.parse(raw)
      if (dados && dados.perfis && Object.keys(dados.perfis).length > 0) return dados
    }
  } catch (e) {
    console.error('Perfis corrompidos no localStorage, resetando para o padrão:', e)
  }

  // Primeiro uso desse formato: migra o perfil único antigo, se existir
  let perfilBase = { ...DEFAULT_PROFILE }
  try {
    const antigoRaw = localStorage.getItem(CHAVE_ANTIGA)
    if (antigoRaw) perfilBase = { ...DEFAULT_PROFILE, ...JSON.parse(antigoRaw) }
  } catch { /* ignora perfil antigo corrompido, usa o padrão */ }

  const dados = { ativoId: 'p1', perfis: { p1: { nome: 'Perfil 1', ...perfilBase } } }
  _salvarBruto(dados)
  return dados
}

function _salvarBruto(dados) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dados))
  } catch (e) {
    console.error('Erro ao salvar perfis no localStorage:', e)
  }
}

/** SHA-256 do PIN — nunca guarda o PIN em texto puro, só o hash. */
async function _hashPin(pin) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin))
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export const storage = {
  listarPerfis: () => {
    const { perfis } = _lerBruto()
    return Object.entries(perfis).map(([id, p]) => ({ id, ...p }))
  },

  getPerfilAtivo: () => {
    const dados = _lerBruto()
    const id = dados.perfis[dados.ativoId] ? dados.ativoId : Object.keys(dados.perfis)[0]
    return { id, ...dados.perfis[id] }
  },

  definirPerfilAtivo: (id) => {
    const dados = _lerBruto()
    if (!dados.perfis[id]) return
    dados.ativoId = id
    _salvarBruto(dados)
  },

  salvarPerfil: (id, campos) => {
    const dados = _lerBruto()
    if (!dados.perfis[id]) return
    dados.perfis[id] = { ...dados.perfis[id], ...campos }
    _salvarBruto(dados)
  },

  /** Cria um novo perfil com valores padrão, já como perfil ativo, e devolve o id gerado. */
  criarPerfil: (nome) => {
    const dados = _lerBruto()
    const id = `p${Date.now()}`
    dados.perfis[id] = { nome: nome?.trim() || `Perfil ${Object.keys(dados.perfis).length + 1}`, ...DEFAULT_PROFILE }
    dados.ativoId = id
    _salvarBruto(dados)
    return id
  },

  /** Remove um perfil. Nunca deixa a lista vazia — recusa remover o último. Devolve true/false. */
  removerPerfil: (id) => {
    const dados = _lerBruto()
    if (Object.keys(dados.perfis).length <= 1) return false
    delete dados.perfis[id]
    if (dados.ativoId === id) dados.ativoId = Object.keys(dados.perfis)[0]
    _salvarBruto(dados)
    return true
  },

  /** true se esse perfil pede PIN pra entrar. Perfil sem PIN configurado = livre (padrão). */
  perfilTemPin: (id) => {
    const dados = _lerBruto()
    return Boolean(dados.perfis[id]?.pinHash)
  },

  /** Define (ou troca) o PIN de um perfil. */
  definirPin: async (id, pin) => {
    const dados = _lerBruto()
    if (!dados.perfis[id]) return
    dados.perfis[id].pinHash = await _hashPin(pin)
    _salvarBruto(dados)
  },

  /** Remove o PIN — perfil volta a ser livre pra trocar. */
  removerPin: (id) => {
    const dados = _lerBruto()
    if (!dados.perfis[id]) return
    delete dados.perfis[id].pinHash
    _salvarBruto(dados)
  },

  /** Sem PIN configurado nesse perfil, qualquer PIN "passa" (nada pra checar). */
  verificarPin: async (id, pinDigitado) => {
    const dados = _lerBruto()
    const hashSalvo = dados.perfis[id]?.pinHash
    if (!hashSalvo) return true
    return (await _hashPin(pinDigitado)) === hashSalvo
  },
}
