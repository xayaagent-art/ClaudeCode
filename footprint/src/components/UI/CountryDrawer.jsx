import { motion, AnimatePresence } from 'framer-motion'
import { isoToFlag } from '../../data/countryMeta'
import { getCities } from '../../data/cities'

export default function CountryDrawer({ data, unlockedCities, onCityUnlock, onClose }) {
  if (!data) return null

  const { iso, name, continent, date } = data
  const cities = getCities(iso)
  const citySet = unlockedCities[iso] || []
  const unlockCount = citySet.length
  const dateStr = date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 90,
            background: 'rgba(26,18,8,0.2)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 480,
              background: 'var(--cream)',
              borderRadius: '24px 24px 0 0',
              padding: '20px 24px 28px',
              maxHeight: '65dvh', overflow: 'auto',
              boxShadow: '0 -4px 24px var(--shadow)',
            }}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--sand)', margin: '0 auto 16px' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 48 }}>{isoToFlag(iso)}</span>
              <div>
                <h2 style={{
                  fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700,
                  color: 'var(--ink)', margin: 0, lineHeight: 1.1,
                }}>{name}</h2>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                  {continent}{dateStr ? ` · visited ${dateStr}` : ''}
                </p>
              </div>
            </div>

            {cities.length > 0 && (
              <>
                <div style={{
                  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700,
                  color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}>
                  {unlockCount}/{cities.length} cities explored
                </div>

                <div style={{
                  width: '100%', height: 4, borderRadius: 2,
                  background: 'var(--sand)', overflow: 'hidden', marginBottom: 14,
                }}>
                  <div style={{
                    width: `${Math.round((unlockCount / cities.length) * 100)}%`,
                    height: '100%', borderRadius: 2,
                    background: 'var(--gold)', transition: 'width 300ms',
                  }} />
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {cities.map(city => {
                    const isVisited = citySet.includes(city)
                    return (
                      <button
                        key={city}
                        onClick={() => !isVisited && onCityUnlock(iso, city)}
                        style={{
                          fontFamily: 'var(--font-body)', fontSize: 13,
                          fontWeight: isVisited ? 600 : 400,
                          color: isVisited ? 'var(--ink)' : 'var(--muted)',
                          background: isVisited ? 'rgba(212,168,67,0.2)' : 'white',
                          border: `1px solid ${isVisited ? 'var(--gold)' : 'var(--sand)'}`,
                          borderRadius: 20, padding: '7px 14px',
                          cursor: isVisited ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', gap: 5,
                          transition: 'all 150ms', minHeight: 36,
                        }}
                      >
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: isVisited ? 'var(--gold)' : '#ccc',
                        }} />
                        {city}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {cities.length === 0 && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>
                City tracking coming soon for this country!
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
