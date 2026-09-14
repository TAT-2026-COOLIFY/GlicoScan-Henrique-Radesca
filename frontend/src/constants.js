// ─────────────────────────────────────────────────────────────────
// constants.js — Dados fixos do domínio da aplicação
// ─────────────────────────────────────────────────────────────────
import { C } from './theme'

// Tempo de aplicação recomendado por tipo de insulina, conforme bula.
// Uso educativo/auxiliar — o app sempre reforça pro usuário validar
// esses valores com o médico/endocrinologista responsável.
export const INSULIN_TIPS = {
  'Humalog (lispro)':     { tempo: '0–15 min antes',                     cor: C.green,  icone: '⚡', rgb: '0,229,160' },
  'NovoRapid (aspart)':   { tempo: '0–15 min antes',                     cor: C.green,  icone: '⚡', rgb: '0,229,160' },
  'Apidra (glulisina)':   { tempo: '0–15 min antes',                     cor: C.green,  icone: '⚡', rgb: '0,229,160' },
  'Fiasp (ultra-rápida)': { tempo: 'junto à refeição ou até 2 min antes', cor: C.warn,   icone: '🔥', rgb: '255,179,64' },
  'Regular':              { tempo: '30–45 min antes',                    cor: C.purple, icone: '⏱️', rgb: '157,127,234' },
}

// Perfil padrão usado na primeira execução do app (usuário ainda não configurou nada)
export const DEFAULT_PROFILE = {
  ric: 15,                        // Razão Insulina:Carboidrato (1 UI para cada 15g de carbo)
  insulin: 'Humalog (lispro)',
  alvo: 100,                      // Glicemia alvo (mg/dL)
  fs: 50,                         // Fator de Sensibilidade (quanto 1 UI reduz a glicemia)
}

// Duração da ação de cada insulina (horas) — usado pro cálculo de IOB
// (insulina ativa/"bolus na ativa"): dose recente ainda circulando no
// corpo, que precisa ser descontada da próxima dose pra não empilhar
// insulina e causar hipoglicemia. Valores de bula, aproximados —
// sempre validar com o médico, igual o resto da regulagem.
export const DURACAO_INSULINA_HORAS = {
  'Humalog (lispro)':     4,
  'NovoRapid (aspart)':   4,
  'Apidra (glulisina)':   4,
  'Fiasp (ultra-rápida)': 3,
  'Regular':              6,
}
