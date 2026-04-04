import { motion, AnimatePresence } from 'framer-motion'
import { isoToFlag, CONTINENT_TOTALS } from '../../data/countryMeta'
import { getIllustration } from '../../data/countryIllustrations'
import { getContinentColor } from '../../data/continentColors'

function FloatingEmoji({ emoji, size, x, y, delay }) {
  return (
    <motion.span
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1, y: [0, -4, 0] }}
      transition={{
        scale: { type: 'spring', stiffness: 400, damping: 18, delay },
        opacity: { duration: 0.3, delay },
        y: { duration: 3, repeat: Infinity, ease: 'easeInOut', delay: delay * 2 },
      }}
      style={{
        position: 'absolute', left: x, top: y,
        transform: 'translate(-50%, -50%)',
        fontSize: size, lineHeight: 1,
        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.1))',
      }}
    >
      {emoji}
    </motion.span>
  )
}

export default function CelebrationOverlay({ data, onDismiss, onShare, onExploreCities }) {
  if (!data) return null
  const { iso, name, continent, continentVisited, aiDescription } = data
  const contTotal = CONTINENT_TOTALS[continent] || 1
  const pct = Math.round((continentVisited / contTotal) * 100)
  const illustration = getIllustration(iso, continent)
  const contColor = getContinentColor(continent)

  const emojis = illustration.emojis || []
  const mainEmoji = emojis[0] || '🌍'
  const smallEmojis = emojis.slice(1, 5)

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onDismiss}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.35)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            padding: 16,
          }}
        >
          <motion.div
            initial={{ scale: 0.9, y: 40, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 420,
              background: 'white', borderRadius: 24,
              overflow: 'hidden',
              boxShadow: '0 24px 80px rgba(0,0,0,0.2)',
              position: 'relative',
            }}
          >
            {/* Close button */}
            <button
              onClick={onDismiss}
              style={{
                position: 'absolute', top: 12, right: 12, zIndex: 10,
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(0,0,0,0.05)', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: 16, color: '#717171',
              }}
            >
              ✕
            </button>

            {/* Header: flag + name + continent pill */}
            <div style={{ padding: '28px 28px 16px', textAlign: 'center' }}>
              <motion.div
                initial={{ scale: 0, rotate: -15 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.1 }}
                style={{ fontSize: 80, lineHeight: 1, marginBottom: 8 }}
              >
                {isoToFlag(iso)}
              </motion.div>
              <motion.h1
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.4 }}
                style={{
                  fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 700,
                  color: '#222', margin: 0, lineHeight: 1.1,
                }}
              >
                {name}
              </motion.h1>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                style={{ marginTop: 8 }}
              >
                <span style={{
                  display: 'inline-block',
                  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
                  color: contColor, background: `${contColor}15`,
                  borderRadius: 100, padding: '4px 14px',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  {continent}
                </span>
              </motion.div>
            </div>

            {/* Illustration zone */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
              style={{
                margin: '0 20px', height: 180, borderRadius: 16,
                background: 'white', border: '1px solid #EBEBEB',
                position: 'relative', overflow: 'hidden',
              }}
            >
              {/* Main centered emoji */}
              <FloatingEmoji emoji={mainEmoji} size={80} x="50%" y="50%" delay={0.3} />
              {/* Smaller floating emojis */}
              {smallEmojis.map((e, i) => {
                const positions = [
                  { x: '20%', y: '30%' }, { x: '80%', y: '25%' },
                  { x: '25%', y: '72%' }, { x: '78%', y: '70%' },
                ]
                const p = positions[i]
                return <FloatingEmoji key={i} emoji={e} size={36} x={p.x} y={p.y} delay={0.4 + i * 0.08} />
              })}
            </motion.div>

            {/* AI description */}
            {aiDescription && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                style={{
                  fontFamily: 'var(--font-display)', fontStyle: 'italic',
                  fontSize: 16, color: '#717171', textAlign: 'center',
                  lineHeight: 1.5, maxWidth: 320, margin: '16px auto 0',
                  padding: '0 20px',
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
              style={{ padding: '16px 28px 0' }}
            >
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontFamily: 'var(--font-body)', fontSize: 13, color: '#717171', marginBottom: 6,
              }}>
                <span>{continent}</span>
                <span style={{ fontWeight: 600 }}>{continentVisited}/{contTotal}</span>
              </div>
              <div style={{
                width: '100%', height: 6, borderRadius: 3,
                background: '#F7F7F7', overflow: 'hidden',
              }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, delay: 0.65, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    height: '100%', borderRadius: 3,
                    background: contColor,
                  }}
                />
              </div>
            </motion.div>

            {/* Action buttons */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.75 }}
              style={{ display: 'flex', gap: 10, padding: '20px 28px 28px' }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); onExploreCities?.() }}
                style={{
                  flex: 1, padding: '14px 16px', borderRadius: 16,
                  border: 'none', background: 'var(--rausch)',
                  fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600,
                  color: 'white', cursor: 'pointer',
                }}
              >
                Explore cities →
              </button>
              <button
                onClick={onDismiss}
                style={{
                  flex: 1, padding: '14px 16px', borderRadius: 16,
                  border: '1.5px solid #EBEBEB', background: 'white',
                  fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600,
                  color: '#222', cursor: 'pointer',
                }}
              >
                Done ✓
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
