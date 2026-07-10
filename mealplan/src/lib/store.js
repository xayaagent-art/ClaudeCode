import { useEffect, useState } from 'react'
import { SEED_RECIPES } from './seed'

const KEY = 'mealplan.v1'

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

export const normalize = (s) => (s || '').trim().toLowerCase()

// Local date, not UTC — the "day" boundary should match the kitchen clock.
export const todayStr = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function relativeDay(ts) {
  if (!ts) return 'never'
  const days = Math.floor(
    (new Date().setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) /
      86400000,
  )
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  return months === 1 ? '1 month ago' : `${months} months ago`
}

function defaultState() {
  return {
    recipes: SEED_RECIPES,
    pantry: [],
    pick: null, // { date: 'YYYY-MM-DD', id }
    pickPantryOnly: false,
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.recipes)) {
        return { ...defaultState(), ...parsed }
      }
    }
  } catch {
    // corrupted storage — fall through to defaults
  }
  return defaultState()
}

export function usePersistentState() {
  const [state, setState] = useState(loadState)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      // storage full or unavailable — app keeps working in-memory
    }
  }, [state])
  return [state, setState]
}
