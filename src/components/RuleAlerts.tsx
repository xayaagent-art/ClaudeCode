import type { PositionWithLegs } from '../lib/types'
import { calculateChainPnL, getDTE } from '../lib/utils'

interface RuleAlert {
  type: 'profit' | 'loss' | 'dte' | 'size'
  ticker: string
  message: string
  severity: 'green' | 'yellow' | 'red'
}

export function getRuleAlerts(positions: PositionWithLegs[], portfolioSize: number): RuleAlert[] {
  const alerts: RuleAlert[] = []

  for (const pos of positions) {
    if (pos.status !== 'open') continue

    const pnl = calculateChainPnL(pos.legs)
    const currentLeg = pnl.currentLeg
    const dte = currentLeg ? getDTE(currentLeg.expiration) : 0

    if (pnl.pnlPercent >= 50) {
      alerts.push({
        type: 'profit',
        ticker: pos.ticker,
        message: `${pos.ticker} at ${pnl.pnlPercent.toFixed(0)}% profit — close now`,
        severity: 'green',
      })
    }

    if (pnl.pnlPercent <= -50) {
      alerts.push({
        type: 'loss',
        ticker: pos.ticker,
        message: `${pos.ticker} at ${pnl.pnlPercent.toFixed(0)}% loss — consider rolling`,
        severity: 'red',
      })
    }

    if (dte <= 21 && dte > 0 && pnl.pnlPercent >= 25) {
      alerts.push({
        type: 'dte',
        ticker: pos.ticker,
        message: `${pos.ticker} ${dte} DTE with ${pnl.pnlPercent.toFixed(0)}% profit — close soon`,
        severity: 'yellow',
      })
    }

    if (currentLeg && portfolioSize > 0) {
      const positionSize = currentLeg.strike * 100
      const pctOfPortfolio = (positionSize / portfolioSize) * 100
      if (pctOfPortfolio > 20) {
        alerts.push({
          type: 'size',
          ticker: pos.ticker,
          message: `${pos.ticker} is ${pctOfPortfolio.toFixed(0)}% of portfolio — over 20% limit`,
          severity: 'red',
        })
      }
    }
  }

  return alerts
}

const severityStyles = {
  green: 'border-rh-green/30 bg-rh-green/5 text-rh-green',
  yellow: 'border-rh-yellow/30 bg-rh-yellow/5 text-rh-yellow',
  red: 'border-rh-red/30 bg-rh-red/5 text-rh-red',
}

const severityIcons = {
  green: '●',
  yellow: '▲',
  red: '◆',
}

export default function RuleAlerts({ positions, portfolioSize }: { positions: PositionWithLegs[], portfolioSize: number }) {
  const alerts = getRuleAlerts(positions, portfolioSize)

  if (alerts.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-rh-subtext uppercase tracking-wider">
          Alerts
        </span>
        <span className="bg-rh-red/20 text-rh-red text-xs font-bold px-2 py-0.5 rounded-full">
          {alerts.length}
        </span>
      </div>
      {alerts.map((alert, i) => (
        <div
          key={i}
          className={`border rounded-lg px-3 py-2 text-sm ${severityStyles[alert.severity]}`}
        >
          <span className="mr-1.5">{severityIcons[alert.severity]}</span>
          {alert.message}
        </div>
      ))}
    </div>
  )
}
