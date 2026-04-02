import { motion, AnimatePresence } from 'framer-motion'

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
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            cursor: 'pointer',
          }}
        >
          {/* Confetti particles */}
          {Array.from({ length: 30 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{
                x: 0, y: 0, opacity: 1,
                rotate: Math.random() * 360,
              }}
              animate={{
                x: (Math.random() - 0.5) * 400,
                y: -200 + Math.random() * 500,
                opacity: 0,
                rotate: Math.random() * 720,
              }}
              transition={{
                duration: 2 + Math.random(),
                delay: Math.random() * 0.5,
                ease: [0.16, 1, 0.3, 1],
              }}
              style={{
                position: 'absolute',
                width: 6 + Math.random() * 6,
                height: 6 + Math.random() * 6,
                borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                background: ['#C9A84C', '#E8C97A', '#E8854A', '#F5ECD7'][Math.floor(Math.random() * 4)],
              }}
            />
          ))}

          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 8, padding: '40px 48px',
              textAlign: 'center',
            }}
          >
            <motion.div
              animate={{ rotate: [0, -10, 10, -5, 5, 0] }}
              transition={{ duration: 0.6, delay: 0.3 }}
              style={{ fontSize: 64, lineHeight: 1 }}
            >
              {data.rank.emoji}
            </motion.div>

            <h2 style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 36, fontWeight: 700,
              color: '#F5ECD7', margin: '8px 0 0',
            }}>
              {data.rankUp ? `${data.rank.name} rank unlocked!` : 'Milestone reached!'}
            </h2>

            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 16, color: 'rgba(245,236,215,0.5)',
            }}>
              {data.rankUp
                ? `You've earned the ${data.rank.name} title`
                : `${data.count} countries and counting`
              }
            </p>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11, color: 'rgba(245,236,215,0.25)',
                marginTop: 16,
              }}
            >
              tap anywhere to continue
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
