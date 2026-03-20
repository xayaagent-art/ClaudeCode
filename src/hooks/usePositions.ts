import { useEffect } from 'react'
import { useStore } from '../store/store'

export function usePositions() {
  const {
    positions,
    loading,
    fetchPositions,
    addPosition,
    closePosition,
    logRoll,
    user,
  } = useStore()

  useEffect(() => {
    if (user) {
      fetchPositions()
    }
  }, [user, fetchPositions])

  const openPositions = positions.filter((p) => p.status === 'open')
  const assignedPositions = positions.filter((p) => p.status === 'assigned')
  const closedPositions = positions.filter((p) => p.status === 'closed')

  return {
    positions,
    openPositions,
    assignedPositions,
    closedPositions,
    loading,
    fetchPositions,
    addPosition,
    closePosition,
    logRoll,
  }
}
