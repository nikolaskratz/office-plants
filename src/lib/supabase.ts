import { createClient } from '@supabase/supabase-js'

// Publishable key: safe to ship in the client, all access is guarded by RLS.
const SUPABASE_URL = 'https://adagtmentbsommzgbona.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_yoZdCAzH5KaEMGIL1Lm1VQ_E1hwqh1x'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') return e.message
  return 'Something went wrong'
}
