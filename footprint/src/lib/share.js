import { isoToFlag, getRank } from '../data/countryMeta'

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

  const card = document.createElement('div')
  card.style.cssText = `
    position: fixed; left: -9999px; top: -9999px;
    width: 1080px; height: 1080px;
    background: #FAF7F2;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 60px;
  `

  card.innerHTML = `
    <div style="position: absolute; inset: 32px; border: 2px solid rgba(212,168,67,0.3); border-radius: 24px; pointer-events: none;"></div>

    <div style="font-family: 'Fraunces', serif; font-style: italic; font-size: 38px; color: #1A1208; letter-spacing: -0.02em; margin-bottom: 24px;">
      my footprint
    </div>

    ${mapImageUrl ? `
      <div style="width: 480px; height: 480px; border-radius: 50%; overflow: hidden; margin-bottom: 28px; box-shadow: 0 12px 48px rgba(26,18,8,0.15); border: 4px solid rgba(212,168,67,0.3);">
        <img src="${mapImageUrl}" style="width: 100%; height: 100%; object-fit: cover;" />
      </div>
    ` : ''}

    <div style="font-family: 'Nunito', sans-serif; font-size: 22px; font-weight: 700; color: #1A1208; margin-bottom: 8px;">
      ${countryCount} countries &middot; ${continentCount} continents
    </div>

    <div style="font-family: 'Nunito', sans-serif; font-size: 16px; color: #8A7A6A; margin-bottom: 16px;">
      ${rank.emoji} ${rank.name} &middot; ${percentage}% of the world
    </div>

    ${flags ? `<div style="font-size: 18px; max-width: 600px; text-align: center; line-height: 2; margin-bottom: 20px;">${flags}</div>` : ''}

    <div style="font-family: 'Nunito', sans-serif; font-size: 12px; color: #B8AE9C; letter-spacing: 0.05em;">
      footprint.app
    </div>
  `

  document.body.appendChild(card)

  try {
    const { default: html2canvas } = await import('html2canvas')
    const canvas = await html2canvas(card, {
      backgroundColor: '#FAF7F2',
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
