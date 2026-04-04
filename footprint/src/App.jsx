import { useState, useCallback, useRef, useEffect } from 'react'
import confetti from 'canvas-confetti'
import MapCanvas from './components/Map/MapCanvas'
import CelebrationOverlay from './components/Map/UnlockAnimation'
import ParticleBurst from './components/Particles/ParticleBurst'
import StatsBar from './components/UI/StatsBar'
import SearchPanel from './components/UI/SearchPanel'
import BottomActions from './components/UI/ShareButton'
import Toast from './components/UI/Toast'
import Onboarding from './components/UI/Onboarding'
import MilestoneCard from './components/UI/MilestoneCard'
import CountryDrawer from './components/UI/CountryDrawer'
import SettingsSheet from './components/UI/SettingsSheet'
import { useFootprint } from './hooks/useFootprint'
import { captureScreenshot } from './lib/share'
import { getCountryDescription } from './lib/ai'
import { COUNTRY_LIST } from './data/countryList'

export default function App() {
  const {
    unlocked, isUnlocked, unlock, getInfo,
    unlockedCities, unlockCity,
    notes, saveNote,
    countryCount, continentCount, percentage, totalCityCount,
    continentBreakdown, rank, nextRank, countriesUntilNextRank,
  } = useFootprint()

  const mapRef = useRef(null)
  const [toast, setToast] = useState({ visible: false, message: '' })
  const [celebration, setCelebration] = useState(null)
  const [particles, setParticles] = useState(null)
  const [milestone, setMilestone] = useState(null)
  const [showOnboarding, setShowOnboarding] = useState(countryCount === 0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [countryDrawer, setCountryDrawer] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        setCelebration(null)
        setMilestone(null)
        setShowOnboarding(false)
        setSearchOpen(false)
        setCountryDrawer(null)
        setSettingsOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const showToast = useCallback((msg) => {
    setToast({ visible: true, message: msg })
    setTimeout(() => setToast({ visible: false, message: '' }), 2500)
  }, [])

  const handleUnlock = useCallback(async (iso, name, screenPos) => {
    setShowOnboarding(false)

    const result = unlock(iso, name)
    if (!result.isNew) return

    // Haptic + confetti
    if (navigator.vibrate) navigator.vibrate([80, 40, 80])
    confetti({
      particleCount: 30,
      spread: 60,
      origin: { y: 0.6 },
      colors: ['#FF5A5F', '#00A699', '#FC642D', '#F5A623', '#4A90D9'],
    })

    // Particles at click position
    if (screenPos) {
      setParticles({ x: screenPos.x, y: screenPos.y, active: true })
      setTimeout(() => setParticles(null), 2000)
    }

    // Fetch AI description
    let aiDescription = null
    const descPromise = getCountryDescription(name, iso).then(d => { aiDescription = d })

    // Show celebration
    setTimeout(async () => {
      await descPromise.catch(() => {})
      setCelebration({
        iso, name,
        continent: result.continent,
        continentVisited: result.continentVisited,
        aiDescription,
      })
    }, 500)

    setTimeout(() => {
      setCelebration(prev => prev?.iso === iso ? null : prev)
    }, 6500)

    // Milestone / rank-up
    if (result.rankUp || result.isMilestone) {
      const newCount = Object.keys(unlocked).length + 1
      setTimeout(() => {
        setMilestone({
          rankUp: result.rankUp,
          rank: result.newRank,
          count: newCount,
        })
      }, result.rankUp ? 7000 : 6800)
      setTimeout(() => setMilestone(null), 10000)
    }
  }, [unlock, unlocked])

  const handleCountryTap = useCallback((iso, name) => {
    const info = getInfo(iso)
    if (info) {
      setCountryDrawer({
        iso, name,
        continent: info.continent,
        date: info.date,
      })
    }
  }, [getInfo])

  const handleExploreCities = useCallback(() => {
    if (celebration) {
      const { iso, name, continent } = celebration
      setCelebration(null)
      const info = getInfo(iso)
      setCountryDrawer({ iso, name, continent, date: info?.date })
    }
  }, [celebration, getInfo])

  const handleCityUnlock = useCallback((iso, city) => {
    unlockCity(iso, city)
    showToast(`✨ ${city} unlocked!`)
    if (navigator.vibrate) navigator.vibrate(80)
  }, [unlockCity, showToast])

  const handleSearch = useCallback((country) => {
    setSearchOpen(false)
    if (!isUnlocked(country.iso)) {
      handleUnlock(country.iso, country.name, null)
    } else {
      handleCountryTap(country.iso, country.name)
    }
  }, [isUnlocked, handleUnlock, handleCountryTap])

  const handleShare = useCallback(() => {
    captureScreenshot(mapRef, countryCount, continentCount, percentage, Object.keys(unlocked))
  }, [countryCount, continentCount, percentage, unlocked])

  return (
    <>
      <MapCanvas
        unlocked={unlocked}
        isUnlocked={isUnlocked}
        onUnlock={handleUnlock}
        onCountryTap={handleCountryTap}
        mapRef={mapRef}
      />

      <StatsBar
        countryCount={countryCount}
        continentCount={continentCount}
        rank={rank}
        nextRank={nextRank}
        countriesUntilNextRank={countriesUntilNextRank}
        continentBreakdown={continentBreakdown}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <BottomActions
        onAddPlace={() => setSearchOpen(true)}
        onShare={handleShare}
      />

      <SearchPanel
        countries={COUNTRY_LIST}
        isUnlocked={isUnlocked}
        onSelect={handleSearch}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />

      <CountryDrawer
        data={countryDrawer}
        unlockedCities={unlockedCities}
        onCityUnlock={handleCityUnlock}
        onClose={() => setCountryDrawer(null)}
        notes={notes}
        onNoteSave={saveNote}
      />

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        countryCount={countryCount}
        cityCount={totalCityCount}
      />

      {particles && <ParticleBurst x={particles.x} y={particles.y} active={particles.active} />}

      <CelebrationOverlay
        data={celebration}
        onDismiss={() => setCelebration(null)}
        onShare={handleShare}
        onExploreCities={handleExploreCities}
      />

      <MilestoneCard data={milestone} onDismiss={() => setMilestone(null)} />

      <Onboarding visible={showOnboarding} onDismiss={() => setShowOnboarding(false)} />

      <Toast message={toast.message} visible={toast.visible} />
    </>
  )
}
