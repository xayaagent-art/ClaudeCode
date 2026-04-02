import { motion, AnimatePresence } from 'framer-motion'
import { useMemo } from 'react'

export default function ParticleBurst({ x, y, active }) {
  const particles = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 20 + (Math.random() - 0.5) * 0.4
      const distance = 50 + Math.random() * 100
      const size = 3 + Math.random() * 4
      return {
        id: i,
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance,
        size,
        delay: Math.random() * 0.15,
      }
    })
  }, [active])

  return (
    <AnimatePresence>
      {active && (
        <div style={{
          position: 'fixed', left: x, top: y,
          pointerEvents: 'none', zIndex: 150,
        }}>
          {particles.map(p => (
            <motion.div
              key={p.id}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: p.dx, y: p.dy, opacity: 0, scale: 0.2 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1, delay: p.delay, ease: [0.16, 1, 0.3, 1] }}
              style={{
                position: 'absolute',
                width: p.size, height: p.size,
                borderRadius: '50%',
                background: 'radial-gradient(circle, #E8C97A, #C9A84C)',
                boxShadow: '0 0 8px 3px rgba(201,168,76,0.4)',
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  )
}
