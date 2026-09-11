import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

export const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL ?? 'https://mainnet.base.org'),
})

// Convert from 6-decimal USDC to readable number
export function formatUsdc(raw: bigint): number {
  return Number(raw) / 1_000_000
}

// Convert from 18-decimal DIEM to readable number
export function formatDiem(raw: bigint): number {
  return Number(raw) / 1e18
}
