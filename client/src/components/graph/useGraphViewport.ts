import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import type { GraphBounds } from './graphTypes'

const MIN_ZOOM = 0.12
const MAX_ZOOM = 2.6

type ViewportSize = { width: number; height: number }
export type GraphView = { zoom: number; x: number; y: number }

export function fitGraphView(bounds: GraphBounds, size: ViewportSize): GraphView {
  const padding = Math.min(44, size.width * 0.06)
  const zoom = Math.max(MIN_ZOOM, Math.min(1.2,
    (size.width - padding * 2) / Math.max(1, bounds.maxX - bounds.minX),
    (size.height - padding * 2) / Math.max(1, bounds.maxY - bounds.minY),
  ))
  return {
    zoom,
    x: size.width / 2 - (bounds.minX + bounds.maxX) / 2 * zoom,
    y: size.height / 2 - (bounds.minY + bounds.maxY) / 2 * zoom,
  }
}

export function zoomGraphAt(current: GraphView, factor: number, anchor: { x: number; y: number }): GraphView {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current.zoom * factor))
  const ratio = zoom / current.zoom
  return { zoom, x: anchor.x - (anchor.x - current.x) * ratio, y: anchor.y - (anchor.y - current.y) * ratio }
}

export function useGraphViewport(bounds: GraphBounds) {
  const svgRef = useRef<SVGSVGElement>(null)
  const boundsRef = useRef(bounds)
  const dragRef = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number } | null>(null)
  const [size, setSize] = useState<ViewportSize>({ width: 1000, height: 700 })
  const [view, setView] = useState(() => fitGraphView(bounds, size))

  useEffect(() => { boundsRef.current = bounds }, [bounds])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (!width || !height) return
      const nextSize = { width, height }
      setSize(nextSize)
      setView(fitGraphView(boundsRef.current, nextSize))
      dragRef.current = null
    })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  const toViewPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return { x: clientX, y: clientY }
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    return point.matrixTransform(matrix.inverse())
  }, [])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    // A native non-passive listener prevents page scrolling/browser pinch zoom
    // while the pointer is over the graph. Page UI remains outside this transform.
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (dragRef.current) return
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? svg.clientHeight : 1
      const delta = Math.max(-240, Math.min(240, event.deltaY * unit))
      const factor = Math.exp(-delta * (event.ctrlKey ? 0.008 : 0.002))
      const anchor = toViewPoint(event.clientX, event.clientY)
      setView((current) => zoomGraphAt(current, factor, anchor))
    }
    svg.addEventListener('wheel', handleWheel, { passive: false })
    return () => svg.removeEventListener('wheel', handleWheel)
  }, [toViewPoint])

  const handlePointerDown = useCallback((event: PointerEvent<SVGSVGElement>) => {
    if (!event.isPrimary || event.button !== 0 || dragRef.current || (event.target as Element).closest('.graph-node')) return
    const point = toViewPoint(event.clientX, event.clientY)
    dragRef.current = { pointerId: event.pointerId, x: point.x, y: point.y, panX: view.x, panY: view.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [toViewPoint, view.x, view.y])

  const handlePointerMove = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const point = toViewPoint(event.clientX, event.clientY)
    setView((current) => ({ ...current, x: drag.panX + point.x - drag.x, y: drag.panY + point.y - drag.y }))
  }, [toViewPoint])

  const handlePointerUp = useCallback((event: PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])

  const zoomBy = useCallback((factor: number) => {
    setView((current) => zoomGraphAt(current, factor, { x: size.width / 2, y: size.height / 2 }))
  }, [size])

  // Topology growth does not silently zoom back out. Center explicitly fits the
  // latest bounds; initial measurement and responsive resizing also fit the graph.
  const resetView = useCallback(() => setView(fitGraphView(bounds, size)), [bounds, size])
  return { svgRef, size, view, handlePointerDown, handlePointerMove, handlePointerUp, zoomBy, resetView }
}
