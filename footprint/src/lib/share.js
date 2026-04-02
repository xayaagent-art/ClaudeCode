import { isoToFlag } from '../data/countryMeta'

export async function captureScreenshot(mapRef, countryCount, continentCount, percentage, unlockedCodes) {
  // Get map canvas image
  let mapImageUrl = ''
  try {
    const canvas = mapRef?.current?.getCanvas()
    if (canvas) {
      mapImageUrl = canvas.toDataURL('image/png')
    }
  } catch (e) {
    console.warn('Could not capture map canvas:', e)
  }

  // Build flags string
  const flags = unlockedCodes.slice(0, 40).map(iso => isoToFlag(iso)).join(' ')

  // Create off-screen card
  const card = document.createElement('div')
  card.style.cssText = `
    position: fixed; left: -9999px; top: -9999px;
    width: 1080px; height: 1080px;
    background: #0A0A1A;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    overflow: hidden;
  `

  card.innerHTML = `
    <div style="position: absolute; inset: 0; border: 2px solid rgba(201,168,76,0.15); margin: 24px; border-radius: 16px; pointer-events: none;"></div>

    ${mapImageUrl ? `<img src="${mapImageUrl}" style="width: 800px; height: 600px; object-fit: cover; border-radius: 12px; margin-bottom: 32px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);" />` : ''}

    <div style="font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 42px; color: #C9A84C; letter-spacing: 0.2em; margin-bottom: 16px;">
      my footprint
    </div>

    <div style="font-family: 'DM Sans', sans-serif; font-size: 20px; color: #F5ECD7; letter-spacing: 0.02em; margin-bottom: 24px;">
      ${countryCount} countries &middot; ${continentCount} continents &middot; ${percentage}% of the world
    </div>

    ${flags ? `<div style="font-size: 20px; max-width: 800px; text-align: center; line-height: 2; margin-bottom: 24px;">${flags}</div>` : ''}

    <div style="font-family: 'DM Sans', sans-serif; font-size: 12px; color: rgba(245,236,215,0.3); letter-spacing: 0.05em;">
      footprint.app
    </div>
  `

  document.body.appendChild(card)

  try {
    const { default: html2canvas } = await import('html2canvas')
    const canvas = await html2canvas(card, {
      backgroundColor: '#0A0A1A',
      scale: 1,
      useCORS: true,
      logging: false,
      width: 1080,
      height: 1080,
    })

    document.body.removeChild(card)

    canvas.toBlob(async (blob) => {
      if (!blob) return

      const file = new File([blob], 'my-footprint.png', { type: 'image/png' })

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'My Footprint',
            text: `I've visited ${countryCount} countries — ${percentage}% of the world!`,
          })
        } catch {
          downloadBlob(blob)
        }
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
