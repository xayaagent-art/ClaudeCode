import { motion, AnimatePresence } from 'framer-motion'
import { isoToFlag, CONTINENT_TOTALS } from '../../data/countryMeta'

const confettiColors = ['#D4A843', '#E8603A', '#2D5016', '#C8E6F5', '#F0C866', '#8B6914']
const confettiShapes = ['circle', 'rect', 'circle', 'rect']

export default function CelebrationOverlay({ data, onDismiss, onShare }) {
  if (!data) return null
  const { iso, name, continent, continentVisited, aiDescription } = data
  const contTotal = CONTINENT_TOTALS[continent] || 1
  const pct = Math.round((continentVisited / contTotal) * 100)

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
          {/* Confetti burst */}
          {Array.from({ length: 24 }).map((_, i) => {
            const shape = confettiShapes[i % confettiShapes.length]
            const size = 6 + Math.random() * 6
            return (
              <motion.div
                key={i}
                initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
                animate={{
                  x: (Math.random() - 0.5) * 320,
                  y: -120 - Math.random() * 200,
                  opacity: 0,
                  rotate: 360 * (Math.random() > 0.5 ? 1 : -1),
                  scale: 0.4,
                }}
                transition={{ duration: 1.5 + Math.random() * 0.8, delay: Math.random() * 0.3, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  position: 'absolute', bottom: '45%', left: '50%',
                  width: size, height: shape === 'rect' ? size * 1.5 : size,
                  borderRadius: shape === 'circle' ? '50%' : 2,
                  background: confettiColors[i % confettiColors.length],
                  pointerEvents: 'none',
                }}
              />
            )
          })}

          {/* Card */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 420,
              background: 'var(--cream)',
              borderRadius: '28px 28px 0 0',
              padding: '32px 28px 36px',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 4,
              boxShadow: '0 -8px 40px rgba(26,18,8,0.15)',
            }}
          >
            {/* Flag */}
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.15 }}
              style={{ fontSize: 72, lineHeight: 1, marginBottom: 4 }}
            >
              {isoToFlag(iso)}
            </motion.div>

            {/* Country name */}
            <motion.h1
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.25, duration: 0.4 }}
              style={{
                fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 700,
                color: 'var(--ink)', margin: 0, lineHeight: 1.1, textAlign: 'center',
              }}
            >
              {name}
            </motion.h1>

            {/* Continent */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
              style={{
                fontFamily: 'var(--font-body)', fontSize: 15,
                color: 'var(--muted)', marginBottom: 10,
              }}
            >
              {continent}
            </motion.p>

            {/* Unlocked badge */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22, delay: 0.4 }}
              style={{
                fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700,
                color: 'var(--ink)',
                background: 'linear-gradient(135deg, #D4A843, #F0C866, #D4A843)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 2.5s ease-in-out infinite',
                padding: '6px 22px', borderRadius: 20,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                marginBottom: 14,
              }}
            >
              ✨ Unlocked
            </motion.div>

            {/* AI description */}
            {aiDescription && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                style={{
                  fontFamily: 'var(--font-display)', fontStyle: 'italic',
                  fontSize: 16, color: 'var(--muted)', textAlign: 'center',
                  lineHeight: 1.5, maxWidth: 320, marginBottom: 8,
                }}
              >
                "{aiDescription}"
              </motion.p>
            )}

            {/* Continent progress */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
              style={{ width: '100%', maxWidth: 280, marginTop: 4 }}
            >
              <div style={{
                fontFamily: 'var(--font-body)', fontSize: 12,
                color: 'var(--muted)', textAlign: 'center', marginBottom: 6,
              }}>
                You've explored {continentVisited} of {contTotal} countries in {continent}
              </div>
              <div style={{
                width: '100%', height: 6, borderRadius: 3,
                background: 'var(--sand)',
                overflow: 'hidden',
              }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    height: '100%', borderRadius: 3,
                    background: 'linear-gradient(90deg, #D4A843, #F0C866)',
                  }}
                />
              </div>
            </motion.div>

            {/* Action buttons */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              style={{ display: 'flex', gap: 10, marginTop: 18, width: '100%', maxWidth: 280 }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); onShare?.() }}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 14,
                  border: '1px solid var(--sand)', background: 'white',
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                  color: 'var(--ink)', cursor: 'pointer',
                }}
              >
                Share this
              </button>
              <button
                onClick={onDismiss}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 14,
                  border: 'none', background: 'var(--gold)',
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                  color: 'var(--ink)', cursor: 'pointer',
                }}
              >
                Done
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
