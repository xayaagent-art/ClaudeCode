import { useState, useRef, useEffect, useCallback } from 'react'
import { isoToFlag, getContinent } from '../../data/countryMeta'
import { getCities } from '../../data/cities'
import ContinentBadge from './ContinentBadge'
import BottomSheet from './BottomSheet'

export default function SearchPanel({ countries, isUnlocked, onSelect, open, onClose }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [open])

  const q = query.toLowerCase()
  const filtered = q.length > 0
    ? (() => {
        const countryMatches = countries.filter(c => c.name.toLowerCase().includes(q))
        const cityMatches = countries.filter(c => {
          if (countryMatches.some(m => m.iso === c.iso)) return false
          return getCities(c.iso).some(city => city.toLowerCase().includes(q))
        })
        return [...countryMatches, ...cityMatches].slice(0, 30)
      })()
    : countries

  const handleSelect = useCallback((country) => {
    onSelect(country)
    onClose()
    setQuery('')
  }, [onSelect, onClose])

  return (
    <BottomSheet open={open} onClose={onClose}>
      {/* Title */}
      <div style={{ padding: '4px 20px 12px', textAlign: 'center' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600,
          color: 'var(--color-ink)', margin: 0,
        }}>
          Add a place
        </h2>
      </div>

      {/* Search input */}
      <div style={{ padding: '0 20px 12px' }}>
        <div style={{
          position: 'relative', display: 'flex', alignItems: 'center',
          background: 'var(--color-surface-2)', borderRadius: 'var(--radius-lg)',
          height: 48, padding: '0 16px',
          border: '1.5px solid transparent',
          transition: 'all var(--duration-fast)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-3)" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Country or city..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              padding: '0 12px', fontSize: 16, color: 'var(--color-ink)',
              width: '100%', height: '100%',
              fontFamily: 'var(--font-body)',
            }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus() }}
              style={{
                background: 'var(--color-border-2)', border: 'none', borderRadius: '50%',
                width: 24, height: 24, display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
                fontSize: 14, color: 'var(--color-ink-3)', lineHeight: 1,
              }}
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Country list */}
      <div style={{
        flex: 1, overflow: 'auto',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
      }}>
        {filtered.map(c => {
          const unlocked = isUnlocked(c.iso)
          const continent = getContinent(c.iso)
          const matchingCity = q.length > 0 && !c.name.toLowerCase().includes(q)
            ? getCities(c.iso).find(city => city.toLowerCase().includes(q))
            : null
          return (
            <button
              key={c.iso}
              onClick={() => handleSelect(c)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', minHeight: 52, padding: '8px 20px',
                border: 'none', background: 'transparent',
                fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500,
                color: 'var(--color-ink)', cursor: 'pointer',
                borderBottom: '1px solid var(--color-surface-2)', textAlign: 'left',
                transition: 'background var(--duration-fast)',
              }}
            >
              <span style={{ fontSize: 28, width: 36, textAlign: 'center' }}>{isoToFlag(c.iso)}</span>
              <span style={{ flex: 1 }}>
                {c.name}
                {matchingCity && (
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--color-ink-3)', fontWeight: 400 }}>
                    📍 {matchingCity}
                  </span>
                )}
              </span>
              <ContinentBadge continent={continent} size="sm" />
              <span style={{
                fontSize: 16, width: 24, textAlign: 'center',
                color: unlocked ? 'var(--color-brand-2)' : 'var(--color-border-2)',
              }}>
                {unlocked ? '✓' : '🔒'}
              </span>
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}
