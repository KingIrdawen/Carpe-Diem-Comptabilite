import { DIEM_ADDRESS } from './contracts'
import {
  fixMissingTimestampsFromBlocks,
  getEventsMissingDiemPrice,
  updateDiemPrices,
} from './db'

// Prix historiques DefiLlama, interrogés au timestamp exact de chaque transaction
const LLAMA_COIN = `base:${DIEM_ADDRESS}`
const BATCH_SIZE = 200
// Au-delà de cet écart avec le point de prix le plus proche, on ne valorise pas
const MAX_GAP_SECONDS = 6 * 3600

type PricePoint = { timestamp: number; price: number }

async function fetchDiemPrices(timestamps: number[]): Promise<PricePoint[]> {
  const unique = [...new Set(timestamps)]
  const points: PricePoint[] = []
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const coins = encodeURIComponent(JSON.stringify({ [LLAMA_COIN]: unique.slice(i, i + BATCH_SIZE) }))
    const url = `https://coins.llama.fi/batchHistorical?coins=${coins}&searchWidth=6h`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`DefiLlama ${res.status} : ${await res.text()}`)
    const json = await res.json()
    points.push(...(json.coins?.[LLAMA_COIN]?.prices ?? []))
  }
  return points.sort((a, b) => a.timestamp - b.timestamp)
}

function priceAt(series: PricePoint[], ts: number): number | null {
  if (series.length === 0) return null
  let lo = 0, hi = series.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (series[mid].timestamp < ts) lo = mid + 1
    else hi = mid
  }
  const candidates = [series[lo], series[lo - 1]].filter(Boolean)
  const nearest = candidates.reduce((a, b) =>
    Math.abs(a.timestamp - ts) <= Math.abs(b.timestamp - ts) ? a : b)
  return Math.abs(nearest.timestamp - ts) <= MAX_GAP_SECONDS ? nearest.price : null
}

/**
 * Enregistre le cours DIEM/USDC au moment de chaque transaction impliquant du DIEM
 * qui n'en a pas encore. La valeur change USDC d'un montant = montant DIEM × ce cours.
 */
export async function fillMissingDiemPrices(): Promise<{ filled: number; total: number }> {
  await fixMissingTimestampsFromBlocks()
  const rows = await getEventsMissingDiemPrice()
  if (rows.length === 0) return { filled: 0, total: 0 }

  const series = await fetchDiemPrices(rows.map(r => r.timestamp))

  const ids: number[] = []
  const prices: number[] = []
  for (const r of rows) {
    const p = priceAt(series, r.timestamp)
    if (p !== null) { ids.push(r.id); prices.push(p) }
  }

  for (let i = 0; i < ids.length; i += 1000) {
    await updateDiemPrices(ids.slice(i, i + 1000), prices.slice(i, i + 1000))
  }

  return { filled: ids.length, total: rows.length }
}
