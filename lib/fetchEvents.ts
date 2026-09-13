import { decodeEventLog } from 'viem'
import { publicClient } from './viemClient'
import { CARPE_ESCROW_ADDRESS, CARPE_ESCROW_ABI } from './contracts'

const DEPLOY_BLOCK = 45_717_327n
const CHUNK_SIZE = 2_000n
const PARALLEL_CHUNKS = 30

export interface DecodedEvent {
  type: string
  txHash: string
  blockNumber: string
  timestamp: number
  args: Record<string, unknown>
}

export interface ChunkDebug {
  rawLogs: number
  decoded: number
  failed: number
  rpcError?: string
  failedTopics: string[]
}

async function fetchChunk(fromBlock: bigint, toBlock: bigint, debug?: ChunkDebug): Promise<DecodedEvent[]> {
  try {
    const logs = await publicClient.getLogs({
      address: CARPE_ESCROW_ADDRESS,
      fromBlock,
      toBlock,
    })

    if (debug) debug.rawLogs += logs.length

    const events: DecodedEvent[] = []
    for (const log of logs) {
      try {
        const decoded = decodeEventLog({
          abi: CARPE_ESCROW_ABI,
          data: log.data,
          topics: log.topics,
        })
        const rawArgs = decoded.args as Record<string, unknown>
        const args: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(rawArgs)) {
          args[k] = typeof v === 'bigint' ? v.toString() : v
        }
        events.push({
          type: decoded.eventName as string,
          txHash: log.transactionHash ?? '',
          blockNumber: log.blockNumber?.toString() ?? '0',
          timestamp: 0,
          args,
        })
        if (debug) debug.decoded++
      } catch {
        if (debug) {
          debug.failed++
          if (log.topics[0]) debug.failedTopics.push(log.topics[0])
        }
      }
    }
    return events
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Fallback: si la plage est trop grande, on la divise en deux et on réessaie
    if (toBlock > fromBlock && /range|too large|limit/i.test(msg)) {
      const mid = fromBlock + (toBlock - fromBlock) / 2n
      const [left, right] = await Promise.all([
        fetchChunk(fromBlock, mid, debug),
        fetchChunk(mid + 1n, toBlock, debug),
      ])
      return [...left, ...right]
    }
    if (debug) debug.rpcError = msg
    return []
  }
}

export interface FetchDebugInfo {
  fromBlock: string
  toBlock: string
  chunkCount: number
  rawLogs: number
  decoded: number
  failed: number
  rpcError?: string
  failedTopics: string[]
}

export async function fetchAllContractEvents(fromBlock = DEPLOY_BLOCK, toBlock?: bigint, debugOut?: FetchDebugInfo): Promise<DecodedEvent[]> {
  const latestBlock = toBlock ?? await publicClient.getBlockNumber()

  const chunks: Array<{ from: bigint; to: bigint }> = []
  let current = fromBlock
  while (current <= latestBlock) {
    const end = current + CHUNK_SIZE - 1n < latestBlock
      ? current + CHUNK_SIZE - 1n
      : latestBlock
    chunks.push({ from: current, to: end })
    current = end + 1n
  }

  if (debugOut) {
    debugOut.fromBlock = fromBlock.toString()
    debugOut.toBlock = latestBlock.toString()
    debugOut.chunkCount = chunks.length
  }

  const chunkDebug: ChunkDebug = { rawLogs: 0, decoded: 0, failed: 0, failedTopics: [] }

  const allEvents: DecodedEvent[] = []
  for (let i = 0; i < chunks.length; i += PARALLEL_CHUNKS) {
    const batch = chunks.slice(i, i + PARALLEL_CHUNKS)
    const results = await Promise.all(batch.map(c => fetchChunk(c.from, c.to, chunkDebug)))
    allEvents.push(...results.flat())
  }

  if (debugOut) {
    debugOut.rawLogs = chunkDebug.rawLogs
    debugOut.decoded = chunkDebug.decoded
    debugOut.failed = chunkDebug.failed
    if (chunkDebug.rpcError) debugOut.rpcError = chunkDebug.rpcError
    debugOut.failedTopics = [...new Set(chunkDebug.failedTopics)]
  }

  if (allEvents.length === 0) return []

  // Résoudre les timestamps par blockNumber
  const uniqueBlocks = [...new Set(allEvents.map(e => e.blockNumber))]
  const blockTimestamps: Record<string, number> = {}

  for (let i = 0; i < uniqueBlocks.length; i += 20) {
    const batch = uniqueBlocks.slice(i, i + 20)
    const blocks = await Promise.all(
      batch.map(bn => publicClient.getBlock({ blockNumber: BigInt(bn) }).catch(() => null))
    )
    blocks.forEach(b => {
      if (b) blockTimestamps[b.number.toString()] = Number(b.timestamp)
    })
  }

  return allEvents.map(e => ({
    ...e,
    timestamp: blockTimestamps[e.blockNumber] ?? 0,
  }))
}
