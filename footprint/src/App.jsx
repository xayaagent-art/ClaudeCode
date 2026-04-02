import { useState, useCallback, useRef, useEffect } from 'react'
import MapCanvas from './components/Map/MapCanvas'
import CelebrationOverlay from './components/Map/UnlockAnimation'
import ParticleBurst from './components/Particles/ParticleBurst'
import StatsBar from './components/UI/StatsBar'
import SearchPanel from './components/UI/SearchPanel'
import ShareButton from './components/UI/ShareButton'
import Toast from './components/UI/Toast'
import Onboarding from './components/UI/Onboarding'
import MilestoneCard from './components/UI/MilestoneCard'
import { useFootprint } from './hooks/useFootprint'
import { captureScreenshot } from './lib/share'
import { COUNTRY_LIST } from './data/countryList'
import { getContinentBreakdown, CONTINENT_TOTALS } from './data/countryMeta'

export default function App() {
  const {
    unlocked,
    isUnlocked,
    unlock,
    getInfo,
    countryCount,
    continentCount,
    percentage,
    continentBreakdown,
    rank,
    nextRank,
    countriesUntilNextRank,
  } = useFootprint()

  const mapRef = useRef(null)
  const [toast, setToast] = useState({ visible: false, message: '' })
  const [celebration, setCelebration] = useState(null)
  const [particles, setParticles] = useState(null)
  const [milestone, setMilestone] = useState(null)
  const [showOnboarding, setShowOnboarding] = useState(countryCount === 0)

  // Dismiss onboarding on escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        setCelebration(null)
        setMilestone(null)
        setShowOnboarding(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const showToast = useCallback((msg) => {
    setToast({ visible: true, message: msg })
    setTimeout(() => setToast({ visible: false, message: '' }), 3000)
  }, [])

  const handleUnlock = useCallback((iso, name, screenPos) => {
    setShowOnboarding(false)

    const result = unlock(iso, name)
    if (!result.isNew) return

    // Haptic feedback on mobile
    if (navigator.vibrate) navigator.vibrate(200)

    // Particles at screen position
    if (screenPos) {
      setParticles({ x: screenPos.x, y: screenPos.y, active: true })
      setTimeout(() => setParticles(null), 2000)
    }

    // Calculate continent percentage for this unlock
    const breakdown = getContinentBreakdown([...Object.keys(unlocked), iso])
    const contTotal = CONTINENT_TOTALS[result.continent] || 1
    const contVisited = breakdown[result.continent] || 0
    const contPct = Math.round((contVisited / contTotal) * 100)

    // Show celebration overlay after fly animation
    setTimeout(() => {
      setCelebration({
        iso,
        name,
        continent: result.continent,
        continentPercentage: contPct,
      })
    }, 600)

    // Auto-dismiss celebration
    setTimeout(() => {
      setCelebration(prev => {
        // Only dismiss if it's still showing this country
        if (prev?.iso === iso) return null
        return prev
      })
    }, 4600)

    // Check for milestone/rank-up (show after celebration)
    if (result.rankUp || result.isMilestone) {
      const newCount = Object.keys(unlocked).length + 1
      setTimeout(() => {
        setMilestone({
          rankUp: result.rankUp,
          rank: result.newRank,
          count: newCount,
        })
      }, result.rankUp ? 5000 : 4800)

      setTimeout(() => setMilestone(null), 8000)
    }
  }, [unlock, unlocked])

  const handleCountryInfo = useCallback((iso, name) => {
    const info = getInfo(iso)
    if (info) {
      const dateStr = new Date(info.date).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
      showToast(`${name} · ${info.continent} · visited ${dateStr}`)
    }
  }, [getInfo, showToast])

  const handleSearch = useCallback((country) => {
    if (!isUnlocked(country.iso)) {
      handleUnlock(country.iso, country.name, null)
    } else {
      handleCountryInfo(country.iso, country.name)
    }
  }, [isUnlocked, handleUnlock, handleCountryInfo])

  const handleShare = useCallback(() => {
    captureScreenshot(mapRef, countryCount, continentCount, percentage, Object.keys(unlocked))
  }, [countryCount, continentCount, percentage, unlocked])

  return (
    <>
      <MapCanvas
        unlocked={unlocked}
        isUnlocked={isUnlocked}
        onUnlock={handleUnlock}
        onCountryInfo={handleCountryInfo}
        mapRef={mapRef}
      />

      {/* Wordmark */}
      <div style={{
        position: 'fixed', top: 18, left: 20, zIndex: 60,
        fontFamily: "'Cormorant Garamond', serif",
        fontStyle: 'italic',
        fontSize: 24, fontWeight: 400,
        color: 'var(--text-primary)',
        letterSpacing: '0.2em',
        userSelect: 'none',
        opacity: 0.9,
      }}>
        footprint
      </div>

      <StatsBar
        countryCount={countryCount}
        continentCount={continentCount}
        percentage={percentage}
        rank={rank}
        nextRank={nextRank}
        countriesUntilNextRank={countriesUntilNextRank}
        continentBreakdown={continentBreakdown}
      />

      <SearchPanel
        countries={COUNTRY_LIST}
        isUnlocked={isUnlocked}
        onSelect={handleSearch}
      />

      <ShareButton onClick={handleShare} />

      {/* Particle burst */}
      {particles && (
        <ParticleBurst x={particles.x} y={particles.y} active={particles.active} />
      )}

      {/* Celebration overlay */}
      <CelebrationOverlay
        data={celebration}
        onDismiss={() => setCelebration(null)}
      />

      {/* Milestone card */}
      <MilestoneCard
        data={milestone}
        onDismiss={() => setMilestone(null)}
      />

      {/* Onboarding */}
      <Onboarding
        visible={showOnboarding}
        onDismiss={() => setShowOnboarding(false)}
      />

      <Toast message={toast.message} visible={toast.visible} />
    </>
  )
}
