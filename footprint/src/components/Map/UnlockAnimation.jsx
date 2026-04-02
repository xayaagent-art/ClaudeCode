import { motion, AnimatePresence } from 'framer-motion'
import { isoToFlag } from '../../data/countryMeta'
import { CONTINENT_TOTALS, getContinentBreakdown } from '../../data/countryMeta'

export default function CelebrationOverlay({ data, onDismiss }) {
  if (!data) return null

  const { iso, name, continent, continentPercentage } = data

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={onDismiss}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          {/* Gold vignette pulse at edges */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.4, 0] }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            style={{
              position: 'absolute', inset: 0,
              boxShadow: 'inset 0 0 120px 60px rgba(201,168,76,0.15)',
              pointerEvents: 'none',
            }}
          />

          <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28, delay: 0.1 }}
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 8, padding: '40px 48px', maxWidth: 360,
              textAlign: 'center',
            }}
          >
            {/* Flag */}
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.2 }}
              style={{ fontSize: 80, lineHeight: 1 }}
            >
              {isoToFlag(iso)}
            </motion.div>

            {/* Country name */}
            <motion.h1
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.35, duration: 0.5 }}
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 48, fontWeight: 700,
                color: '#F5ECD7',
                margin: '8px 0 0',
                lineHeight: 1.1,
              }}
            >
              {name}
            </motion.h1>

            {/* Continent */}
            <motion.p
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.45, duration: 0.4 }}
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 16, color: 'rgba(245,236,215,0.5)',
                marginBottom: 8,
              }}
            >
              {continent}
            </motion.p>

            {/* Unlocked badge */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25, delay: 0.5 }}
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14, fontWeight: 600,
                color: '#0A0A0F',
                background: 'linear-gradient(135deg, #C9A84C, #E8C97A, #C9A84C)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 2s ease-in-out infinite',
                padding: '6px 20px',
                borderRadius: 20,
                letterSpacing: '0.05em',
              }}
            >
              Unlocked!
            </motion.div>

            {/* Continent stat */}
            {continentPercentage > 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7, duration: 0.4 }}
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13, color: 'rgba(245,236,215,0.4)',
                  marginTop: 12,
                }}
              >
                You've now visited {continentPercentage}% of {continent}
              </motion.p>
            )}

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1, duration: 0.4 }}
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11, color: 'rgba(245,236,215,0.25)',
                marginTop: 16,
              }}
            >
              tap anywhere to continue
            </motion.p>
          </motion.div>

          <style>{`
            @keyframes shimmer {
              0% { background-position: 200% 0; }
              100% { background-position: -200% 0; }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
