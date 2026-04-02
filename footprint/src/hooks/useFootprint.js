import { useState, useCallback, useEffect, useRef } from 'react'
import { getContinent, getUniqueContinents, getContinentBreakdown, getRank, getNextRank, TOTAL_COUNTRIES } from '../data/countryMeta'

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
  const prevCountRef = useRef(Object.keys(loadUnlocked()).length)

  useEffect(() => {
    saveUnlocked(unlocked)
  }, [unlocked])

  const isUnlocked = useCallback((iso) => {
    return !!unlocked[iso]
  }, [unlocked])

  const unlock = useCallback((iso, name) => {
    if (unlocked[iso]) return { isNew: false }
    const continent = getContinent(iso)
    setUnlocked(prev => {
      const next = { ...prev, [iso]: { name, date: new Date().toISOString(), continent } }
      return next
    })
    const newCount = Object.keys(unlocked).length + 1
    const isMilestone = newCount > 0 && newCount % 5 === 0
    const newRank = getRank(newCount)
    const oldRank = getRank(newCount - 1)
    const rankUp = newRank.name !== oldRank.name
    prevCountRef.current = newCount
    return { isNew: true, isMilestone, rankUp, newRank, continent }
  }, [unlocked])

  const getInfo = useCallback((iso) => {
    return unlocked[iso] || null
  }, [unlocked])

  const unlockedCodes = Object.keys(unlocked)
  const countryCount = unlockedCodes.length
  const continentCount = getUniqueContinents(unlockedCodes)
  const percentage = Math.round((countryCount / TOTAL_COUNTRIES) * 100)
  const continentBreakdown = getContinentBreakdown(unlockedCodes)
  const rank = getRank(countryCount)
  const nextRank = getNextRank(countryCount)
  const countriesUntilNextRank = nextRank ? nextRank.min - countryCount : 0

  return {
    unlocked,
    isUnlocked,
    unlock,
    getInfo,
    countryCount,
    continentCount,
    percentage,
    continentBreakdown,
    rank,
    nextRank,
    countriesUntilNextRank,
  }
}
