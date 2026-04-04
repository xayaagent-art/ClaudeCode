import { useRef, useState, useEffect } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const COUNTRY_SOURCE = 'country-boundaries'
const COUNTRY_FILL = 'country-fill'
const COUNTRY_FILL_UNLOCKED = 'country-fill-unlocked'
const COUNTRY_BORDER = 'country-border'
const COUNTRY_BORDER_UNLOCKED = 'country-border-unlocked'
const COUNTRY_HIGHLIGHT = 'country-highlight'

const isMobile = () => window.innerWidth <= 768

export default function MapCanvas({ unlocked, isUnlocked, onUnlock, onCountryTap, mapRef: externalMapRef }) {
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
      style: 'mapbox://styles/mapbox/light-v11',
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
      map.setFog({
        color: '#C8E6F5',
        'high-color': '#87CEEB',
        'horizon-blend': 0.04,
        'space-color': '#1a1a2e',
        'star-intensity': 0.4,
      })

      const layers = map.getStyle().layers
      layers.forEach(layer => {
        if (layer.type === 'background') {
          map.setPaintProperty(layer.id, 'background-color', '#E8E0D0')
        }
        if (layer.id === 'water') {
          map.setPaintProperty(layer.id, 'fill-color', '#B8D9EC')
        }
        if (layer.id.includes('country-label')) {
          map.setLayoutProperty(layer.id, 'visibility', 'none')
        }
        if (layer.id.includes('admin-0') && layer.type === 'line') {
          map.setPaintProperty(layer.id, 'line-color', '#B8AE9C')
          map.setPaintProperty(layer.id, 'line-opacity', 0.6)
        }
      })

      map.addSource(COUNTRY_SOURCE, {
        type: 'vector',
        url: 'mapbox://mapbox.country-boundaries-v1',
      })

      map.addLayer({
        id: COUNTRY_FILL,
        type: 'fill',
        source: COUNTRY_SOURCE,
        'source-layer': 'country_boundaries',
        paint: { 'fill-color': '#D4CCBC', 'fill-opacity': 0.5 },
      })

      map.addLayer({
        id: COUNTRY_FILL_UNLOCKED,
        type: 'fill',
        source: COUNTRY_SOURCE,
        'source-layer': 'country_boundaries',
        filter: ['in', 'iso_3166_1', ''],
        paint: {
          'fill-color': '#D4A843',
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.65, 5, 0.8],
        },
      })

      map.addLayer({
        id: COUNTRY_BORDER,
        type: 'line',
        source: COUNTRY_SOURCE,
        'source-layer': 'country_boundaries',
        paint: { 'line-color': '#B8AE9C', 'line-opacity': 0.4, 'line-width': 0.5 },
      })

      map.addLayer({
        id: COUNTRY_BORDER_UNLOCKED,
        type: 'line',
        source: COUNTRY_SOURCE,
        'source-layer': 'country_boundaries',
        filter: ['in', 'iso_3166_1', ''],
        paint: { 'line-color': '#8B6914', 'line-opacity': 0.8, 'line-width': 1.5 },
      })

      map.addLayer({
        id: COUNTRY_HIGHLIGHT,
        type: 'line',
        source: COUNTRY_SOURCE,
        'source-layer': 'country_boundaries',
        filter: ['==', 'iso_3166_1', ''],
        paint: { 'line-color': '#8B6914', 'line-opacity': 0.6, 'line-width': 2 },
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

  useEffect(() => {
    const map = internalMapRef.current
    if (!map || !mapLoaded) return
    const filter = unlockedCodes.length > 0
      ? ['in', 'iso_3166_1', ...unlockedCodes]
      : ['in', 'iso_3166_1', '']
    map.setFilter(COUNTRY_FILL_UNLOCKED, filter)
    map.setFilter(COUNTRY_BORDER_UNLOCKED, filter)
  }, [unlockedCodes, mapLoaded])

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
        onCountryTap(iso, name)
        return
      }

      const bounds = new mapboxgl.LngLatBounds()
      const geom = features[0].geometry
      if (geom.type === 'Polygon') {
        geom.coordinates[0].forEach(c => bounds.extend(c))
      } else if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach(poly => poly[0].forEach(c => bounds.extend(c)))
      }
      const center = bounds.getCenter()

      map.flyTo({
        center: [center.lng, center.lat],
        zoom: Math.max(map.getZoom(), 4),
        duration: 1200,
        essential: true,
        easing: t => 1 - Math.pow(1 - t, 3),
      })

      const screenPoint = map.project(center)
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
  }, [mapLoaded, isUnlocked, onUnlock, onCountryTap])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', touchAction: 'none' }}>
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: '#FAF7F2',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 16,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: '3px solid #E8DCC8',
            borderTopColor: '#D4A843',
            animation: 'spin 1s linear infinite',
          }} />
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: 18,
            color: 'var(--muted)', letterSpacing: '-0.02em',
          }}>loading your globe...</span>
        </div>
      )}

      <div ref={containerRef} style={{ width: '100%', height: '100%', touchAction: 'none' }} />

      {tooltip && (
        <div style={{
          position: 'absolute', left: tooltip.x, top: tooltip.y - 44,
          transform: 'translateX(-50%)',
          fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600,
          color: 'var(--ink)',
          background: 'var(--card-bg)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--sand)',
          borderRadius: 12, padding: '6px 14px',
          pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 30,
          boxShadow: '0 4px 16px var(--shadow)',
        }}>
          {tooltip.name}
        </div>
      )}
    </div>
  )
}
