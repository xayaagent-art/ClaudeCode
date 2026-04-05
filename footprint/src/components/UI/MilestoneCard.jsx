import { motion, AnimatePresence } from 'framer-motion'
import PillButton from './PillButton'

const confettiColors = ['oklch(52% 0.18 0)', 'oklch(52% 0.12 180)', 'oklch(62% 0.15 50)', 'oklch(58% 0.16 40)', 'oklch(52% 0.12 240)', 'oklch(62% 0.22 25)']

export default function MilestoneCard({ data, onDismiss }) {
  if (!data) return null

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDismiss}
          style={{
            position: 'fixed', inset: 0, zIndex: 250,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'oklch(0% 0 0 / 0.35)',
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            cursor: 'pointer',
          }}
        >
          {Array.from({ length: 36 }).map((_, i) => {
            const size = 6 + Math.random() * 8
            return (
              <motion.div
                key={i}
                initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                animate={{
                  x: (Math.random() - 0.5) * 500,
                  y: -200 + Math.random() * 600,
                  opacity: 0, rotate: Math.random() * 720,
                }}
                transition={{ duration: 2 + Math.random(), delay: Math.random() * 0.4, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  position: 'absolute', width: size,
                  height: Math.random() > 0.5 ? size : size * 1.5,
                  borderRadius: Math.random() > 0.5 ? '50%' : 2,
                  background: confettiColors[i % confettiColors.length],
                }}
              />
            )
          })}

          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 8, padding: '44px 52px',
              background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)',
              textAlign: 'center',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            <motion.div
              animate={{ rotate: [0, -12, 12, -6, 6, 0] }}
              transition={{ duration: 0.6, delay: 0.3 }}
              style={{ fontSize: 72, lineHeight: 1 }}
            >
              {data.rank.emoji}
            </motion.div>

            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 700,
              color: 'var(--color-ink)', margin: '4px 0 0',
            }}>
              {data.rankUp ? data.rank.name : 'Milestone!'}
            </h2>

            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--color-ink-3)',
            }}>
              {data.rankUp ? 'New rank unlocked!' : `${data.count} countries and counting`}
            </p>

            <PillButton variant="primary" onClick={onDismiss} style={{ marginTop: 16, padding: '0 28px' }}>
              Keep exploring
            </PillButton>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
