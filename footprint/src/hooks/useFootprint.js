import { useState, useCallback, useEffect } from 'react'
import { getContinent, getUniqueContinents, TOTAL_COUNTRIES } from '../data/countryMeta'

const STORAGE_KEY = 'footprint_unlocked'

function loadUnlocked() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveUnlocked(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function useFootprint() {
  const [unlocked, setUnlocked] = useState(loadUnlocked)

  useEffect(() => {
    saveUnlocked(unlocked)
  }, [unlocked])

  const isUnlocked = useCallback((iso) => {
    return !!unlocked[iso]
  }, [unlocked])

  const unlock = useCallback((iso, name) => {
    if (unlocked[iso]) return false
    setUnlocked(prev => {
      const next = { ...prev, [iso]: { name, date: new Date().toISOString(), continent: getContinent(iso) } }
      return next
    })
    return true
  }, [unlocked])

  const getInfo = useCallback((iso) => {
    return unlocked[iso] || null
  }, [unlocked])

  const unlockedCodes = Object.keys(unlocked)
  const countryCount = unlockedCodes.length
  const continentCount = getUniqueContinents(unlockedCodes)
  const percentage = Math.round((countryCount / TOTAL_COUNTRIES) * 100)

  return {
    unlocked,
    isUnlocked,
    unlock,
    getInfo,
    countryCount,
    continentCount,
    percentage,
  }
}
