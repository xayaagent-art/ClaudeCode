import { isoToFlag, getRank, getContinent } from '../data/countryMeta'
import { CONTINENT_COLORS } from '../data/continentColors'

export async function captureScreenshot(mapRef, countryCount, continentCount, percentage, unlockedCodes) {
  let mapImageUrl = ''
  try {
    const canvas = mapRef?.current?.getCanvas()
    if (canvas) mapImageUrl = canvas.toDataURL('image/png')
  } catch (e) {
    console.warn('Map capture failed:', e)
  }

  const flags = unlockedCodes.slice(0, 40).map(iso => isoToFlag(iso)).join(' ')
  const rank = getRank(unlockedCodes.length)

  // Build continent legend pills
  const visitedContinents = new Set()
  unlockedCodes.forEach(iso => {
    const c = getContinent(iso)
    if (c !== 'Unknown') visitedContinents.add(c)
  })
  const continentPills = [...visitedContinents].map(c => {
    const color = CONTINENT_COLORS[c] || '#717171'
    return `<span style="display: inline-flex; align-items: center; gap: 6px; background: ${color}15; border-radius: 20px; padding: 6px 16px; margin: 4px;">
      <span style="width: 10px; height: 10px; border-radius: 50%; background: ${color}; display: inline-block;"></span>
      <span style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; font-weight: 600; color: ${color};">${c}</span>
    </span>`
  }).join('')

  const card = document.createElement('div')
  card.style.cssText = `
    position: fixed; left: -9999px; top: -9999px;
    width: 1080px; height: 1080px;
    background: #FFFFFF;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 60px;
  `

  card.innerHTML = `
    <div style="position: absolute; inset: 24px; border: 2px solid #EBEBEB; border-radius: 24px; pointer-events: none;"></div>

    <div style="font-family: 'Fraunces', serif; font-style: italic; font-size: 64px; color: #222; letter-spacing: -0.02em; margin-bottom: 4px;">
      footprint
    </div>
    <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 20px; font-weight: 300; color: #717171; margin-bottom: 32px;">
      my world, my story
    </div>

    ${mapImageUrl ? `
      <div style="width: 600px; height: 600px; border-radius: 50%; overflow: hidden; margin-bottom: 28px; box-shadow: 0 12px 48px rgba(0,0,0,0.1); border: 3px solid #EBEBEB;">
        <img src="${mapImageUrl}" style="width: 100%; height: 100%; object-fit: cover;" />
      </div>
    ` : ''}

    ${continentPills ? `<div style="display: flex; flex-wrap: wrap; justify-content: center; margin-bottom: 16px;">${continentPills}</div>` : ''}

    <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 24px; font-weight: 600; color: #222; margin-bottom: 8px;">
      ${countryCount} countries &middot; ${continentCount} continents &middot; ${rank.emoji} ${rank.name}
    </div>

    ${flags ? `<div style="font-size: 28px; max-width: 700px; text-align: center; line-height: 1.8; margin-bottom: 16px;">${flags}</div>` : ''}

    <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0 40px;">
      <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13px; color: #B0B0B0;">
        footprint.app
      </div>
      <div style="display: flex; align-items: center; gap: 6px; background: rgba(255,90,95,0.08); border-radius: 20px; padding: 6px 16px;">
        <span style="font-size: 16px;">${rank.emoji}</span>
        <span style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; font-weight: 600; color: #FF5A5F;">${rank.name}</span>
      </div>
    </div>
  `

  document.body.appendChild(card)

  try {
    const { default: html2canvas } = await import('html2canvas')
    const canvas = await html2canvas(card, {
      backgroundColor: '#FFFFFF',
      scale: 1, useCORS: true, logging: false,
      width: 1080, height: 1080,
    })
    document.body.removeChild(card)

    canvas.toBlob(async (blob) => {
      if (!blob) return
      const file = new File([blob], 'my-footprint.png', { type: 'image/png' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'My Footprint', text: `I've visited ${countryCount} countries!` })
        } catch { downloadBlob(blob) }
      } else {
        downloadBlob(blob)
      }
    }, 'image/png')
  } catch {
    document.body.removeChild(card)
  }
}

function downloadBlob(blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'my-footprint.png'
  a.click()
  URL.revokeObjectURL(url)
}
