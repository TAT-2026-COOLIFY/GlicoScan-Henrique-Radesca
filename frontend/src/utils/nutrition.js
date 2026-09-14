// ─────────────────────────────────────────────────────────────────
// utils/nutrition.js — Regras de negócio sobre dados nutricionais
// ─────────────────────────────────────────────────────────────────
// Funções puras (sem estado, sem efeito colateral) que processam os
// valores nutricionais vindos da API. Ficam separadas dos componentes
// visuais para poderem ser testadas isoladamente se necessário.

/**
 * Detecta se um valor nutricional parece implausível — por exemplo,
 * mais gramas de carboidrato do que o peso total da porção.
 * Isso acontece às vezes com dados de OCR ou de bases de terceiros
 * com erro de cadastro; o app avisa o usuário em vez de confiar cegamente.
 */
export function valorSuspeito(chave, valor, porcaoTexto) {
  if (valor === null || valor === undefined) return false

  const match = String(porcaoTexto || '').match(/(\d+[,.]?\d*)\s*(?:g|ml)/)
  const pesoPorcao = match ? parseFloat(match[1]) : null

  if (chave === 'carboidratos' && pesoPorcao && valor > pesoPorcao) return true
  if (chave === 'carboidratos' && valor > 150) return true
  if (chave === 'calorias' && valor > 900) return true
  if (['fibras', 'acucares', 'proteinas', 'gorduras'].includes(chave) && pesoPorcao && valor > pesoPorcao) return true

  return false
}

/**
 * Converte "quantas porções o usuário vai comer" numa descrição legível,
 * tipo "3 biscoitos" ou "450ml", em vez de só "3 porções".
 */
export function gerarDescricao(porcoes, porcaoTexto, unidadeTexto) {
  const UNIDADES = [
    { chaves: ['biscoito', 'bolacha', 'cookie'], singular: 'biscoito', plural: 'biscoitos' },
    { chaves: ['barra'],                          singular: 'barra',    plural: 'barras'    },
    { chaves: ['fatia'],                          singular: 'fatia',    plural: 'fatias'    },
    { chaves: ['copo', 'xícara', 'xicara'],       singular: 'copo',     plural: 'copos'     },
    { chaves: ['lata'],                           singular: 'lata',     plural: 'latas'     },
    { chaves: ['garrafa'],                        singular: 'garrafa',  plural: 'garrafas'  },
    { chaves: ['sachê', 'sache'],                 singular: 'sachê',    plural: 'sachês'    },
    { chaves: ['tablete'],                        singular: 'tablete',  plural: 'tabletes'  },
    { chaves: ['unidade', 'unid'],                singular: 'unidade',  plural: 'unidades'  },
    { chaves: ['pacote'],                         singular: 'pacote',   plural: 'pacotes'   },
  ]

  const textoBase = (unidadeTexto && unidadeTexto !== '—') ? unidadeTexto : porcaoTexto
  if (!textoBase || textoBase === '—') return `${porcoes} porção(ões)`

  const texto = textoBase.toLowerCase()
  const numeroMatch = texto.match(/(\d+[,.]?\d*)/)
  const numeroBase = numeroMatch ? parseFloat(numeroMatch[1].replace(',', '.')) : 1
  const total = Math.round(numeroBase * porcoes)

  for (const u of UNIDADES) {
    if (u.chaves.some(k => texto.includes(k))) {
      return `${total} ${total === 1 ? u.singular : u.plural}`
    }
  }

  if (texto.includes('ml')) return `${Math.round(numeroBase * porcoes)}ml`
  if (texto.includes('g'))  return `${Math.round(numeroBase * porcoes)}g`

  return `${porcoes} porção(ões)`
}
