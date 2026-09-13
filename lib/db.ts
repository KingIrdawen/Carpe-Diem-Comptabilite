import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

export default sql

export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      type VARCHAR(50) NOT NULL,
      tx_hash VARCHAR(66) NOT NULL,
      block_number BIGINT NOT NULL,
      timestamp BIGINT NOT NULL,
      args JSONB NOT NULL
    )
  `
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_unique
    ON events(tx_hash, type)
  `
  await sql`
    CREATE INDEX IF NOT EXISTS idx_events_timestamp
    ON events(timestamp)
  `
  await sql`
    CREATE INDEX IF NOT EXISTS idx_events_type
    ON events(type)
  `
  await sql`
    CREATE TABLE IF NOT EXISTS sync_state (
      id INT PRIMARY KEY DEFAULT 1,
      last_synced_block BIGINT NOT NULL DEFAULT 45717327,
      last_synced_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`
    INSERT INTO sync_state (id, last_synced_block)
    VALUES (1, 45717327)
    ON CONFLICT (id) DO NOTHING
  `
  await sql`
    CREATE TABLE IF NOT EXISTS synced_ranges (
      id SERIAL PRIMARY KEY,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      synced_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(start_date, end_date)
    )
  `
}

export async function getLastSyncedBlock(): Promise<bigint> {
  const rows = await sql`SELECT last_synced_block FROM sync_state WHERE id = 1`
  return rows[0] ? BigInt(rows[0].last_synced_block) : 45_717_327n
}

export async function updateLastSyncedBlock(block: bigint) {
  await sql`
    UPDATE sync_state
    SET last_synced_block = ${block.toString()}, last_synced_at = NOW()
    WHERE id = 1
  `
}

export async function insertEvents(events: {
  type: string
  tx_hash: string
  block_number: string
  timestamp: number
  args: Record<string, unknown>
}[]) {
  if (events.length === 0) return
  for (const e of events) {
    await sql`
      INSERT INTO events (type, tx_hash, block_number, timestamp, args)
      VALUES (${e.type}, ${e.tx_hash}, ${e.block_number}, ${e.timestamp}, ${JSON.stringify(e.args)})
      ON CONFLICT (tx_hash, type) DO NOTHING
    `
  }
}

export async function getEventsFromDb() {
  return sql`SELECT * FROM events ORDER BY timestamp ASC`
}

export async function recordSyncedRange(startDate: string, endDate: string) {
  await sql`
    INSERT INTO synced_ranges (start_date, end_date)
    VALUES (${startDate}, ${endDate})
    ON CONFLICT (start_date, end_date) DO UPDATE SET synced_at = NOW()
  `
}

export async function getSyncedRanges(): Promise<{ start_date: string; end_date: string }[]> {
  const rows = await sql`SELECT start_date, end_date FROM synced_ranges ORDER BY start_date ASC`
  return rows as { start_date: string; end_date: string }[]
}

export async function getSyncStatus() {
  const rows = await sql`SELECT last_synced_block, last_synced_at FROM sync_state WHERE id = 1`
  return rows[0] ?? { last_synced_block: 45717327, last_synced_at: null }
}
