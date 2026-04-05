import { motion } from 'framer-motion'
import PillButton from './PillButton'

export default function BottomActions({ onAddPlace, onShare }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      padding: '12px 16px',
      paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
      pointerEvents: 'none',
    }}>
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26, delay: 0.2 }}
        style={{ width: 'min(360px, 100%)', pointerEvents: 'auto' }}
      >
        <PillButton variant="primary" onClick={onAddPlace} style={{ width: '100%' }}>
          ＋ Add a place
        </PillButton>
      </motion.div>

      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26, delay: 0.35 }}
        style={{ width: 'min(360px, 100%)', pointerEvents: 'auto' }}
      >
        <PillButton variant="secondary" onClick={onShare} style={{ width: '100%' }}>
          Share my Footprint →
        </PillButton>
      </motion.div>
    </div>
  )
}
