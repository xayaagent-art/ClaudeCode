import html2canvas from 'html2canvas'

export async function captureScreenshot(countryCount, percentage) {
  // Create overlay for the screenshot
  const overlay = document.createElement('div')
  overlay.id = 'share-overlay'
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    pointer-events: none; display: flex; flex-direction: column;
    justify-content: flex-end; align-items: center;
    padding: 48px; background: linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 40%);
  `
  overlay.innerHTML = `
    <div style="text-align: center;">
      <div style="font-family: 'Cormorant Garamond', serif; font-size: 36px; color: #F5ECD7;
        letter-spacing: 0.15em; margin-bottom: 12px;">my footprint</div>
      <div style="font-family: 'DM Sans', sans-serif; font-size: 16px; color: #E8C97A;
        letter-spacing: 0.02em;">${countryCount} countries &middot; ${percentage}% of the world</div>
      <div style="font-family: 'DM Sans', sans-serif; font-size: 11px; color: rgba(245,236,215,0.4);
        margin-top: 16px; letter-spacing: 0.05em;">footprint.app</div>
    </div>
  `
  document.body.appendChild(overlay)

  try {
    const canvas = await html2canvas(document.getElementById('root'), {
      backgroundColor: '#0A0A0F',
      scale: 2,
      useCORS: true,
      logging: false,
      ignoreElements: (el) => {
        return el.id === 'share-overlay' ? false :
          el.classList?.contains('mapboxgl-ctrl-bottom-left') ||
          el.classList?.contains('mapboxgl-ctrl-bottom-right')
      },
    })

    document.body.removeChild(overlay)

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
    document.body.removeChild(overlay)
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
