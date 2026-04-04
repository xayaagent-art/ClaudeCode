import { useRef, useState, useEffect } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { getContinent } from '../../data/countryMeta'
import { CONTINENT_COLORS } from '../../data/continentColors'
import { getCityCompletionOpacity } from '../../data/cityProgress'

const SRC = 'country-boundaries'
const FILL = 'country-fill'
const FILL_U = 'country-fill-unlocked'
const FILL_W = 'country-fill-wishlist'
const BORDER = 'country-border'
const BORDER_U = 'country-border-unlocked'
const BORDER_W = 'country-border-wishlist'
const HIGHLIGHT = 'country-highlight'
const isMobile = () => window.innerWidth <= 768

export default function MapCanvas({ unlocked, isUnlocked, onUnlock, onCountryTap, onLockedTap, mapRef: extRef, unlockedCities, wishlist }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState(null)
  const hoveredRef = useRef(null)
  const codes = Object.keys(unlocked)

  useEffect(() => {
    if (mapRef.current) return
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN
    const mobile = isMobile()
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [20, 15], zoom: mobile ? 1.2 : 2,
      minZoom: 1, maxZoom: 8, projection: 'globe',
      attributionControl: false, dragRotate: !mobile,
      touchPitch: false, preserveDrawingBuffer: true,
    })

    map.on('load', () => {
      map.setFog({
        color: '#E8F4FD', 'high-color': '#B8D9F0',
        'horizon-blend': 0.05, 'space-color': '#6BA3D6', 'star-intensity': 0.0,
      })
      map.getStyle().layers.forEach(l => {
        if (l.type === 'background') map.setPaintProperty(l.id, 'background-color', '#F0EDE6')
        if (l.id === 'water') map.setPaintProperty(l.id, 'fill-color', '#C8E8F5')
        if (l.id.includes('country-label')) map.setLayoutProperty(l.id, 'visibility', 'none')
        if (l.id.includes('admin-0') && l.type === 'line') {
          map.setPaintProperty(l.id, 'line-color', 'rgba(0,0,0,0.08)')
          map.setPaintProperty(l.id, 'line-opacity', 0.6)
        }
      })
      map.addSource(SRC, { type: 'vector', url: 'mapbox://mapbox.country-boundaries-v1' })
      // Locked countries base fill
      map.addLayer({ id: FILL, type: 'fill', source: SRC, 'source-layer': 'country_boundaries',
        paint: { 'fill-color': '#E8E4DC', 'fill-opacity': 0.6 } })
      // Wishlist countries — very faint continent color
      map.addLayer({ id: FILL_W, type: 'fill', source: SRC, 'source-layer': 'country_boundaries',
        filter: ['in', 'iso_3166_1', ''],
        paint: { 'fill-color': '#E8E4DC', 'fill-opacity': 0.12 } })
      // Unlocked countries — continent color with city-progress opacity
      map.addLayer({ id: FILL_U, type: 'fill', source: SRC, 'source-layer': 'country_boundaries',
        filter: ['in', 'iso_3166_1', ''],
        paint: { 'fill-color': '#E8E4DC', 'fill-opacity': 0.28 } })
      // Locked borders
      map.addLayer({ id: BORDER, type: 'line', source: SRC, 'source-layer': 'country_boundaries',
        paint: { 'line-color': 'rgba(0,0,0,0.08)', 'line-opacity': 0.6, 'line-width': 0.5 } })
      // Wishlist borders — dashed
      map.addLayer({ id: BORDER_W, type: 'line', source: SRC, 'source-layer': 'country_boundaries',
        filter: ['in', 'iso_3166_1', ''],
        paint: { 'line-color': '#717171', 'line-opacity': 0.4, 'line-width': 1, 'line-dasharray': [2, 2] } })
      // Unlocked borders
      map.addLayer({ id: BORDER_U, type: 'line', source: SRC, 'source-layer': 'country_boundaries',
        filter: ['in', 'iso_3166_1', ''],
        paint: { 'line-color': 'rgba(0,0,0,0.15)', 'line-opacity': 0.9, 'line-width': 1.5 } })
      // Hover highlight
      map.addLayer({ id: HIGHLIGHT, type: 'line', source: SRC, 'source-layer': 'country_boundaries',
        filter: ['==', 'iso_3166_1', ''],
        paint: { 'line-color': '#222222', 'line-opacity': 0.4, 'line-width': 2 } })
      setReady(true); setLoading(false)
      mapRef.current = map
      if (extRef) extRef.current = map
    })
    return () => { map.remove(); mapRef.current = null; if (extRef) extRef.current = null }
  }, [])

  // Update unlocked country fills with continent colors + city-progress opacity
  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return
    const f = codes.length > 0 ? ['in', 'iso_3166_1', ...codes] : ['in', 'iso_3166_1', '']
    m.setFilter(FILL_U, f)
    m.setFilter(BORDER_U, f)

    if (codes.length > 0) {
      // Color match expression
      const colorEntries = codes.flatMap(iso => {
        const continent = getContinent(iso)
        return [iso, CONTINENT_COLORS[continent] || '#717171']
      })
      m.setPaintProperty(FILL_U, 'fill-color', [
        'match', ['get', 'iso_3166_1'],
        ...colorEntries,
        '#E8E4DC'
      ])

      // Opacity match expression based on city progress
      const opacityEntries = codes.flatMap(iso => {
        const opacity = getCityCompletionOpacity(iso, unlockedCities || {})
        return [iso, opacity]
      })
      m.setPaintProperty(FILL_U, 'fill-opacity', [
        'match', ['get', 'iso_3166_1'],
        ...opacityEntries,
        0.0
      ])

      // Border: thicker for fully explored countries
      const widthEntries = codes.flatMap(iso => {
        const opacity = getCityCompletionOpacity(iso, unlockedCities || {})
        return [iso, opacity >= 1.0 ? 2.5 : 1.5]
      })
      m.setPaintProperty(BORDER_U, 'line-width', [
        'match', ['get', 'iso_3166_1'],
        ...widthEntries,
        0.5
      ])

      // Border color: continent color for fully explored
      const borderColorEntries = codes.flatMap(iso => {
        const continent = getContinent(iso)
        const opacity = getCityCompletionOpacity(iso, unlockedCities || {})
        return [iso, opacity >= 1.0 ? (CONTINENT_COLORS[continent] || '#222') : 'rgba(0,0,0,0.15)']
      })
      m.setPaintProperty(BORDER_U, 'line-color', [
        'match', ['get', 'iso_3166_1'],
        ...borderColorEntries,
        'rgba(0,0,0,0.15)'
      ])
    }
  }, [codes, ready, unlockedCities])

  // Update wishlist layer
  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return
    const wl = wishlist || []
    const f = wl.length > 0 ? ['in', 'iso_3166_1', ...wl] : ['in', 'iso_3166_1', '']
    m.setFilter(FILL_W, f)
    m.setFilter(BORDER_W, f)

    if (wl.length > 0) {
      const colorEntries = wl.flatMap(iso => {
        const continent = getContinent(iso)
        return [iso, CONTINENT_COLORS[continent] || '#717171']
      })
      m.setPaintProperty(FILL_W, 'fill-color', [
        'match', ['get', 'iso_3166_1'],
        ...colorEntries,
        '#E8E4DC'
      ])
      const borderColorEntries = wl.flatMap(iso => {
        const continent = getContinent(iso)
        return [iso, CONTINENT_COLORS[continent] || '#717171']
      })
      m.setPaintProperty(BORDER_W, 'line-color', [
        'match', ['get', 'iso_3166_1'],
        ...borderColorEntries,
        '#717171'
      ])
    }
  }, [wishlist, ready])

  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return
    const onMove = (e) => {
      const feats = m.queryRenderedFeatures(e.point, { layers: [FILL, FILL_U, FILL_W] })
      if (feats.length > 0) {
        const iso = feats[0].properties.iso_3166_1, name = feats[0].properties.name_en
        m.getCanvas().style.cursor = 'pointer'
        if (hoveredRef.current !== iso) { hoveredRef.current = iso; m.setFilter(HIGHLIGHT, ['==', 'iso_3166_1', iso]) }
        if (isUnlocked(iso) && !isMobile()) setTooltip({ x: e.point.x, y: e.point.y, name })
        else setTooltip(null)
      } else {
        m.getCanvas().style.cursor = ''; hoveredRef.current = null
        m.setFilter(HIGHLIGHT, ['==', 'iso_3166_1', '']); setTooltip(null)
      }
    }
    const onClick = (e) => {
      const feats = m.queryRenderedFeatures(e.point, { layers: [FILL, FILL_U, FILL_W] })
      if (!feats.length) return
      const iso = feats[0].properties.iso_3166_1, name = feats[0].properties.name_en
      if (isUnlocked(iso)) { onCountryTap(iso, name); return }
      // Locked country — show action sheet
      const bounds = new mapboxgl.LngLatBounds()
      const g = feats[0].geometry
      if (g.type === 'Polygon') g.coordinates[0].forEach(c => bounds.extend(c))
      else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p[0].forEach(c => bounds.extend(c)))
      const center = bounds.getCenter()
      const screenPos = { x: m.project(center).x, y: m.project(center).y }
      onLockedTap(iso, name, screenPos)
    }
    const onLeave = () => { m.getCanvas().style.cursor = ''; hoveredRef.current = null; m.setFilter(HIGHLIGHT, ['==', 'iso_3166_1', '']); setTooltip(null) }
    m.on('mousemove', onMove); m.on('click', onClick); m.on('mouseleave', onLeave)
    return () => { m.off('mousemove', onMove); m.off('click', onClick); m.off('mouseleave', onLeave) }
  }, [ready, isUnlocked, onCountryTap, onLockedTap])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', touchAction: 'none' }}>
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: '#F7F7F7',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16,
        }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--rausch)', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500, color: 'var(--muted)' }}>Loading your globe...</span>
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%', touchAction: 'none' }} />
      {tooltip && (
        <div style={{
          position: 'absolute', left: tooltip.x, top: tooltip.y - 44, transform: 'translateX(-50%)',
          fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
          color: 'var(--ink)', background: 'white',
          border: '1px solid var(--border)',
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
