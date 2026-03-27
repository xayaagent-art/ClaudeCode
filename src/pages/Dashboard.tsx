import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/store'
import { usePositions } from '../hooks/usePositions'
import { useMonthlyIncome } from '../hooks/useMonthlyIncome'
import IncomeProgressBar from '../components/IncomeProgressBar'
import PositionCard from '../components/PositionCard'
import RuleAlerts from '../components/RuleAlerts'
import { getGreeting, formatDate, getDaysLeftInMonth, getDailyPaceNeeded, getPaceStatus } from '../lib/utils'

export default function Dashboard() {
  const navigate = useNavigate()
  const user = useStore((s) => s.user)
  const { openPositions, loading } = usePositions()
  const { monthlyIncome } = useMonthlyIncome()

  const daysLeft = getDaysLeftInMonth()
  const now = new Date()
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const target = user?.monthly_target || 3750
  const collected = monthlyIncome?.netPremium || 0
  const remaining = Math.max(0, target - collected)
  const dailyPace = getDailyPaceNeeded(remaining, daysLeft)
  const paceStatus = getPaceStatus(collected, target, daysLeft, totalDays)

  return (
    <div className="px-4 pt-[env(safe-area-inset-top)] pb-4">
      {/* Header */}
      <div className="pt-6 pb-4">
        <h1 className="text-xl font-bold">
          {getGreeting()}, {user?.name || 'Yash'}
        </h1>
        <p className="text-sm text-rh-subtext">{formatDate()}</p>
      </div>

      {/* Monthly Income */}
      <div className="mb-4">
        <IncomeProgressBar
          collected={collected}
          target={target}
          daysLeft={daysLeft}
          dailyPace={dailyPace}
          paceStatus={paceStatus}
        />
      </div>

      {/* Rule Alerts */}
      {openPositions.length > 0 && (
        <div className="mb-4">
          <RuleAlerts
            positions={openPositions}
            portfolioSize={user?.portfolio_size || 100000}
          />
        </div>
      )}

      {/* Open Positions */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-rh-subtext uppercase tracking-wider">
            Positions ({openPositions.length} open)
          </span>
          <button
            onClick={() => navigate('/positions')}
            className="text-xs text-rh-green font-medium"
          >
            See all
          </button>
        </div>

        {loading ? (
          <div className="card flex items-center justify-center py-8">
            <div className="text-rh-subtext text-sm">Loading positions...</div>
          </div>
        ) : openPositions.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-8">
            <p className="text-rh-subtext text-sm mb-3">No open positions</p>
            <button
              onClick={() => navigate('/log')}
              className="btn-primary text-sm"
            >
              Log your first trade
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {openPositions.slice(0, 6).map((pos) => (
              <PositionCard key={pos.id} position={pos} />
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => navigate('/scan')}
          className="btn-secondary flex-1 flex items-center justify-center gap-2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Daily Scan
        </button>
        <button
          onClick={() => navigate('/log')}
          className="btn-primary flex-1 flex items-center justify-center gap-2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Log Trade
        </button>
      </div>
    </div>
  )
}
