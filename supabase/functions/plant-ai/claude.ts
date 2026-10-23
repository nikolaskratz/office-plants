// The Claude call behind plant-ai, kept separate so it can be tried locally.

import Anthropic from 'npm:@anthropic-ai/sdk@1.1.0'
import { betaZodOutputFormat } from 'npm:@anthropic-ai/sdk@1.1.0/helpers/beta/zod'
import * as z from 'npm:zod@4.6.7/v4'

export { Anthropic }

const MODEL = 'claude-opus-5-5'
const MAX_TOKENS = 4000 // a check uses ~600 output tokens incl. thinking; this caps the worst case

// USD per million tokens [input, output]. A fallback model may answer if Opus declines;
// anything not listed is priced like the most expensive model, so the budget errs on the safe side.
const PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-opus-5': [5, 25],
  'claude-opus-4-8': [5, 25],
  'claude-sonnet-5-5': [2, 10],
}
const PRICE_UNKNOWN: [number, number] = [10, 50]

/** Most a single check can cost: a full-size photo (~8k input tokens with the prompt) plus a full answer. */
export const MAX_CHECK_COST_USD = (8000 * PRICES[MODEL][0] + MAX_TOKENS * PRICES[MODEL][1]) / 1e6

type Usage = Anthropic.Beta.Messages.BetaUsage

function cost(model: string, input: number, output: number): number {
  const [inPrice, outPrice] = PRICES[model] ?? PRICE_UNKNOWN
  return (input * inPrice + output * outPrice) / 1e6
}

/** What the request cost: per attempt when a fallback model also ran, else from the totals. */
export function costUsd(usage: Usage, model: string): number {
  const attempts = (usage.iterations ?? []).filter((it) => it.type === 'message' || it.type === 'fallback_message')
  if (!attempts.length) return cost(model, usage.input_tokens, usage.output_tokens)
  return attempts.reduce((sum, it) => sum + cost(it.model ?? MODEL, it.input_tokens, it.output_tokens), 0)
}

const Result = z.object({
  is_plant: z.boolean().describe('false if the photo does not show a plant'),
  common_name: z.string().describe('Everyday English name, e.g. "Swiss cheese plant"'),
  species: z.string().describe('Botanical name, e.g. "Monstera deliciosa"'),
  confidence: z.enum(['high', 'medium', 'low']),
  water_every_days: z.number().int().describe('Typical days between waterings indoors right now'),
  watering_tip: z.string().describe('One short sentence: how to tell it needs water / how much'),
  light: z.string().describe('One short phrase, e.g. "Bright, no direct midday sun"'),
  health: z.enum(['healthy', 'needs_attention', 'unhealthy']),
  health_summary: z.string().describe('One sentence on what the photo shows about its condition'),
  actions: z.array(z.string()).describe('0–3 short, concrete things to do now; empty if healthy'),
})

export type PlantContext = {
  name?: string
  species?: string | null
  interval_days?: number
  last_watered_at?: string | null
  notes?: string | null
}

const SYSTEM = `You help someone look after the plants in their office in Germany: indoors, heated in winter, \
watered by hand by people who are not plant experts.

From one photo, identify the plant and judge its health. Base the watering interval on this \
plant indoors in the current season (less often in winter when it grows slowly, but central heating \
dries soil faster), in a normal pot. Round to a practical number of days.

For health, describe only what is visible: leaf colour, spots, crisp or soft edges, drooping, pests, \
soil, pot size. If the photo is too far away or blurry to judge, say so and use "needs_attention" \
only when something actually looks wrong. Keep every text field short and plain, written for a \
phone screen. If you are unsure of the species, give your best guess and set confidence to "low".`

function prompt(plant: PlantContext | undefined, today: string): string {
  if (!plant) return `Today is ${today}. What plant is this, how often should it be watered, and how healthy does it look?`
  const facts = [
    plant.name && `Name in the app: ${plant.name}`,
    plant.species && `Species recorded: ${plant.species}`,
    plant.interval_days && `Current schedule: water every ${plant.interval_days} days`,
    `Last watered: ${plant.last_watered_at ? plant.last_watered_at.slice(0, 10) : 'unknown'}`,
    plant.notes && `Owner's notes: ${plant.notes.slice(0, 500)}`,
  ].filter(Boolean)
  return `Today is ${today}. Health check of a plant that's already in the app.\n${facts.join('\n')}\n\n\
Identify it again from the photo, say whether the watering interval fits, and how healthy it looks.`
}

/** `result` is null when Claude couldn't give a usable answer (refusal or unparseable output). */
export async function checkPlant(apiKey: string, image: string, plant?: PlantContext) {
  const client = new Anthropic({ apiKey })
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: betaZodOutputFormat(Result) },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text: prompt(plant, new Date().toISOString().slice(0, 10)) },
        ],
      },
    ],
  })
  const spent = { model: response.model, usage: response.usage, costUsd: costUsd(response.usage, response.model) }
  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    console.error('plant-ai: no result', response.stop_reason, response.stop_details?.category)
    return { result: null, ...spent }
  }
  const result = response.parsed_output
  result.water_every_days = Math.min(90, Math.max(1, Math.round(result.water_every_days)))
  result.actions = result.actions.slice(0, 3)
  return { result, ...spent }
}
