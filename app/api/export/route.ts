import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { publicClient, formatUsdc, formatDiem } from '@/lib/viemClient'
import { CARPE_ESCROW_ADDRESS, CARPE_ESCROW_ABI } from '@/lib/contracts'

export const dynamic = 'force-dynamic'

function toDate(ts: number) {
  return ts ? new Date(ts * 1000).toLocaleString('fr-FR') : ''
}

function shortAddr(addr: string | undefined) {
  if (!addr) return ''
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

async function fetchAllEvents(fromBlock: bigint, toBlock: bigint | 'latest') {
  const [deposits, charges, batchCharges, externalRoutes, providerWithdrawals, migrations, rebates, treasuryFunds] =
    await Promise.all([
      publicClient.getContractEvents({ address: CARPE_ESCROW_ADDRESS, abi: CARPE_ESCROW_ABI, eventName: 'Deposit', fromBlock, toBlock }),
      publicClient.getContractEvents({ address: CARPE_ESCROW_ADDRESS, abi: CARPE_ESCROW_ABI, eventName: 'Charge', fromBlock, toBlock }),
      publicClient.getContractEvents({ address: CARPE_ESCROW_ADDRESS, abi: CARPE_ESCROW_ABI, eventName: 'BatchCharge', fromBlock, toBlock }),
      publicClient.getContractEvents({ address: CARPE_ESCROW_ADDRESS, abi: CARPE_ESCROW_ABI, eventName: 'ExternalRouteSettled', fromBlock, toBlock }),
      publicClient.getContractEvents({ address: CARPE_ESCROW_ADDRESS, abi: CARPE_ESCROW_ABI, eventName: 'ProviderWithdrawal', fromBlock, toBlock }),
      publicClient.getContractEvents({ address: CARPE_ESCROW_ADDRESS, abi: CARPE_ESCROW_ABI, eventName: 'CreditsMigrated', fromBlock, toBlock }),
      publicClient.getContractEvents({ address: CARPE_ESCROW_ADDRESS, abi: CARPE_ESCROW_ABI, eventName: 'RebateDistributed', fromBlock, toBlock }),
      publicClient.getContractEvents({ address: CARPE_ESCROW_ADDRESS, abi: CARPE_ESCROW_ABI, eventName: 'TreasuryFunded', fromBlock, toBlock }),
    ])

  const allBlocks = [...deposits, ...charges, ...batchCharges, ...externalRoutes,
    ...providerWithdrawals, ...migrations, ...rebates, ...treasuryFunds]
    .map(e => e.blockNumber).filter(Boolean) as bigint[]
  const unique = [...new Set(allBlocks)]
  const blockData = await Promise.all(unique.map(n => publicClient.getBlock({ blockNumber: n })))
  const timestamps = Object.fromEntries(blockData.map(b => [b.number.toString(), Number(b.timestamp)]))
  const ts = (bn: bigint | null | undefined) => bn ? (timestamps[bn.toString()] ?? 0) : 0

  return { deposits, charges, batchCharges, externalRoutes, providerWithdrawals, migrations, rebates, treasuryFunds, ts }
}

function filterByMonth<T extends { blockNumber?: bigint | null }>(
  events: T[],
  ts: (bn: bigint | null | undefined) => number,
  year: number,
  month: number
): T[] {
  return events.filter(e => {
    const d = new Date(ts(e.blockNumber) * 1000)
    return d.getFullYear() === year && d.getMonth() + 1 === month
  })
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  row.alignment = { vertical: 'middle' }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))

  try {
    const { deposits, charges, batchCharges, externalRoutes, providerWithdrawals, migrations, rebates, treasuryFunds, ts } =
      await fetchAllEvents(0n, 'latest')

    const wb = new ExcelJS.Workbook()
    wb.creator = 'Carpe Diem Comptabilité'
    wb.created = new Date()

    const monthName = new Date(year, month - 1).toLocaleString('fr-FR', { month: 'long', year: 'numeric' })

    // Sheet 1: Dépôts
    const shDep = wb.addWorksheet('Dépôts')
    shDep.addRow(['Date', 'Utilisateur', 'Montant USDC', 'Tx Hash'])
    styleHeader(shDep.getRow(1))
    filterByMonth(deposits, ts, year, month).forEach(e => {
      shDep.addRow([toDate(ts(e.blockNumber)), e.args?.user, formatUsdc(e.args?.amount ?? 0n), e.transactionHash])
    })
    shDep.columns = [{ width: 22 }, { width: 44 }, { width: 16 }, { width: 70 }]

    // Sheet 2: Charges
    const shCharge = wb.addWorksheet('Charges')
    shCharge.addRow(['Date', 'Utilisateur', 'Provider', 'USDC débité', 'DIEM reçu', 'Part provider (DIEM)', 'Frais (DIEM)', 'Surcharge (DIEM)', 'Tx Hash'])
    styleHeader(shCharge.getRow(1))
    filterByMonth(charges, ts, year, month).forEach(e => {
      shCharge.addRow([
        toDate(ts(e.blockNumber)), e.args?.user, e.args?.provider,
        formatUsdc(e.args?.amount ?? 0n), formatDiem(e.args?.diemReceived ?? 0n),
        formatDiem(e.args?.providerShare ?? 0n), formatDiem(e.args?.fees ?? 0n),
        formatDiem(e.args?.surcharge ?? 0n), e.transactionHash,
      ])
    })
    filterByMonth(batchCharges, ts, year, month).forEach(e => {
      shCharge.addRow([
        toDate(ts(e.blockNumber)), `(batch ${e.args?.entryCount} entrées)`, '—',
        formatUsdc(e.args?.totalUsdc ?? 0n), formatDiem(e.args?.diemReceived ?? 0n),
        '—', formatDiem(e.args?.fees ?? 0n), formatDiem(e.args?.surcharge ?? 0n),
        e.transactionHash,
      ])
    })
    shCharge.columns = [{ width: 22 }, { width: 44 }, { width: 44 }, { width: 14 }, { width: 14 }, { width: 20 }, { width: 14 }, { width: 18 }, { width: 70 }]

    // Sheet 3: Routes externes
    const shExt = wb.addWorksheet('Routes externes')
    shExt.addRow(['Date', 'Utilisateur', 'Vers Float (USDC)', 'Vers Treasury (USDC)', 'Total (USDC)', 'Tx Hash'])
    styleHeader(shExt.getRow(1))
    filterByMonth(externalRoutes, ts, year, month).forEach(e => {
      const toFloat = formatUsdc(e.args?.toFloat ?? 0n)
      const toTreasury = formatUsdc(e.args?.toTreasury ?? 0n)
      shExt.addRow([toDate(ts(e.blockNumber)), e.args?.user, toFloat, toTreasury, toFloat + toTreasury, e.transactionHash])
    })
    shExt.columns = [{ width: 22 }, { width: 44 }, { width: 18 }, { width: 20 }, { width: 14 }, { width: 70 }]

    // Sheet 4: Retraits providers
    const shProv = wb.addWorksheet('Retraits providers')
    shProv.addRow(['Date', 'Provider', 'Montant DIEM', 'Tx Hash'])
    styleHeader(shProv.getRow(1))
    filterByMonth(providerWithdrawals, ts, year, month).forEach(e => {
      shProv.addRow([toDate(ts(e.blockNumber)), e.args?.provider, formatDiem(e.args?.amount ?? 0n), e.transactionHash])
    })
    shProv.columns = [{ width: 22 }, { width: 44 }, { width: 16 }, { width: 70 }]

    // Sheet 5: Migrations
    const shMig = wb.addWorksheet('Migrations')
    shMig.addRow(['Date', 'Utilisateur', 'Compte destinataire', 'Montant USDC', 'Tx Hash'])
    styleHeader(shMig.getRow(1))
    filterByMonth(migrations, ts, year, month).forEach(e => {
      shMig.addRow([toDate(ts(e.blockNumber)), e.args?.user, e.args?.account, formatUsdc(e.args?.amount ?? 0n), e.transactionHash])
    })
    shMig.columns = [{ width: 22 }, { width: 44 }, { width: 44 }, { width: 14 }, { width: 70 }]

    // Sheet 6: Rebates
    const shRebate = wb.addWorksheet('Rebates')
    shRebate.addRow(['Date', 'USDC In', 'DIEM Out', 'Nb providers', 'Tx Hash'])
    styleHeader(shRebate.getRow(1))
    filterByMonth(rebates, ts, year, month).forEach(e => {
      shRebate.addRow([toDate(ts(e.blockNumber)), formatUsdc(e.args?.usdcIn ?? 0n), formatDiem(e.args?.diemOut ?? 0n), Number(e.args?.providerCount ?? 0n), e.transactionHash])
    })
    shRebate.columns = [{ width: 22 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 70 }]

    // Sheet 7: Treasury
    const shTreasury = wb.addWorksheet('Treasury')
    shTreasury.addRow(['Date', 'Destinataire', 'Montant DIEM', 'Raison', 'Tx Hash'])
    styleHeader(shTreasury.getRow(1))
    filterByMonth(treasuryFunds, ts, year, month).forEach(e => {
      shTreasury.addRow([toDate(ts(e.blockNumber)), shortAddr(e.args?.to), formatDiem(e.args?.amount ?? 0n), e.args?.reason, e.transactionHash])
    })
    shTreasury.columns = [{ width: 22 }, { width: 14 }, { width: 16 }, { width: 30 }, { width: 70 }]

    // Sheet Résumé
    const shSum = wb.addWorksheet('Résumé')
    const depFiltered = filterByMonth(deposits, ts, year, month)
    const chargeFiltered = filterByMonth(charges, ts, year, month)
    const batchFiltered = filterByMonth(batchCharges, ts, year, month)
    const extFiltered = filterByMonth(externalRoutes, ts, year, month)
    const provFiltered = filterByMonth(providerWithdrawals, ts, year, month)
    const migFiltered = filterByMonth(migrations, ts, year, month)
    const rebateFiltered = filterByMonth(rebates, ts, year, month)
    const treasuryFiltered = filterByMonth(treasuryFunds, ts, year, month)

    const totalDeposits = depFiltered.reduce((s, e) => s + formatUsdc(e.args?.amount ?? 0n), 0)
    const totalCharged = chargeFiltered.reduce((s, e) => s + formatUsdc(e.args?.amount ?? 0n), 0)
      + batchFiltered.reduce((s, e) => s + formatUsdc(e.args?.totalUsdc ?? 0n), 0)
    const totalExternal = extFiltered.reduce((s, e) => s + formatUsdc(e.args?.toFloat ?? 0n) + formatUsdc(e.args?.toTreasury ?? 0n), 0)
    const totalMigrations = migFiltered.reduce((s, e) => s + formatUsdc(e.args?.amount ?? 0n), 0)
    const totalFees = chargeFiltered.reduce((s, e) => s + formatDiem(e.args?.fees ?? 0n), 0)
      + batchFiltered.reduce((s, e) => s + formatDiem(e.args?.fees ?? 0n), 0)
    const totalProvWithdrawals = provFiltered.reduce((s, e) => s + formatDiem(e.args?.amount ?? 0n), 0)
    const totalRebates = rebateFiltered.reduce((s, e) => s + formatUsdc(e.args?.usdcIn ?? 0n), 0)
    const totalTreasury = treasuryFiltered.reduce((s, e) => s + formatDiem(e.args?.amount ?? 0n), 0)

    shSum.addRow([`Résumé comptable — ${monthName}`])
    shSum.getRow(1).font = { bold: true, size: 14 }
    shSum.addRow([])
    shSum.addRow(['FLUX USDC', 'Montant'])
    styleHeader(shSum.getRow(3))
    shSum.addRow(['Dépôts utilisateurs', totalDeposits])
    shSum.addRow(['Charges (services)', -totalCharged])
    shSum.addRow(['Routes externes', -totalExternal])
    shSum.addRow(['Migrations crédits', -totalMigrations])
    shSum.addRow(['Rebates (USDC in)', -totalRebates])
    shSum.addRow(['Solde net USDC', totalDeposits - totalCharged - totalExternal - totalMigrations - totalRebates])
    shSum.getRow(9).font = { bold: true }
    shSum.addRow([])
    shSum.addRow(['FLUX DIEM', 'Montant'])
    styleHeader(shSum.getRow(11))
    shSum.addRow(['Frais protocole', totalFees])
    shSum.addRow(['Retraits providers', -totalProvWithdrawals])
    shSum.addRow(['Vers Treasury', totalTreasury])
    shSum.columns = [{ width: 30 }, { width: 20 }]

    const buffer = await wb.xlsx.writeBuffer()

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="carpe-diem-compta-${year}-${String(month).padStart(2, '0')}.xlsx"`,
      },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Erreur génération export' }, { status: 500 })
  }
}
