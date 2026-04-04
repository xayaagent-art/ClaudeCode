import { motion, AnimatePresence } from 'framer-motion'
import { isoToFlag, CONTINENT_TOTALS } from '../../data/countryMeta'
import { getIllustration } from '../../data/countryIllustrations'

function EmojiCollage({ emojis }) {
  const positions = [
    { left: '50%', top: '45%', size: 64, delay: 0.2, rotate: 0 },
    { left: '20%', top: '25%', size: 44, delay: 0.3, rotate: -12 },
    { left: '75%', top: '20%', size: 40, delay: 0.35, rotate: 10 },
    { left: '30%', top: '70%', size: 42, delay: 0.4, rotate: -8 },
    { left: '70%', top: '65%', size: 46, delay: 0.45, rotate: 15 },
    { left: '15%', top: '50%', size: 38, delay: 0.5, rotate: -14 },
  ]

  return emojis.slice(0, 6).map((emoji, i) => {
    const p = positions[i]
    return (
      <motion.span
        key={i}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, y: [0, -4, 0] }}
        transition={{
          scale: { type: 'spring', stiffness: 400, damping: 18, delay: p.delay },
          opacity: { duration: 0.3, delay: p.delay },
          y: { duration: 3, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 },
        }}
        style={{
          position: 'absolute',
          left: p.left, top: p.top,
          transform: `translate(-50%, -50%) rotate(${p.rotate}deg)`,
          fontSize: p.size,
          lineHeight: 1,
          filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.15))',
          zIndex: i === 0 ? 2 : 1,
        }}
      >
        {emoji}
      </motion.span>
    )
  })
}

export default function CelebrationOverlay({ data, onDismiss, onShare, onExploreCities }) {
  if (!data) return null
  const { iso, name, continent, continentVisited, aiDescription } = data
  const contTotal = CONTINENT_TOTALS[continent] || 1
  const pct = Math.round((continentVisited / contTotal) * 100)
  const illustration = getIllustration(iso, continent)
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onDismiss}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            background: 'rgba(26,18,8,0.3)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          {/* Card */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 420,
              borderRadius: '28px 28px 0 0',
              overflow: 'hidden',
              boxShadow: '0 -8px 40px rgba(26,18,8,0.15)',
            }}
          >
            {/* TOP HALF — Illustration zone */}
            <div style={{
              position: 'relative', height: 200,
              background: illustration.gradient,
              overflow: 'hidden',
            }}>
              {/* Subtle overlay for readability */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.15) 0%, transparent 70%)',
              }} />
              <EmojiCollage emojis={illustration.emojis} />
              {/* Unlocked badge */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22, delay: 0.5 }}
                style={{
                  position: 'absolute', bottom: 12, right: 16,
                  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700,
                  color: 'white', background: 'rgba(0,0,0,0.3)',
                  backdropFilter: 'blur(8px)',
                  padding: '5px 14px', borderRadius: 20,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}
              >
                ✨ Unlocked
              </motion.div>
            </div>

            {/* BOTTOM HALF — Info zone */}
            <div style={{
              background: 'var(--cream)',
              padding: '24px 28px 32px',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 6,
            }}>
              {/* Flag + Name */}
              <motion.div
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.25, duration: 0.4 }}
                style={{ textAlign: 'center' }}
              >
                <div style={{ fontSize: 32, lineHeight: 1, marginBottom: 6 }}>
                  {isoToFlag(iso)}
                </div>
                <h1 style={{
                  fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700,
                  color: 'var(--ink)', margin: 0, lineHeight: 1.1,
                }}>
                  {name}
                </h1>
              </motion.div>

              {/* Region + date */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35 }}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 14,
                  color: 'var(--muted)', margin: 0,
                }}
              >
                {continent} · First visited {dateStr}
              </motion.p>

              {/* AI description */}
              {aiDescription && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  style={{
                    fontFamily: 'var(--font-display)', fontStyle: 'italic',
                    fontSize: 15, color: 'var(--muted)', textAlign: 'center',
                    lineHeight: 1.5, maxWidth: 300, margin: '4px 0',
                  }}
                >
                  &ldquo;{aiDescription}&rdquo;
                </motion.p>
              )}

              {/* Continent progress */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
                style={{ width: '100%', maxWidth: 280, marginTop: 6 }}
              >
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--muted)', marginBottom: 6,
                }}>
                  <span>{continent}</span>
                  <span>{continentVisited}/{contTotal}</span>
                </div>
                <div style={{
                  width: '100%', height: 6, borderRadius: 3,
                  background: 'var(--sand)', overflow: 'hidden',
                }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    style={{
                      height: '100%', borderRadius: 3,
                      background: 'linear-gradient(90deg, var(--terracotta), var(--terracotta-light))',
                    }}
                  />
                </div>
              </motion.div>

              {/* Action buttons */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                style={{ display: 'flex', gap: 10, marginTop: 14, width: '100%', maxWidth: 280 }}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); onExploreCities?.() }}
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: 14,
                    border: 'none', background: 'var(--forest)',
                    fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                    color: 'white', cursor: 'pointer',
                  }}
                >
                  Explore cities →
                </button>
                <button
                  onClick={onDismiss}
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: 14,
                    border: '1px solid var(--sand)', background: 'white',
                    fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                    color: 'var(--ink)', cursor: 'pointer',
                  }}
                >
                  Done ✓
                </button>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
