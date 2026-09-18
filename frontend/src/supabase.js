import { createClient } from '@supabase/supabase-js'

// A chave "publishable" é pública por design — o que protege os dados é o
// backend validar o token de login a cada requisição (ver backend/routes.py).
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY,
)
