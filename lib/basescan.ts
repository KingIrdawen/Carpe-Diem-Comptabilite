import { decodeEventLog } from 'viem'
import { CARPE_ESCROW_ABI, CARPE_ESCROW_ADDRESS } from './contracts'

// API V2 Etherscan avec chainid Base (8453)
const BASE_URL = 'https://api.etherscan.io/v2/api'
const CHAIN_ID = '8453'
const DEPLOY_BLOCK = 45_717_327

interface RawLog {
  blockNumber: string
  timeStamp: string
  transactionHash: string
  topics: string[]
  data: string
}

async function fetchLogs(fromBlock: number, apiKey: string): Promise<RawLog[]> {
  const allLogs: RawLog[] = []
  let page = 1
  const offset = 1000

  while (true) {
    const url = new URL(BASE_URL)
    url.searchParams.set('chainid', CHAIN_ID)
    url.searchParams.set('module', 'logs')
    url.searchParams.set('action', 'getLogs')
    url.searchParams.set('address', CARPE_ESCROW_ADDRESS)
    url.searchParams.set('fromBlock', fromBlock.toString())
    url.searchParams.set('toBlock', 'latest')
    url.searchParams.set('page', page.toString())
    url.searchParams.set('offset', offset.toString())
    url.searchParams.set('apikey', apiKey)

    const res = await fetch(url.toString())
    const json = await res.json()

    if (json.status !== '1' || !Array.isArray(json.result)) break

    allLogs.push(...json.result)

    // Si moins de `offset` résultats, on a tout récupéré
    if (json.result.length < offset) break
    page++
  }

  return allLogs
}

function hexToBigInt(hex: string): bigint {
  return BigInt(hex)
}

export interface DecodedEvent {
  type: string
  txHash: string
  blockNumber: string
  timestamp: number
  args: Record<string, unknown>
}

export async function fetchAllContractEvents(fromBlock = DEPLOY_BLOCK): Promise<DecodedEvent[]> {
  const apiKey = process.env.BASESCAN_API_KEY
  if (!apiKey) throw new Error('BASESCAN_API_KEY manquante dans les variables d\'environnement')

  const rawLogs = await fetchLogs(fromBlock, apiKey)
  const events: DecodedEvent[] = []

  for (const log of rawLogs) {
    try {
      const decoded = decodeEventLog({
        abi: CARPE_ESCROW_ABI,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      })

      events.push({
        type: decoded.eventName,
        txHash: log.transactionHash,
        blockNumber: hexToBigInt(log.blockNumber).toString(),
        timestamp: parseInt(log.timeStamp, 16),
        args: decoded.args as Record<string, unknown>,
      })
    } catch {
      // Log non reconnu dans notre ABI, on ignore
    }
  }

  return events
}
