// Looks at a plant photo with Claude: what it is, how often to water it, how healthy it looks.
//
// Called by the app with the user's JWT and {image: <base64 JPEG>, plant?: {...}}.
// `plant` is set for a health check of a plant that's already in the app, so Claude
// knows its current schedule. Each call is logged in ai_checks with its cost, which backs the
// daily budget: a check only runs if its worst case still fits into today's budget. That worst
// case is reserved up front (ai_reserve) and replaced with the real cost afterwards.
//
// Needs the ANTHROPIC_API_KEY secret (Dashboard → Edge Functions → Secrets).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { Anthropic, MAX_CHECK_COST_USD, checkPlant, type PlantContext } from './claude.ts'

const DAILY_BUDGET_EUR = 0.5
const USD_PER_EUR = 1.1 // a bit below the real rate, so the euro budget is never exceeded
const DAILY_BUDGET_USD = DAILY_BUDGET_EUR * USD_PER_EUR
const MAX_IMAGE_BYTES = 4_000_000

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** ai_checks id of the reservation, or null when today's budget is used up. */
async function reserve(userId: string, kind: 'identify' | 'health'): Promise<number | null> {
  const { data, error } = await supabase.rpc('ai_reserve', {
    uid: userId,
    check_kind: kind,
    max_cost: MAX_CHECK_COST_USD,
    budget: DAILY_BUDGET_USD,
  })
  if (error) throw error
  return data
}

async function settle(checkId: number, fields: Record<string, unknown>) {
  const { error } = await supabase.from('ai_checks').update(fields).eq('id', checkId)
  if (error) console.error('plant-ai: could not log check', error.message)
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
    const checkId = await reserve(data.user.id, plant ? 'health' : 'identify')
    if (checkId === null) return json({ error: "That's today's photo checks used up. Try again tomorrow." }, 429)

    let checked
    try {
      checked = await checkPlant(apiKey, image, plant)
    } catch (e) {
      // An API error means no answer was generated, so nothing was billed.
      if (e instanceof Anthropic.APIError) await settle(checkId, { cost_usd: 0 })
      throw e
    }
    const { result, model, usage, costUsd } = checked
    await settle(checkId, {
      result,
      model,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cost_usd: costUsd,
    })
    if (!result) return json({ error: "Couldn't read this photo. Try another one." }, 502)
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
