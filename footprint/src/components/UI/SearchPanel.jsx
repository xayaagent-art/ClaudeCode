import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { isoToFlag, getContinent } from '../../data/countryMeta'
import { getContinentColor } from '../../data/continentColors'

export default function SearchPanel({ countries, isUnlocked, onSelect, open, onClose }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const filtered = query.length > 0
    ? countries.filter(c => c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 30)
    : countries

  const handleSelect = useCallback((country) => {
    onSelect(country)
    onClose()
    setQuery('')
  }, [onSelect, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.25)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 480,
              background: 'white',
              borderRadius: '24px 24px 0 0',
              maxHeight: '80dvh',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
            }}
          >
            {/* Handle bar */}
            <div style={{ padding: '12px 0 4px', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: '#E0E0E0' }} />
            </div>

            {/* Search input */}
            <div style={{ padding: '8px 20px 12px' }}>
              <div style={{
                position: 'relative', display: 'flex', alignItems: 'center',
                background: '#F7F7F7', borderRadius: 12,
                height: 48, padding: '0 16px',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B0B0B0" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search countries..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  style={{
                    background: 'transparent', border: 'none', outline: 'none',
                    padding: '0 12px', fontSize: 16, color: '#222',
                    width: '100%', height: '100%',
                    fontFamily: 'var(--font-body)',
                  }}
                />
                {query && (
                  <button
                    onClick={() => { setQuery(''); inputRef.current?.focus() }}
                    style={{
                      background: '#D8D8D8', border: 'none', borderRadius: '50%',
                      width: 24, height: 24, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
                      fontSize: 14, color: '#717171', lineHeight: 1,
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
                const contColor = getContinentColor(continent)
                return (
                  <button
                    key={c.iso}
                    onClick={() => handleSelect(c)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      width: '100%', height: 52, padding: '0 20px',
                      border: 'none', background: 'transparent',
                      fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500,
                      color: '#222', cursor: 'pointer',
                      borderBottom: '1px solid #F7F7F7', textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 22, width: 32, textAlign: 'center' }}>{isoToFlag(c.iso)}</span>
                    <span style={{ flex: 1 }}>{c.name}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: contColor,
                      background: `${contColor}15`, borderRadius: 6,
                      padding: '2px 8px', textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}>
                      {continent === 'North America' ? 'N. America' : continent === 'South America' ? 'S. America' : continent}
                    </span>
                    <span style={{ fontSize: 16, color: unlocked ? '#00A699' : '#D8D8D8', width: 24, textAlign: 'center' }}>
                      {unlocked ? '✓' : '🔒'}
                    </span>
                  </button>
                )
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
