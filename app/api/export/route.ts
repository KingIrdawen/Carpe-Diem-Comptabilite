import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { fetchAllContractEvents, DecodedEvent } from '@/lib/fetchEvents'
import { formatUsdc, formatDiem } from '@/lib/viemClient'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function toDate(ts: number) {
  return ts ? new Date(ts * 1000).toLocaleString('fr-FR') : ''
}

function shortAddr(addr: string | undefined) {
  if (!addr) return ''
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function filterByMonth(events: DecodedEvent[], year: number, month: number): DecodedEvent[] {
  return events.filter(e => {
    const d = new Date(e.timestamp * 1000)
    return d.getFullYear() === year && d.getMonth() + 1 === month
  })
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  row.alignment = { vertical: 'middle' }
}

function usdc(e: DecodedEvent, key: string) {
  return formatUsdc(BigInt(e.args[key] as string))
}
function diem(e: DecodedEvent, key: string) {
  return formatDiem(BigInt(e.args[key] as string))
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))

  try {
    const allEvents = await fetchAllContractEvents()

    const deposits    = filterByMonth(allEvents.filter(e => e.type === 'Deposit'), year, month)
    const charges     = filterByMonth(allEvents.filter(e => e.type === 'Charge'), year, month)
    const batches     = filterByMonth(allEvents.filter(e => e.type === 'BatchCharge'), year, month)
    const extRoutes   = filterByMonth(allEvents.filter(e => e.type === 'ExternalRouteSettled'), year, month)
    const withdrawals = filterByMonth(allEvents.filter(e => e.type === 'ProviderWithdrawal'), year, month)
    const migrations  = filterByMonth(allEvents.filter(e => e.type === 'CreditsMigrated'), year, month)
    const rebates     = filterByMonth(allEvents.filter(e => e.type === 'RebateDistributed'), year, month)
    const treasury    = filterByMonth(allEvents.filter(e => e.type === 'TreasuryFunded'), year, month)

    const wb = new ExcelJS.Workbook()
    wb.creator = 'Carpe Diem Comptabilité'
    wb.created = new Date()
    const monthName = new Date(year, month - 1).toLocaleString('fr-FR', { month: 'long', year: 'numeric' })

    // Dépôts
    const shDep = wb.addWorksheet('Dépôts')
    shDep.addRow(['Date', 'Utilisateur', 'Montant USDC', 'Tx Hash'])
    styleHeader(shDep.getRow(1))
    deposits.forEach(e => shDep.addRow([toDate(e.timestamp), e.args.user, usdc(e, 'amount'), e.txHash]))
    shDep.columns = [{ width: 22 }, { width: 44 }, { width: 16 }, { width: 70 }]

    // Charges
    const shCharge = wb.addWorksheet('Charges')
    shCharge.addRow(['Date', 'Utilisateur', 'Provider', 'USDC débité', 'DIEM reçu', 'Part provider (DIEM)', 'Frais (DIEM)', 'Surcharge (DIEM)', 'Tx Hash'])
    styleHeader(shCharge.getRow(1))
    charges.forEach(e => shCharge.addRow([
      toDate(e.timestamp), e.args.user, e.args.provider,
      usdc(e, 'amount'), diem(e, 'diemReceived'), diem(e, 'providerShare'),
      diem(e, 'fees'), diem(e, 'surcharge'), e.txHash,
    ]))
    batches.forEach(e => shCharge.addRow([
      toDate(e.timestamp), `(batch ${e.args.entryCount} entrées)`, '—',
      usdc(e, 'totalUsdc'), diem(e, 'diemReceived'), '—',
      diem(e, 'fees'), diem(e, 'surcharge'), e.txHash,
    ]))
    shCharge.columns = [{ width: 22 }, { width: 44 }, { width: 44 }, { width: 14 }, { width: 14 }, { width: 20 }, { width: 14 }, { width: 18 }, { width: 70 }]

    // Routes externes
    const shExt = wb.addWorksheet('Routes externes')
    shExt.addRow(['Date', 'Utilisateur', 'Vers Float (USDC)', 'Vers Treasury (USDC)', 'Total (USDC)', 'Tx Hash'])
    styleHeader(shExt.getRow(1))
    extRoutes.forEach(e => {
      const f = usdc(e, 'toFloat'), t = usdc(e, 'toTreasury')
      shExt.addRow([toDate(e.timestamp), e.args.user, f, t, f + t, e.txHash])
    })
    shExt.columns = [{ width: 22 }, { width: 44 }, { width: 18 }, { width: 20 }, { width: 14 }, { width: 70 }]

    // Retraits providers
    const shProv = wb.addWorksheet('Retraits providers')
    shProv.addRow(['Date', 'Provider', 'Montant DIEM', 'Tx Hash'])
    styleHeader(shProv.getRow(1))
    withdrawals.forEach(e => shProv.addRow([toDate(e.timestamp), e.args.provider, diem(e, 'amount'), e.txHash]))
    shProv.columns = [{ width: 22 }, { width: 44 }, { width: 16 }, { width: 70 }]

    // Migrations
    const shMig = wb.addWorksheet('Migrations')
    shMig.addRow(['Date', 'Utilisateur', 'Compte destinataire', 'Montant USDC', 'Tx Hash'])
    styleHeader(shMig.getRow(1))
    migrations.forEach(e => shMig.addRow([toDate(e.timestamp), e.args.user, e.args.account, usdc(e, 'amount'), e.txHash]))
    shMig.columns = [{ width: 22 }, { width: 44 }, { width: 44 }, { width: 14 }, { width: 70 }]

    // Rebates
    const shRebate = wb.addWorksheet('Rebates')
    shRebate.addRow(['Date', 'USDC In', 'DIEM Out', 'Nb providers', 'Tx Hash'])
    styleHeader(shRebate.getRow(1))
    rebates.forEach(e => shRebate.addRow([toDate(e.timestamp), usdc(e, 'usdcIn'), diem(e, 'diemOut'), Number(e.args.providerCount), e.txHash]))
    shRebate.columns = [{ width: 22 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 70 }]

    // Treasury
    const shTreasury = wb.addWorksheet('Treasury')
    shTreasury.addRow(['Date', 'Destinataire', 'Montant DIEM', 'Raison', 'Tx Hash'])
    styleHeader(shTreasury.getRow(1))
    treasury.forEach(e => shTreasury.addRow([toDate(e.timestamp), shortAddr(e.args.to as string), diem(e, 'amount'), e.args.reason, e.txHash]))
    shTreasury.columns = [{ width: 22 }, { width: 14 }, { width: 16 }, { width: 30 }, { width: 70 }]

    // Résumé
    const shSum = wb.addWorksheet('Résumé')
    const totalDep  = deposits.reduce((s, e) => s + usdc(e, 'amount'), 0)
    const totalChg  = charges.reduce((s, e) => s + usdc(e, 'amount'), 0) + batches.reduce((s, e) => s + usdc(e, 'totalUsdc'), 0)
    const totalExt  = extRoutes.reduce((s, e) => s + usdc(e, 'toFloat') + usdc(e, 'toTreasury'), 0)
    const totalMig  = migrations.reduce((s, e) => s + usdc(e, 'amount'), 0)
    const totalFees = charges.reduce((s, e) => s + diem(e, 'fees'), 0) + batches.reduce((s, e) => s + diem(e, 'fees'), 0)
    const totalWdr  = withdrawals.reduce((s, e) => s + diem(e, 'amount'), 0)
    const totalReb  = rebates.reduce((s, e) => s + usdc(e, 'usdcIn'), 0)
    const totalTre  = treasury.reduce((s, e) => s + diem(e, 'amount'), 0)

    shSum.addRow([`Résumé comptable — ${monthName}`])
    shSum.getRow(1).font = { bold: true, size: 14 }
    shSum.addRow([])
    shSum.addRow(['FLUX USDC', 'Montant'])
    styleHeader(shSum.getRow(3))
    shSum.addRow(['Dépôts utilisateurs', totalDep])
    shSum.addRow(['Charges (services)', -totalChg])
    shSum.addRow(['Routes externes', -totalExt])
    shSum.addRow(['Migrations crédits', -totalMig])
    shSum.addRow(['Rebates (USDC in)', -totalReb])
    shSum.addRow(['Solde net USDC', totalDep - totalChg - totalExt - totalMig - totalReb])
    shSum.getRow(9).font = { bold: true }
    shSum.addRow([])
    shSum.addRow(['FLUX DIEM', 'Montant'])
    styleHeader(shSum.getRow(11))
    shSum.addRow(['Frais protocole', totalFees])
    shSum.addRow(['Retraits providers', -totalWdr])
    shSum.addRow(['Vers Treasury', totalTre])
    shSum.columns = [{ width: 30 }, { width: 20 }]

    const buffer = await wb.xlsx.writeBuffer()
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="carpe-diem-compta-${year}-${String(month).padStart(2, '0')}.xlsx"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Export error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
