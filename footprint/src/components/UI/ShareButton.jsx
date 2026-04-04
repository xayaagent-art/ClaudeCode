import { motion } from 'framer-motion'

export default function BottomActions({ onAddPlace, onShare }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 16px)',
      pointerEvents: 'none',
    }}>
      <motion.button
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26, delay: 0.2 }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        onClick={onAddPlace}
        style={{
          pointerEvents: 'auto',
          fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 700,
          color: 'white', background: 'var(--forest)',
          border: 'none', borderRadius: 40,
          padding: '14px 32px', cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(45,106,79,0.35)',
          letterSpacing: '0.01em',
        }}
      >
        ＋ Add a place
      </motion.button>

      <motion.button
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26, delay: 0.35 }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        onClick={onShare}
        style={{
          pointerEvents: 'auto',
          fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
          color: 'white', background: 'var(--coral)',
          border: 'none', borderRadius: 40,
          padding: '10px 24px', cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(232,96,58,0.25)',
        }}
      >
        Share my Footprint →
      </motion.button>
    </div>
  )
}
