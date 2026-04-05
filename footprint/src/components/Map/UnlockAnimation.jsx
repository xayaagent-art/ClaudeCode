import { motion, AnimatePresence } from 'framer-motion'
import { isoToFlag, CONTINENT_TOTALS } from '../../data/countryMeta'
import { getIllustration } from '../../data/countryIllustrations'
import { getContinentColor } from '../../data/continentColors'
import ContinentBadge from '../UI/ContinentBadge'
import ProgressRing from '../UI/ProgressRing'
import PillButton from '../UI/PillButton'

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
            background: 'oklch(0% 0 0 / 0.35)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            padding: 16,
          }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 380,
              background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-xl)',
              position: 'relative',
            }}
          >
            {/* Close button */}
            <button
              onClick={onDismiss}
              style={{
                position: 'absolute', top: 12, right: 12, zIndex: 10,
                width: 32, height: 32, borderRadius: '50%',
                background: 'oklch(0% 0 0 / 0.05)', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: 16, color: 'var(--color-ink-3)',
              }}
            >
              ✕
            </button>

            {/* Illustration zone */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              style={{
                margin: '16px 16px 0', height: 180, borderRadius: 'var(--radius-lg)',
                background: '#FDFAF6', border: '1px solid var(--color-border)',
                position: 'relative', overflow: 'hidden',
              }}
            >
              <FloatingEmoji emoji={mainEmoji} size={72} x="50%" y="48%" delay={0.2} />
              {smallEmojis.map((e, i) => {
                const positions = [
                  { x: '18%', y: '28%' }, { x: '82%', y: '24%' },
                  { x: '22%', y: '74%' }, { x: '80%', y: '72%' },
                ]
                const p = positions[i]
                return <FloatingEmoji key={i} emoji={e} size={32} x={p.x} y={p.y} delay={0.3 + i * 0.08} />
              })}
            </motion.div>

            {/* Flag + Name + Badge */}
            <div style={{ padding: '20px 28px 0', textAlign: 'center' }}>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.25 }}
                style={{ fontSize: 48, lineHeight: 1, marginBottom: 6 }}
              >
                {isoToFlag(iso)}
              </motion.div>
              <motion.h1
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                style={{
                  fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 700,
                  color: 'var(--color-ink)', margin: 0, lineHeight: 1.1,
                }}
              >
                {name}
              </motion.h1>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}
              >
                <ContinentBadge continent={continent} />
              </motion.div>
            </div>

            {/* AI description */}
            {aiDescription && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                style={{
                  fontFamily: 'var(--font-display)', fontStyle: 'italic',
                  fontSize: 16, color: 'var(--color-ink-2)', textAlign: 'center',
                  lineHeight: 1.5, maxWidth: 320, margin: '14px auto 0',
                  padding: '0 20px',
                }}
              >
                &ldquo;{aiDescription}&rdquo;
              </motion.p>
            )}

            {/* Continent progress with ring */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
              style={{
                padding: '16px 28px 0',
                display: 'flex', alignItems: 'center', gap: 14,
              }}
            >
              <ProgressRing current={continentVisited} total={contTotal} color={contColor} size={56} />
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink-2)' }}>
                <strong style={{ color: 'var(--color-ink)' }}>{continentVisited}</strong> of {contTotal} countries in {continent}
              </div>
            </motion.div>

            {/* Action buttons */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.65 }}
              style={{ display: 'flex', gap: 10, padding: '20px 28px 28px' }}
            >
              <PillButton
                variant="primary"
                onClick={(e) => { e.stopPropagation(); onExploreCities?.() }}
                style={{ flex: 1, height: 48 }}
              >
                Explore cities →
              </PillButton>
              <PillButton
                variant="secondary"
                onClick={onDismiss}
                style={{ flex: 1, height: 48 }}
              >
                Done ✓
              </PillButton>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
