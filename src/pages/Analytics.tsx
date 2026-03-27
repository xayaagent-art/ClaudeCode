import { useMonthlyIncome } from '../hooks/useMonthlyIncome'
import { usePositions } from '../hooks/usePositions'
import { useStore } from '../store/store'
import { formatCurrencyRaw, getMonthName } from '../lib/utils'

export default function Analytics() {
  const user = useStore((s) => s.user)
  const { monthlyIncome } = useMonthlyIncome()
  const { positions, closedPositions, openPositions } = usePositions()
  const target = user?.monthly_target || 3750

  const now = new Date()
  const monthName = getMonthName(now.getMonth() + 1)

  const winRate = monthlyIncome && monthlyIncome.closedTrades.length > 0
    ? (monthlyIncome.closedTrades.filter((t) => t.premium > 0).length / monthlyIncome.closedTrades.length * 100)
    : 0

  return (
    <div className="px-4 pt-[env(safe-area-inset-top)] pb-4">
      <div className="pt-6 pb-4">
        <h1 className="text-xl font-bold">Analytics</h1>
        <p className="text-sm text-rh-subtext mt-1">{monthName} performance</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="card">
          <div className="text-xs text-rh-subtext mb-1">Net Premium</div>
          <div className="text-lg font-bold">
            {formatCurrencyRaw(monthlyIncome?.netPremium || 0)}
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-rh-subtext mb-1">Target</div>
          <div className="text-lg font-bold">{formatCurrencyRaw(target)}</div>
        </div>
        <div className="card">
          <div className="text-xs text-rh-subtext mb-1">Win Rate</div>
          <div className="text-lg font-bold">{winRate.toFixed(0)}%</div>
        </div>
        <div className="card">
          <div className="text-xs text-rh-subtext mb-1">Total Trades</div>
          <div className="text-lg font-bold">{positions.length}</div>
        </div>
      </div>

      {/* Position Breakdown */}
      <div className="card mb-4">
        <h2 className="text-xs font-semibold text-rh-subtext uppercase tracking-wider mb-3">
          Position Breakdown
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-rh-subtext">Open positions</span>
            <span>{openPositions.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-rh-subtext">Closed this month</span>
            <span>{closedPositions.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-rh-subtext">Collected</span>
            <span className="text-rh-green">{formatCurrencyRaw(monthlyIncome?.totalCollected || 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-rh-subtext">Losses</span>
            <span className="text-rh-red">{formatCurrencyRaw(monthlyIncome?.totalLosses || 0)}</span>
          </div>
        </div>
      </div>

      {/* Closed Trades */}
      {monthlyIncome && monthlyIncome.closedTrades.length > 0 && (
        <div className="card">
          <h2 className="text-xs font-semibold text-rh-subtext uppercase tracking-wider mb-3">
            Recent Closes
          </h2>
          <div className="space-y-2">
            {monthlyIncome.closedTrades.map((trade, i) => (
              <div key={i} className="flex items-center justify-between py-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{trade.ticker}</span>
                  <span className="text-xs text-rh-subtext">{trade.type}</span>
                </div>
                <span className={trade.premium >= 0 ? 'text-rh-green' : 'text-rh-red'}>
                  {trade.premium >= 0 ? '+' : ''}{formatCurrencyRaw(trade.premium)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!monthlyIncome || monthlyIncome.closedTrades.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-8">
          <p className="text-rh-subtext text-sm">No closed trades this month yet</p>
        </div>
      ) : null}
    </div>
  )
}
