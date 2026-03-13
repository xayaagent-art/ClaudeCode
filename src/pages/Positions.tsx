import { useState } from 'react'
import { usePositions } from '../hooks/usePositions'
import PositionCard from '../components/PositionCard'
import { calculateChainPnL, getPositionStatus } from '../lib/utils'

type TabFilter = 'open' | 'assigned' | 'closed'

const statusOrder = { red: 0, yellow: 1, green: 2 }

export default function Positions() {
  const [activeTab, setActiveTab] = useState<TabFilter>('open')
  const { openPositions, assignedPositions, closedPositions, loading } = usePositions()

  const tabCounts = {
    open: openPositions.length,
    assigned: assignedPositions.length,
    closed: closedPositions.length,
  }

  const getFilteredPositions = () => {
    let positions = activeTab === 'open'
      ? openPositions
      : activeTab === 'assigned'
        ? assignedPositions
        : closedPositions

    if (activeTab === 'open') {
      positions = [...positions].sort((a, b) => {
        const pnlA = calculateChainPnL(a.legs)
        const pnlB = calculateChainPnL(b.legs)
        const statusA = getPositionStatus(pnlA.pnlPercent)
        const statusB = getPositionStatus(pnlB.pnlPercent)
        return statusOrder[statusA] - statusOrder[statusB]
      })
    }

    return positions
  }

  const positions = getFilteredPositions()

  return (
    <div className="px-4 pt-[env(safe-area-inset-top)] pb-4">
      <div className="pt-6 pb-4">
        <h1 className="text-xl font-bold">Positions</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-rh-surface rounded-lg p-1 mb-4">
        {(['open', 'assigned', 'closed'] as TabFilter[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors capitalize ${
              activeTab === tab
                ? 'bg-rh-bg text-rh-text'
                : 'text-rh-subtext'
            }`}
          >
            {tab} ({tabCounts[tab]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card flex items-center justify-center py-12">
          <p className="text-rh-subtext text-sm">Loading...</p>
        </div>
      ) : positions.length === 0 ? (
        <div className="card flex items-center justify-center py-12">
          <p className="text-rh-subtext text-sm">
            No {activeTab} positions
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {positions.map((pos) => (
            <PositionCard key={pos.id} position={pos} />
          ))}
        </div>
      )}
    </div>
  )
}
