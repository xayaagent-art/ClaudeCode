import { motion, AnimatePresence } from 'framer-motion'

export default function Onboarding({ visible, onDismiss }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          onClick={onDismiss}
          style={{
            position: 'fixed', inset: 0, zIndex: 80,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'auto', cursor: 'pointer',
          }}
        >
          <motion.div
            initial={{ y: 20, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -20, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28, delay: 0.5 }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 12, padding: '36px 44px',
              background: 'rgba(10,10,15,0.7)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 24,
              textAlign: 'center',
              maxWidth: 340,
            }}
          >
            <h2 style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 32, fontWeight: 400,
              color: '#F5ECD7',
              lineHeight: 1.2,
              margin: 0,
            }}>
              your world is waiting
            </h2>

            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 16, color: 'rgba(245,236,215,0.5)',
              lineHeight: 1.5,
            }}>
              tap any country you've visited to unlock it
            </p>

            {/* Pulsing dots */}
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  animate={{
                    scale: [1, 1.6, 1],
                    opacity: [0.4, 1, 0.4],
                  }}
                  transition={{
                    duration: 2,
                    delay: i * 0.4,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  style={{
                    width: 8, height: 8,
                    borderRadius: '50%',
                    background: '#C9A84C',
                    boxShadow: '0 0 8px rgba(201,168,76,0.5)',
                  }}
                />
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
