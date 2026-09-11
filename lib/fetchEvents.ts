import { decodeEventLog } from 'viem'
import { publicClient } from './viemClient'
import { CARPE_ESCROW_ADDRESS, CARPE_ESCROW_ABI } from './contracts'

const DEPLOY_BLOCK = 45_717_327n
const CHUNK_SIZE = 2000n
const PARALLEL_CHUNKS = 50

export interface DecodedEvent {
  type: string
  txHash: string
  blockNumber: string
  timestamp: number
  args: Record<string, unknown>
}

async function getLatestBlock(): Promise<bigint> {
  const block = await publicClient.getBlockNumber()
  return block
}

async function fetchChunk(fromBlock: bigint, toBlock: bigint): Promise<DecodedEvent[]> {
  const logs = await publicClient.getLogs({
    address: CARPE_ESCROW_ADDRESS,
    fromBlock,
    toBlock,
  })

  const events: DecodedEvent[] = []
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: CARPE_ESCROW_ABI,
        data: log.data,
        topics: log.topics,
      })
      events.push({
        type: decoded.eventName as string,
        txHash: log.transactionHash ?? '',
        blockNumber: log.blockNumber?.toString() ?? '0',
        // blockNumber sera converti en timestamp après
        timestamp: 0,
        args: decoded.args as Record<string, unknown>,
      })
    } catch {
      // Log non reconnu dans notre ABI
    }
  }
  return events
}

export async function fetchAllContractEvents(fromBlock = DEPLOY_BLOCK): Promise<DecodedEvent[]> {
  const latestBlock = await getLatestBlock()

  // Créer tous les chunks
  const chunks: Array<{ from: bigint; to: bigint }> = []
  let current = fromBlock
  while (current <= latestBlock) {
    const end = current + CHUNK_SIZE - 1n < latestBlock ? current + CHUNK_SIZE - 1n : latestBlock
    chunks.push({ from: current, to: end })
    current = end + 1n
  }

  // Fetch en batches parallèles — avec batch transport, chaque Promise.all
  // est envoyé en une seule requête HTTP groupée à Alchemy
  const allEvents: DecodedEvent[] = []
  for (let i = 0; i < chunks.length; i += PARALLEL_CHUNKS) {
    const batch = chunks.slice(i, i + PARALLEL_CHUNKS)
    const results = await Promise.all(batch.map(c => fetchChunk(c.from, c.to)))
    allEvents.push(...results.flat())
  }

  // Résoudre les timestamps par blockNumber (dédupliqués)
  const uniqueBlocks = [...new Set(allEvents.map(e => e.blockNumber))]
  const blockTimestamps: Record<string, number> = {}

  // Fetch les timestamps en batches (aussi groupés par le batch transport)
  for (let i = 0; i < uniqueBlocks.length; i += 100) {
    const batch = uniqueBlocks.slice(i, i + 100)
    const blocks = await Promise.all(
      batch.map(bn => publicClient.getBlock({ blockNumber: BigInt(bn) }))
    )
    blocks.forEach(b => {
      blockTimestamps[b.number.toString()] = Number(b.timestamp)
    })
  }

  // Assigner les timestamps
  return allEvents.map(e => ({
    ...e,
    timestamp: blockTimestamps[e.blockNumber] ?? 0,
  }))
}
