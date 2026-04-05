import { useState } from 'react'
import { isoToFlag } from '../../data/countryMeta'
import { getCities } from '../../data/cities'
import { getContinentColor } from '../../data/continentColors'
import { isFullyExplored } from '../../data/cityProgress'
import ContinentBadge from './ContinentBadge'
import ProgressRing from './ProgressRing'
import BottomSheet from './BottomSheet'

export default function CountryDrawer({ data, unlockedCities, onCityUnlock, onClose, notes, onNoteSave }) {
  if (!data) return null

  const { iso, name, continent, date } = data
  const cities = getCities(iso)
  const citySet = unlockedCities[iso] || []
  const unlockCount = citySet.length
  const dateStr = date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
  const contColor = getContinentColor(continent)
  const fullyExplored = isFullyExplored(iso, unlockedCities)
  const [noteText, setNoteText] = useState(notes?.[iso] || '')
  const [noteSaved, setNoteSaved] = useState(false)
  const [editingNote, setEditingNote] = useState(false)

  const sortedCities = [...cities].sort((a, b) => {
    const aVisited = citySet.includes(a)
    const bVisited = citySet.includes(b)
    if (aVisited && !bVisited) return -1
    if (!aVisited && bVisited) return 1
    return 0
  })

  const handleNoteSave = () => {
    onNoteSave?.(iso, noteText)
    setNoteSaved(true)
    setEditingNote(false)
    setTimeout(() => setNoteSaved(false), 1500)
  }

  return (
    <BottomSheet open={!!data} onClose={onClose} maxHeight="85dvh" zIndex={90}>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 24px 28px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <span style={{ fontSize: 36 }}>{isoToFlag(iso)}</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{
                fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700,
                color: 'var(--color-ink)', margin: 0, lineHeight: 1.1,
              }}>{name}</h2>
              {fullyExplored && (
                <span title="Fully explored" style={{ fontSize: 18 }}>⭐</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <ContinentBadge continent={continent} />
              {dateStr && (
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink-3)' }}>
                  visited {dateStr}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Cities section */}
        {cities.length > 0 && (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 12,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700,
                  color: 'var(--color-ink-3)', textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}>
                  Cities explored
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                  color: 'var(--color-brand)', marginTop: 2,
                }}>
                  {unlockCount} / {cities.length}
                </div>
              </div>
              <ProgressRing current={unlockCount} total={cities.length} color={contColor} />
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: 8, marginBottom: 24,
            }}>
              {sortedCities.map(city => {
                const isVisited = citySet.includes(city)
                return (
                  <button
                    key={city}
                    onClick={() => !isVisited && onCityUnlock(iso, city)}
                    style={{
                      fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
                      color: isVisited ? 'white' : 'var(--color-ink-3)',
                      background: isVisited ? contColor : 'var(--color-surface-2)',
                      border: isVisited ? 'none' : `1.5px solid var(--color-border)`,
                      borderRadius: 'var(--radius-full)',
                      padding: '10px 14px', height: 44,
                      cursor: isVisited ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6,
                      transition: 'all var(--duration-fast)', textAlign: 'left',
                      boxShadow: isVisited ? `0 2px 8px ${contColor}4D` : 'none',
                    }}
                  >
                    {isVisited && <span style={{ fontSize: 12 }}>✓</span>}
                    {city}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {cities.length === 0 && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink-3)', textAlign: 'center', padding: '12px 0' }}>
            City tracking coming soon for this country!
          </p>
        )}

        {/* Notes section */}
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
          {!editingNote && !noteText ? (
            <button
              onClick={() => setEditingNote(true)}
              style={{
                fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500,
                color: 'var(--color-brand)', background: 'none', border: 'none',
                cursor: 'pointer', padding: 0,
              }}
            >
              + Add a memory
            </button>
          ) : !editingNote && noteText ? (
            <div onClick={() => setEditingNote(true)} style={{ cursor: 'pointer' }}>
              <p style={{
                fontFamily: 'var(--font-display)', fontStyle: 'italic',
                fontSize: 15, color: 'var(--color-ink-2)', lineHeight: 1.5,
              }}>
                {noteText}
              </p>
            </div>
          ) : (
            <>
              <textarea
                autoFocus
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Write a memory, tip, or favorite moment..."
                style={{
                  width: '100%', minHeight: 80, padding: '12px 14px',
                  fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink)',
                  background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)', resize: 'vertical',
                  lineHeight: 1.5, outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={handleNoteSave} style={{
                  padding: '10px 20px', borderRadius: 'var(--radius-md)',
                  border: 'none', background: 'var(--color-brand)',
                  fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
                  color: 'white', cursor: 'pointer',
                }}>
                  {noteSaved ? 'Saved ✓' : 'Save'}
                </button>
                <button onClick={() => setEditingNote(false)} style={{
                  padding: '10px 16px', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                  fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
                  color: 'var(--color-ink-3)', cursor: 'pointer',
                }}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}
