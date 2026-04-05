const CONTINENT_CSS_VARS = {
  'Europe': '--color-europe',
  'Asia': '--color-asia',
  'North America': '--color-americas',
  'South America': '--color-americas',
  'Africa': '--color-africa',
  'Oceania': '--color-oceania',
  'Antarctica': '--color-antarctica',
}

const SHORT_NAMES = {
  'North America': 'N. America',
  'South America': 'S. America',
}

export default function ContinentBadge({ continent, size = 'sm' }) {
  const cssVar = CONTINENT_CSS_VARS[continent] || '--color-ink-3'

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontFamily: 'var(--font-body)',
      fontSize: size === 'sm' ? 12 : 11,
      fontWeight: 500,
      color: `var(${cssVar})`,
      background: `color-mix(in oklch, var(${cssVar}) 10%, transparent)`,
      borderRadius: 'var(--radius-full)',
      padding: '3px 8px',
      lineHeight: 1.3,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: `var(${cssVar})`,
        flexShrink: 0,
      }} />
      {SHORT_NAMES[continent] || continent}
    </span>
  )
}
