import { motion, AnimatePresence } from 'framer-motion'
import ParticleBurst from '../Particles/ParticleBurst'

export default function UnlockAnimation({ x, y, active }) {
  return (
    <AnimatePresence>
      {active && (
        <>
          {/* Radial gold glow */}
          <motion.div
            initial={{ scale: 0, opacity: 0.6 }}
            animate={{ scale: 3, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.8,
              delay: 0.4,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: 80,
              height: 80,
              marginLeft: -40,
              marginTop: -40,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(232, 201, 122, 0.5) 0%, rgba(201, 168, 76, 0.2) 40%, transparent 70%)',
              pointerEvents: 'none',
              zIndex: 40,
            }}
          />
          {/* Particle burst */}
          <ParticleBurst x={x} y={y} active={active} />
        </>
      )}
    </AnimatePresence>
  )
}
