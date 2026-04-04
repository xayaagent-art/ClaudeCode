import { motion, AnimatePresence } from 'framer-motion'

export default function Onboarding({ visible, onDismiss }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          onClick={onDismiss}
          style={{
            position: 'fixed', inset: 0, zIndex: 80,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'auto', cursor: 'pointer',
          }}
        >
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -16, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28, delay: 0.6 }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 10, padding: '36px 44px',
              background: 'white',
              border: '1px solid #EBEBEB',
              borderRadius: 24,
              textAlign: 'center', maxWidth: 340,
              boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
            }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
              style={{ fontSize: 64, lineHeight: 1 }}
            >
              🌍
            </motion.div>

            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600,
              color: '#222', lineHeight: 1.2, margin: 0,
            }}>
              Where have you been?
            </h2>

            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 16,
              color: '#717171', lineHeight: 1.5,
            }}>
              Tap any country to unlock it
            </p>

            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 2, delay: i * 0.3, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: 'var(--rausch)',
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
