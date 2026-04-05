import { useEffect, useRef } from 'react'

export default function ProgressRing({ current, total, color, size = 64 }) {
  const stroke = 5
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const pct = total > 0 ? current / total : 0
  const offset = circumference * (1 - pct)
  const circleRef = useRef(null)

  useEffect(() => {
    const el = circleRef.current
    if (!el) return
    el.style.strokeDashoffset = circumference
    requestAnimationFrame(() => {
      el.style.transition = 'stroke-dashoffset 600ms cubic-bezier(0.16, 1, 0.3, 1)'
      el.style.strokeDashoffset = offset
    })
  }, [current, total, circumference, offset])

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="oklch(90% 0.005 60)"
          strokeWidth={stroke}
        />
        <circle
          ref={circleRef}
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-display)',
        fontSize: 13, fontWeight: 700,
        color: 'var(--color-ink)',
      }}>
        {current}/{total}
      </div>
    </div>
  )
}
