import { useRef, useState, useEffect } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const SRC = 'country-boundaries'
const FILL = 'country-fill'
const FILL_U = 'country-fill-unlocked'
const BORDER = 'country-border'
const BORDER_U = 'country-border-unlocked'
const HIGHLIGHT = 'country-highlight'
const isMobile = () => window.innerWidth <= 768

export default function MapCanvas({ unlocked, isUnlocked, onUnlock, onCountryTap, mapRef: extRef }) {
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
        color: '#C8E8F5', 'high-color': '#87CEEB',
        'horizon-blend': 0.06, 'space-color': '#4A90D9', 'star-intensity': 0.0,
      })
      map.getStyle().layers.forEach(l => {
        if (l.type === 'background') map.setPaintProperty(l.id, 'background-color', '#EDE5D8')
        if (l.id === 'water') map.setPaintProperty(l.id, 'fill-color', '#BAD9EC')
        if (l.id.includes('country-label')) map.setLayoutProperty(l.id, 'visibility', 'none')
        if (l.id.includes('admin-0') && l.type === 'line') {
          map.setPaintProperty(l.id, 'line-color', '#C8C0B0')
          map.setPaintProperty(l.id, 'line-opacity', 0.5)
        }
      })
      map.addSource(SRC, { type: 'vector', url: 'mapbox://mapbox.country-boundaries-v1' })
      map.addLayer({ id: FILL, type: 'fill', source: SRC, 'source-layer': 'country_boundaries',
        paint: { 'fill-color': '#DDD8CE', 'fill-opacity': 0.5 } })
      map.addLayer({ id: FILL_U, type: 'fill', source: SRC, 'source-layer': 'country_boundaries',
        filter: ['in', 'iso_3166_1', ''],
        paint: { 'fill-color': '#C17F4A', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.65, 5, 0.8] } })
      map.addLayer({ id: BORDER, type: 'line', source: SRC, 'source-layer': 'country_boundaries',
        paint: { 'line-color': '#C8C0B0', 'line-opacity': 0.5, 'line-width': 0.5 } })
      map.addLayer({ id: BORDER_U, type: 'line', source: SRC, 'source-layer': 'country_boundaries',
        filter: ['in', 'iso_3166_1', ''],
        paint: { 'line-color': '#8B5E35', 'line-opacity': 0.9, 'line-width': 1.5 } })
      map.addLayer({ id: HIGHLIGHT, type: 'line', source: SRC, 'source-layer': 'country_boundaries',
        filter: ['==', 'iso_3166_1', ''],
        paint: { 'line-color': '#8B5E35', 'line-opacity': 0.5, 'line-width': 2 } })
      setReady(true); setLoading(false)
      mapRef.current = map
      if (extRef) extRef.current = map
    })
    return () => { map.remove(); mapRef.current = null; if (extRef) extRef.current = null }
  }, [])

  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return
    const f = codes.length > 0 ? ['in', 'iso_3166_1', ...codes] : ['in', 'iso_3166_1', '']
    m.setFilter(FILL_U, f); m.setFilter(BORDER_U, f)
  }, [codes, ready])

  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return
    const onMove = (e) => {
      const feats = m.queryRenderedFeatures(e.point, { layers: [FILL, FILL_U] })
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
      const feats = m.queryRenderedFeatures(e.point, { layers: [FILL, FILL_U] })
      if (!feats.length) return
      const iso = feats[0].properties.iso_3166_1, name = feats[0].properties.name_en
      if (isUnlocked(iso)) { onCountryTap(iso, name); return }
      const bounds = new mapboxgl.LngLatBounds()
      const g = feats[0].geometry
      if (g.type === 'Polygon') g.coordinates[0].forEach(c => bounds.extend(c))
      else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p[0].forEach(c => bounds.extend(c)))
      const center = bounds.getCenter()
      m.flyTo({ center: [center.lng, center.lat], zoom: Math.max(m.getZoom(), 4), duration: 1200, essential: true, easing: t => 1 - Math.pow(1 - t, 3) })
      onUnlock(iso, name, { x: m.project(center).x, y: m.project(center).y })
    }
    const onLeave = () => { m.getCanvas().style.cursor = ''; hoveredRef.current = null; m.setFilter(HIGHLIGHT, ['==', 'iso_3166_1', '']); setTooltip(null) }
    m.on('mousemove', onMove); m.on('click', onClick); m.on('mouseleave', onLeave)
    return () => { m.off('mousemove', onMove); m.off('click', onClick); m.off('mouseleave', onLeave) }
  }, [ready, isUnlocked, onUnlock, onCountryTap])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', touchAction: 'none' }}>
      {loading && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'linear-gradient(180deg, #C8E8F5 0%, #E8F4FD 50%, #F5F0E8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid #DDD8CE', borderTopColor: '#C17F4A', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--muted)', letterSpacing: '-0.02em' }}>loading your globe...</span>
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%', touchAction: 'none' }} />
      {tooltip && (
        <div style={{ position: 'absolute', left: tooltip.x, top: tooltip.y - 44, transform: 'translateX(-50%)', fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--ink)', background: 'var(--white-card)', backdropFilter: 'blur(12px)', border: '1px solid var(--sand)', borderRadius: 12, padding: '6px 14px', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 30, boxShadow: '0 4px 16px var(--shadow)' }}>
          {tooltip.name}
        </div>
      )}
    </div>
  )
}
