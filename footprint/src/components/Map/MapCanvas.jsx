import { useRef, useCallback, useState, useEffect } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import UnlockAnimation from './UnlockAnimation'

const COUNTRY_SOURCE = 'country-boundaries'
const COUNTRY_FILL = 'country-fill'
const COUNTRY_FILL_UNLOCKED = 'country-fill-unlocked'
const COUNTRY_BORDER = 'country-border'
const COUNTRY_BORDER_UNLOCKED = 'country-border-unlocked'
const COUNTRY_HIGHLIGHT = 'country-highlight'

export default function MapCanvas({ unlocked, isUnlocked, onUnlock, onCountryInfo }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [animState, setAnimState] = useState(null) // { x, y, active }
  const [tooltip, setTooltip] = useState(null)
  const hoveredIdRef = useRef(null)

  const unlockedCodes = Object.keys(unlocked)

  // Initialize map
  useEffect(() => {
    if (mapRef.current) return

    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [20, 20],
      zoom: 2,
      minZoom: 1.5,
      maxZoom: 8,
      projection: 'mercator',
      attributionControl: false,
    })

    map.on('load', () => {
      // Override map colors for ocean
      const layers = map.getStyle().layers
      layers.forEach(layer => {
        if (layer.type === 'background') {
          map.setPaintProperty(layer.id, 'background-color', '#080810')
        }
        if (layer.id === 'water') {
          map.setPaintProperty(layer.id, 'fill-color', '#080810')
        }
        // Hide default country labels and fills for clean look
        if (layer.id.includes('country-label')) {
          map.setLayoutProperty(layer.id, 'visibility', 'none')
        }
        if (layer.id.includes('admin-0') && layer.type === 'line') {
          map.setPaintProperty(layer.id, 'line-color', '#2A2A4A')
          map.setPaintProperty(layer.id, 'line-opacity', 0.4)
        }
      })

      // Add country source from Mapbox tileset
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
          'fill-color': '#141428',
          'fill-opacity': 0.6,
        },
      })

      // Unlocked country fill (filtered)
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
          'line-opacity': 0.4,
          'line-width': 0.5,
        },
      })

      // Unlocked border with directional light simulation
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
          'line-color': '#4A4A8A',
          'line-opacity': 0.8,
          'line-width': 1.5,
        },
      })

      setMapLoaded(true)
      mapRef.current = map
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Update unlocked country filters when unlocked changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    const filter = unlockedCodes.length > 0
      ? ['in', 'iso_3166_1', ...unlockedCodes]
      : ['in', 'iso_3166_1', '']

    map.setFilter(COUNTRY_FILL_UNLOCKED, filter)
    map.setFilter(COUNTRY_BORDER_UNLOCKED, filter)
  }, [unlockedCodes, mapLoaded])

  // Map interactions (hover + click)
  useEffect(() => {
    const map = mapRef.current
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

        if (isUnlocked(iso)) {
          setTooltip({ x: e.point.x, y: e.point.y, name, iso })
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

      // Fly to country centroid
      const bounds = new mapboxgl.LngLatBounds()
      if (features[0].geometry.type === 'Polygon') {
        features[0].geometry.coordinates[0].forEach(c => bounds.extend(c))
      } else if (features[0].geometry.type === 'MultiPolygon') {
        features[0].geometry.coordinates.forEach(poly => poly[0].forEach(c => bounds.extend(c)))
      }
      const center = bounds.getCenter()

      map.flyTo({
        center: [center.lng, center.lat],
        zoom: Math.max(map.getZoom(), 4),
        duration: 1200,
        essential: true,
        easing: t => t * (2 - t),
      })

      // Trigger unlock animation at screen position
      const screenPoint = map.project(center)
      setAnimState({ x: screenPoint.x, y: screenPoint.y, active: true })

      // Trigger the data unlock
      onUnlock(iso, name)

      // Clear animation after sequence
      setTimeout(() => {
        setAnimState(null)
      }, 2000)
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
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Vignette overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)',
          zIndex: 5,
        }}
      />

      {/* Grain texture overlay */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.03, zIndex: 6 }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>

      {/* Unlock animation overlay */}
      {animState && (
        <UnlockAnimation x={animState.x} y={animState.y} active={animState.active} />
      )}

      {/* Tooltip for unlocked countries */}
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x,
            top: tooltip.y - 40,
            transform: 'translateX(-50%)',
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 15,
            fontWeight: 600,
            color: '#E8C97A',
            background: 'rgba(10,10,15,0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(201,168,76,0.2)',
            borderRadius: 8,
            padding: '5px 12px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 30,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          {tooltip.name}
        </div>
      )}
    </div>
  )
}
