import { NextResponse } from 'next/server'
import { getEventsWithMissingTimestamp, updateEventTimestamp, initDb } from '@/lib/db'
import { publicClient } from '@/lib/viemClient'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
  try {
    await initDb()
    const events = await getEventsWithMissingTimestamp()
    if (events.length === 0) return NextResponse.json({ fixed: 0, total: 0 })

    const uniqueBlocks = [...new Set(events.map(e => e.block_number))]
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

    let fixed = 0
    for (const event of events) {
      const ts = blockTimestamps[event.block_number]
      if (ts) {
        await updateEventTimestamp(event.id, ts)
        fixed++
      }
    }

    return NextResponse.json({ fixed, total: events.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
