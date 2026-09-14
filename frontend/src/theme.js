// ─────────────────────────────────────────────────────────────────
// theme.js — Paleta de cores centralizada do app
// ─────────────────────────────────────────────────────────────────
// Mantém todas as cores num único lugar, em vez de espalhadas pelos
// componentes. Facilita trocar o tema inteiro (ex: modo claro) no
// futuro, mexendo em um arquivo só.

export const C = {
  bg:       '#050A12', // fundo geral do app
  surface:  '#0A1220', // fundo de cards
  surface2: '#0F1B2D', // fundo de inputs/campos
  surface3: '#162338', // fundo de elementos elevados (botões de contagem, etc)
  border:   '#1E3050',
  border2:  '#243A5E',

  accent:     '#00D4FF', // cor principal (destaques, botões primários)
  accentDim:  'rgba(0,212,255,.12)',
  accentGlow: 'rgba(0,212,255,.25)',

  green:    '#00E5A0', // sucesso / insulina rápida
  greenDim: 'rgba(0,229,160,.1)',

  danger: '#FF4D6D', // erros / hipoglicemia
  warn:   '#FFB340', // avisos / hiperglicemia
  purple: '#9D7FEA',
  orange: '#FF7340',

  text:  '#E8F4FF',
  text2: '#8BA8C8',
  text3: '#4A6A8A',
}
