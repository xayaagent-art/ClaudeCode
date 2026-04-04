import { useState, useCallback, useEffect } from 'react'
import { getContinent, getUniqueContinents, getContinentBreakdown, getRank, getNextRank, TOTAL_COUNTRIES } from '../data/countryMeta'

const STORAGE_KEY = 'footprint_unlocked'
const CITIES_KEY = 'footprint_cities'
const NOTES_KEY = 'footprint_notes'
const WISHLIST_KEY = 'footprint_wishlist'

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)) || {} } catch { return {} }
}
function loadArr(key) {
  try { return JSON.parse(localStorage.getItem(key)) || [] } catch { return [] }
}
function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data))
}

export function useFootprint() {
  const [unlocked, setUnlocked] = useState(() => load(STORAGE_KEY))
  const [unlockedCities, setUnlockedCities] = useState(() => load(CITIES_KEY))
  const [notes, setNotes] = useState(() => load(NOTES_KEY))
  const [wishlist, setWishlist] = useState(() => loadArr(WISHLIST_KEY))

  useEffect(() => { save(STORAGE_KEY, unlocked) }, [unlocked])
  useEffect(() => { save(CITIES_KEY, unlockedCities) }, [unlockedCities])
  useEffect(() => { save(NOTES_KEY, notes) }, [notes])
  useEffect(() => { save(WISHLIST_KEY, wishlist) }, [wishlist])

  const isUnlocked = useCallback((iso) => !!unlocked[iso], [unlocked])
  const isWishlisted = useCallback((iso) => wishlist.includes(iso), [wishlist])

  const addToWishlist = useCallback((iso) => {
    setWishlist(prev => prev.includes(iso) ? prev : [...prev, iso])
  }, [])

  const removeFromWishlist = useCallback((iso) => {
    setWishlist(prev => prev.filter(i => i !== iso))
  }, [])

  const unlock = useCallback((iso, name) => {
    if (unlocked[iso]) return { isNew: false }
    const continent = getContinent(iso)
    const newUnlocked = { ...unlocked, [iso]: { name, date: new Date().toISOString(), continent } }
    setUnlocked(newUnlocked)
    // Remove from wishlist if present
    setWishlist(prev => prev.filter(i => i !== iso))

    const newCount = Object.keys(newUnlocked).length
    const isMilestone = newCount > 0 && newCount % 5 === 0
    const newRank = getRank(newCount)
    const oldRank = getRank(newCount - 1)
    const rankUp = newRank.name !== oldRank.name

    const breakdown = getContinentBreakdown(Object.keys(newUnlocked))
    const continentVisited = breakdown[continent] || 0

    return { isNew: true, isMilestone, rankUp, newRank, continent, continentVisited }
  }, [unlocked])

  const unlockCity = useCallback((iso, cityName) => {
    setUnlockedCities(prev => {
      const cities = prev[iso] || []
      if (cities.includes(cityName)) return prev
      return { ...prev, [iso]: [...cities, cityName] }
    })
  }, [])

  const saveNote = useCallback((iso, text) => {
    setNotes(prev => ({ ...prev, [iso]: text }))
  }, [])

  const getInfo = useCallback((iso) => unlocked[iso] || null, [unlocked])

  const unlockedCodes = Object.keys(unlocked)
  const countryCount = unlockedCodes.length
  const continentCount = getUniqueContinents(unlockedCodes)
  const percentage = Math.round((countryCount / TOTAL_COUNTRIES) * 100)
  const continentBreakdown = getContinentBreakdown(unlockedCodes)
  const rank = getRank(countryCount)
  const nextRank = getNextRank(countryCount)
  const countriesUntilNextRank = nextRank ? nextRank.min - countryCount : 0
  const totalCityCount = Object.values(unlockedCities).reduce((sum, arr) => sum + arr.length, 0)
  const wishlistCount = wishlist.length

  return {
    unlocked, isUnlocked, unlock, getInfo,
    unlockedCities, unlockCity,
    notes, saveNote,
    wishlist, isWishlisted, addToWishlist, removeFromWishlist, wishlistCount,
    countryCount, continentCount, percentage, totalCityCount,
    continentBreakdown, rank, nextRank, countriesUntilNextRank,
  }
}
