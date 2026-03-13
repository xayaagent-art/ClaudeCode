import { useEffect } from 'react'
import { useStore } from '../store/store'

export function useMonthlyIncome() {
  const { monthlyIncome, fetchMonthlyIncome, positions, user } = useStore()

  useEffect(() => {
    if (user && positions.length > 0) {
      fetchMonthlyIncome()
    }
  }, [user, positions, fetchMonthlyIncome])

  return { monthlyIncome }
}
