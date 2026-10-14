// ─────────────────────────────────────────────────────────────────
// utils/imagem.js — Prepara a foto da tabela nutricional pro OCR
// ─────────────────────────────────────────────────────────────────
// Foto de celular tem 3-12 MB: lenta de subir e acima do limite do OCR.space.
// Reduz o lado maior e recomprime em JPEG — texto de rótulo continua legível.

const LADO_MAXIMO = 1600
const QUALIDADE = 0.85

/** Lê um File de imagem e devolve um data URL JPEG reduzido. Rejeita se não for imagem legível. */
export function reduzirImagem(arquivo) {
  return new Promise((resolve, reject) => {
    if (!arquivo || !String(arquivo.type).startsWith('image/')) {
      reject(new Error('Arquivo não é uma imagem'))
      return
    }
    const url = URL.createObjectURL(arquivo)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * escala)
      canvas.height = Math.round(img.height * escala)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', QUALIDADE))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não foi possível ler a imagem'))
    }
    img.src = url
  })
}
