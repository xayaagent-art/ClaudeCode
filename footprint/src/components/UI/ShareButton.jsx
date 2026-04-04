import { motion } from 'framer-motion'

export default function BottomActions({ onAddPlace, onShare }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
      paddingLeft: 20, paddingRight: 20,
      pointerEvents: 'none',
    }}>
      <motion.button
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26, delay: 0.2 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={onAddPlace}
        style={{
          pointerEvents: 'auto',
          width: 'min(360px, 100%)',
          height: 56, borderRadius: 16,
          fontFamily: 'var(--font-body)', fontSize: 17, fontWeight: 600,
          color: 'white', background: 'var(--rausch)',
          border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 24px rgba(255,90,95,0.35)',
        }}
      >
        ＋ Add a place
      </motion.button>

      <motion.button
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26, delay: 0.35 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={onShare}
        style={{
          pointerEvents: 'auto',
          width: 'min(360px, 100%)',
          height: 48, borderRadius: 16,
          fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500,
          color: '#222', background: 'white',
          border: '1.5px solid #EBEBEB', cursor: 'pointer',
        }}
      >
        Share my Footprint →
      </motion.button>
    </div>
  )
}
