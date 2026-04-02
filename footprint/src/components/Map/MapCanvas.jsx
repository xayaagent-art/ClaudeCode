import { useRef, useCallback, useState, useEffect } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const COUNTRY_SOURCE = 'country-boundaries'
const COUNTRY_FILL = 'country-fill'
const COUNTRY_FILL_UNLOCKED = 'country-fill-unlocked'
const COUNTRY_BORDER = 'country-border'
const COUNTRY_BORDER_UNLOCKED = 'country-border-unlocked'
const COUNTRY_HIGHLIGHT = 'country-highlight'

const isMobile = () => window.innerWidth <= 768

export default function MapCanvas({ unlocked, isUnlocked, onUnlock, onCountryInfo, mapRef: externalMapRef }) {
  const containerRef = useRef(null)
  const internalMapRef = useRef(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState(null)
  const hoveredIdRef = useRef(null)

  const unlockedCodes = Object.keys(unlocked)

  useEffect(() => {
    if (internalMapRef.current) return

    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

    const mobile = isMobile()

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [20, 15],
      zoom: mobile ? 1.2 : 2,
      minZoom: 1,
      maxZoom: 8,
      projection: 'globe',
      attributionControl: false,
      dragRotate: !mobile,
      touchPitch: false,
      preserveDrawingBuffer: true,
    })

    map.on('load', () => {
      // Globe atmosphere
      map.setFog({
        color: 'rgb(8, 8, 20)',
        'high-color': 'rgb(20, 20, 60)',
        'horizon-blend': 0.02,
        'space-color': 'rgb(4, 4, 12)',
        'star-intensity': 0.8,
      })

      // Override map colors
      const layers = map.getStyle().layers
      layers.forEach(layer => {
        if (layer.type === 'background') {
          map.setPaintProperty(layer.id, 'background-color', '#080810')
        }
        if (layer.id === 'water') {
          map.setPaintProperty(layer.id, 'fill-color', '#080810')
        }
        if (layer.id.includes('country-label')) {
          map.setLayoutProperty(layer.id, 'visibility', 'none')
        }
        if (layer.id.includes('admin-0') && layer.type === 'line') {
          map.setPaintProperty(layer.id, 'line-color', '#2A2A4A')
          map.setPaintProperty(layer.id, 'line-opacity', 0.3)
        }
      })

      // Country boundaries source
      map.addSource(COUNTRY_SOURCE, {
        type: 'vector',
        url: 'mapbox://mapbox.country-boundaries-v1',
      })

      // Locked country fill
      map.addLayer({
        id: COUNTRY_FILL,
        type: 'fill',
        source: COUNTRY_SOURCE,
        'source-layer': 'country_boundaries',
        paint: {
          'fill-color': '#1C1C2E',
          'fill-opacity': 0.6,
        },
      })

      // Unlocked country fill
      map.addLayer({
        id: COUNTRY_FILL_UNLOCKED,
        type: 'fill',
        source: COUNTRY_SOURCE,
        'source-layer': 'country_boundaries',
        filter: ['in', 'iso_3166_1', ''],
        paint: {
          'fill-color': '#C9A84C',
          'fill-opacity': [
            'interpolate', ['linear'], ['zoom'],
            1, 0.7,
            5, 0.85,
          ],
        },
      })

      // Locked border
      map.addLayer({
        id: COUNTRY_BORDER,
        type: 'line',
        source: COUNTRY_SOURCE,
        'source-layer': 'country_boundaries',
        paint: {
          'line-color': '#2A2A4A',
          'line-opacity': 0.3,
          'line-width': 0.5,
        },
      })

      // Unlocked border
      map.addLayer({
        id: COUNTRY_BORDER_UNLOCKED,
        type: 'line',
        source: COUNTRY_SOURCE,
        'source-layer': 'country_boundaries',
        filter: ['in', 'iso_3166_1', ''],
        paint: {
          'line-color': '#E8C97A',
          'line-opacity': 0.8,
          'line-width': 1.5,
        },
      })

      // Hover highlight
      map.addLayer({
        id: COUNTRY_HIGHLIGHT,
        type: 'line',
        source: COUNTRY_SOURCE,
        'source-layer': 'country_boundaries',
        filter: ['==', 'iso_3166_1', ''],
        paint: {
          'line-color': '#6A6AAA',
          'line-opacity': 0.8,
          'line-width': 1.5,
        },
      })

      setMapLoaded(true)
      setLoading(false)
      internalMapRef.current = map
      if (externalMapRef) externalMapRef.current = map
    })

    return () => {
      map.remove()
      internalMapRef.current = null
      if (externalMapRef) externalMapRef.current = null
    }
  }, [])

  // Update unlocked filters
  useEffect(() => {
    const map = internalMapRef.current
    if (!map || !mapLoaded) return

    const filter = unlockedCodes.length > 0
      ? ['in', 'iso_3166_1', ...unlockedCodes]
      : ['in', 'iso_3166_1', '']

    map.setFilter(COUNTRY_FILL_UNLOCKED, filter)
    map.setFilter(COUNTRY_BORDER_UNLOCKED, filter)
  }, [unlockedCodes, mapLoaded])

  // Map interactions
  useEffect(() => {
    const map = internalMapRef.current
    if (!map || !mapLoaded) return

    const handleMouseMove = (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [COUNTRY_FILL, COUNTRY_FILL_UNLOCKED],
      })

      if (features.length > 0) {
        const iso = features[0].properties.iso_3166_1
        const name = features[0].properties.name_en
        map.getCanvas().style.cursor = 'pointer'

        if (hoveredIdRef.current !== iso) {
          hoveredIdRef.current = iso
          map.setFilter(COUNTRY_HIGHLIGHT, ['==', 'iso_3166_1', iso])
        }

        if (isUnlocked(iso) && !isMobile()) {
          setTooltip({ x: e.point.x, y: e.point.y, name })
        } else {
          setTooltip(null)
        }
      } else {
        map.getCanvas().style.cursor = ''
        hoveredIdRef.current = null
        map.setFilter(COUNTRY_HIGHLIGHT, ['==', 'iso_3166_1', ''])
        setTooltip(null)
      }
    }

    const handleClick = (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [COUNTRY_FILL, COUNTRY_FILL_UNLOCKED],
      })

      if (features.length === 0) return

      const iso = features[0].properties.iso_3166_1
      const name = features[0].properties.name_en

      if (isUnlocked(iso)) {
        onCountryInfo(iso, name)
        return
      }

      // Get country centroid
      const bounds = new mapboxgl.LngLatBounds()
      if (features[0].geometry.type === 'Polygon') {
        features[0].geometry.coordinates[0].forEach(c => bounds.extend(c))
      } else if (features[0].geometry.type === 'MultiPolygon') {
        features[0].geometry.coordinates.forEach(poly => poly[0].forEach(c => bounds.extend(c)))
      }
      const center = bounds.getCenter()

      // Step 1: Fly to country
      map.flyTo({
        center: [center.lng, center.lat],
        zoom: Math.max(map.getZoom(), 4),
        duration: 1000,
        essential: true,
        easing: t => 1 - Math.pow(1 - t, 3),
      })

      // Step 2: Get screen position for particles
      const screenPoint = map.project(center)

      // Trigger unlock with screen coords
      onUnlock(iso, name, { x: screenPoint.x, y: screenPoint.y })
    }

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = ''
      hoveredIdRef.current = null
      map.setFilter(COUNTRY_HIGHLIGHT, ['==', 'iso_3166_1', ''])
      setTooltip(null)
    }

    map.on('mousemove', handleMouseMove)
    map.on('click', handleClick)
    map.on('mouseleave', handleMouseLeave)

    return () => {
      map.off('mousemove', handleMouseMove)
      map.off('click', handleClick)
      map.off('mouseleave', handleMouseLeave)
    }
  }, [mapLoaded, isUnlocked, onUnlock, onCountryInfo])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', touchAction: 'none' }}>
      {/* Loading skeleton */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: '#0A0A0F',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 16,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: '2px solid rgba(201,168,76,0.2)',
            borderTopColor: '#C9A84C',
            animation: 'spin 1s linear infinite',
          }} />
          <span style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 18, color: 'rgba(245,236,215,0.5)',
            letterSpacing: '0.15em',
          }}>loading globe...</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      <div ref={containerRef} style={{ width: '100%', height: '100%', touchAction: 'none' }} />

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.4) 100%)',
        zIndex: 5,
      }} />

      {/* Grain */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.03, zIndex: 6 }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>

      {/* Tooltip (desktop only) */}
      {tooltip && (
        <div style={{
          position: 'absolute', left: tooltip.x, top: tooltip.y - 40,
          transform: 'translateX(-50%)',
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 15, fontWeight: 600, color: '#E8C97A',
          background: 'rgba(10,10,15,0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(201,168,76,0.2)',
          borderRadius: 8, padding: '5px 12px',
          pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 30,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {tooltip.name}
        </div>
      )}
    </div>
  )
}
