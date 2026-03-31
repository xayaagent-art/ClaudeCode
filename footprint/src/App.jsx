import { useState, useCallback } from 'react'
import MapCanvas from './components/Map/MapCanvas'
import StatsBar from './components/UI/StatsBar'
import SearchPanel from './components/UI/SearchPanel'
import ShareButton from './components/UI/ShareButton'
import Toast from './components/UI/Toast'
import { useFootprint } from './hooks/useFootprint'
import { captureScreenshot } from './lib/share'
import { COUNTRY_LIST } from './data/countryList'

export default function App() {
  const {
    unlocked,
    isUnlocked,
    unlock,
    getInfo,
    countryCount,
    continentCount,
    percentage,
  } = useFootprint()

  const [toast, setToast] = useState({ visible: false, message: '' })

  const showToast = useCallback((msg) => {
    setToast({ visible: true, message: msg })
    setTimeout(() => setToast({ visible: false, message: '' }), 3000)
  }, [])

  const handleUnlock = useCallback((iso, name) => {
    const wasNew = unlock(iso, name)
    if (wasNew) {
      setTimeout(() => {
        showToast(`🌍 ${name} unlocked`)
      }, 800)
    }
  }, [unlock, showToast])

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
      handleUnlock(country.iso, country.name)
    } else {
      handleCountryInfo(country.iso, country.name)
    }
  }, [isUnlocked, handleUnlock, handleCountryInfo])

  const handleShare = useCallback(() => {
    captureScreenshot(countryCount, percentage)
  }, [countryCount, percentage])

  return (
    <>
      <MapCanvas
        unlocked={unlocked}
        isUnlocked={isUnlocked}
        onUnlock={handleUnlock}
        onCountryInfo={handleCountryInfo}
      />

      {/* Wordmark */}
      <div
        style={{
          position: 'fixed',
          top: 18,
          left: 20,
          zIndex: 60,
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 28,
          fontWeight: 400,
          color: 'var(--text-primary)',
          letterSpacing: '0.15em',
          userSelect: 'none',
        }}
      >
        footprint
      </div>

      <StatsBar
        countryCount={countryCount}
        continentCount={continentCount}
        percentage={percentage}
      />

      <SearchPanel
        countries={COUNTRY_LIST}
        isUnlocked={isUnlocked}
        onSelect={handleSearch}
      />

      <ShareButton onClick={handleShare} />

      <Toast message={toast.message} visible={toast.visible} />
    </>
  )
}
