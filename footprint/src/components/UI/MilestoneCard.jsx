import { motion, AnimatePresence } from 'framer-motion'

const confettiColors = ['#FF5A5F', '#00A699', '#FC642D', '#F5A623', '#4A90D9', '#E8445A']

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
            background: 'rgba(0,0,0,0.35)',
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
              background: 'white', borderRadius: 24,
              textAlign: 'center',
              boxShadow: '0 24px 80px rgba(0,0,0,0.2)',
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
              color: '#222', margin: '4px 0 0',
            }}>
              {data.rankUp ? data.rank.name : 'Milestone!'}
            </h2>

            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 16, color: '#717171',
            }}>
              {data.rankUp ? 'New rank unlocked!' : `${data.count} countries and counting`}
            </p>

            <button
              onClick={onDismiss}
              style={{
                marginTop: 16, fontFamily: 'var(--font-body)',
                fontSize: 15, fontWeight: 600, color: 'white',
                background: 'var(--rausch)', border: 'none',
                borderRadius: 14, padding: '12px 28px', cursor: 'pointer',
              }}
            >
              Keep exploring
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
