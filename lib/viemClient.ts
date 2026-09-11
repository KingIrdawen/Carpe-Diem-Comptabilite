import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

export const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL ?? 'https://mainnet.base.org'),
})

export function formatUsdc(raw: bigint): number {
  return Number(raw) / 1_000_000
}

export function formatDiem(raw: bigint): number {
  return Number(raw) / 1e18
}
