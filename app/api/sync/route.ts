import { NextResponse } from 'next/server'
import { fetchAllContractEvents, FetchDebugInfo } from '@/lib/fetchEvents'
import { insertEvents, updateLastSyncedBlock, recordSyncedRange, initDb } from '@/lib/db'
import { publicClient } from '@/lib/viemClient'
import { fillMissingDiemPrices } from '@/lib/diemPrice'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DEPLOY_BLOCK = 45_717_327n
const SECONDS_PER_BLOCK = 2n

function dateToBlock(date: Date, latestBlock: bigint): bigint {
  const now = Math.floor(Date.now() / 1000)
  const target = Math.floor(date.getTime() / 1000)
  const diff = BigInt(now - target)
  const estimated = latestBlock - diff / SECONDS_PER_BLOCK
  return estimated < DEPLOY_BLOCK ? DEPLOY_BLOCK : estimated
}

export async function POST(req: Request) {
  try {
    const { startDate, endDate } = await req.json()

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate et endDate requis' }, { status: 400 })
    }

    await initDb()

    const latestBlock = await publicClient.getBlockNumber()
    const fromBlock = dateToBlock(new Date(startDate), latestBlock)
    // Une date de fin dans le futur ne doit pas dépasser le dernier bloc produit
    const estimatedTo = dateToBlock(new Date(endDate), latestBlock)
    const toBlock = estimatedTo > latestBlock ? latestBlock : estimatedTo

    if (fromBlock >= toBlock) {
      return NextResponse.json({ error: 'Plage de dates invalide' }, { status: 400 })
    }

    const debugInfo: FetchDebugInfo = { fromBlock: '', toBlock: '', chunkCount: 0, rawLogs: 0, decoded: 0, failed: 0, failedTopics: [] }
    const events = await fetchAllContractEvents(fromBlock, toBlock, debugInfo)

    const toInsert = events.map(e => ({
      type: e.type,
      tx_hash: e.txHash,
      block_number: e.blockNumber,
      timestamp: e.timestamp,
      args: e.args,
    }))

    await insertEvents(toInsert)
    await updateLastSyncedBlock(toBlock)
    await recordSyncedRange(startDate, endDate)

    // Valorisation USDC des montants DIEM — non bloquant si l'API de prix est indisponible
    const diemPrices = await fillMissingDiemPrices().catch(e => ({ error: String(e) }))

    return NextResponse.json({
      ok: true,
      synced: toInsert.length,
      diemPrices,
      debug: debugInfo,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Sync error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
