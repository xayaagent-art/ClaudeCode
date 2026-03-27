import { formatCurrencyRaw } from '../lib/utils'
import type { StatusColor } from '../lib/types'

interface IncomeProgressBarProps {
  collected: number
  target: number
  daysLeft: number
  dailyPace: number
  paceStatus: StatusColor
}

const paceColors: Record<StatusColor, string> = {
  green: 'bg-rh-green',
  yellow: 'bg-rh-yellow',
  red: 'bg-rh-red',
}

const paceTextColors: Record<StatusColor, string> = {
  green: 'text-rh-green',
  yellow: 'text-rh-yellow',
  red: 'text-rh-red',
}

export default function IncomeProgressBar({
  collected,
  target,
  daysLeft,
  dailyPace,
  paceStatus,
}: IncomeProgressBarProps) {
  const percent = target > 0 ? Math.min((collected / target) * 100, 100) : 0

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-rh-subtext uppercase tracking-wider">
          Monthly Income
        </span>
        <span className={`text-xs font-semibold ${paceTextColors[paceStatus]}`}>
          {percent.toFixed(0)}%
        </span>
      </div>

      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-2xl font-bold">{formatCurrencyRaw(collected)}</span>
        <span className="text-sm text-rh-subtext">/ {formatCurrencyRaw(target)} target</span>
      </div>

      <div className="h-2 bg-rh-border rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all duration-500 ${paceColors[paceStatus]}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-rh-subtext">
        <span>{daysLeft} days left</span>
        <span>Need {formatCurrencyRaw(dailyPace)}/day</span>
      </div>
    </div>
  )
}
