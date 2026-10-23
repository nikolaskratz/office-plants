// Looks at a plant photo with Claude: what it is, how often to water it, how healthy it looks.
//
// Called by the app with the user's JWT and {image: <base64 JPEG>, plant?: {...}}.
// `plant` is set for a health check of a plant that's already in the app, so Claude
// knows its current schedule. Each call is logged in ai_checks (also used for the daily cap).
//
// Needs the ANTHROPIC_API_KEY secret (Dashboard → Edge Functions → Secrets).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { Anthropic, checkPlant, type PlantContext } from './claude.ts'

const DAILY_LIMIT = 30
const MAX_IMAGE_BYTES = 4_000_000

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function usedToday(userId: string): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { count, error } = await supabase
    .from('ai_checks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since)
  if (error) throw error
  return count ?? 0
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    const { data } = token ? await supabase.auth.getUser(token) : { data: { user: null } }
    if (!data.user) return json({ error: 'unauthorized' }, 401)

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return json({ error: 'Plant AI is not set up yet (missing ANTHROPIC_API_KEY).' }, 503)

    const { image, plant } = (await req.json()) as { image?: string; plant?: PlantContext }
    if (!image || image.length > (MAX_IMAGE_BYTES * 4) / 3) return json({ error: 'Photo missing or too large.' }, 400)
    if ((await usedToday(data.user.id)) >= DAILY_LIMIT) {
      return json({ error: `That's ${DAILY_LIMIT} photo checks today. Try again tomorrow.` }, 429)
    }

    const checked = await checkPlant(apiKey, image, plant)
    if (!checked) return json({ error: "Couldn't read this photo. Try another one." }, 502)
    const { result, model, usage } = checked

    await supabase.from('ai_checks').insert({
      user_id: data.user.id,
      kind: plant ? 'health' : 'identify',
      result,
      model,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
    })
    return json(result)
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Plant AI is busy. Try again in a minute.' }, 429)
    if (e instanceof Anthropic.AuthenticationError) {
      console.error('plant-ai: Anthropic rejected the API key')
      return json({ error: 'Plant AI key is not valid.' }, 503)
    }
    if (e instanceof Anthropic.APIError) {
      console.error('plant-ai: Anthropic API error', e.status)
      return json({ error: 'Plant AI is unavailable right now.' }, 502)
    }
    console.error(e)
    return json({ error: String(e) }, 500)
  }
})
