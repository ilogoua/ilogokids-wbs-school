import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent, PointerEvent } from 'react'
import { flushSync } from 'react-dom'
import type { GraphBounds } from './graphTypes'
import { initialGraphView, transformGraphGesture, zoomGraphAt } from './graphTransform'
import type { GraphPointer, GraphView } from './graphTransform'

export function useGraphViewport(bounds: GraphBounds, initialCenter?: GraphPointer) {
  const svgRef = useRef<SVGSVGElement>(null)
  const placementRef = useRef<HTMLDivElement>(null)
  const boundsRef = useRef(bounds)
  const initialCenterRef = useRef(initialCenter)
  const measured = useRef(false)
  const pointers = useRef(new Map<number, { point: GraphPointer; start: GraphPointer; capture: Element }>())
  const suppressClick = useRef(false)
  const [size, setSize] = useState({ width: 1000, height: 700 })
  const [view, setView] = useState(() => initialGraphView(bounds, size, initialCenter))
  const viewRef = useRef(view)

  useEffect(() => { boundsRef.current = bounds }, [bounds])

  const updateView = useCallback((next: GraphView) => {
    viewRef.current = next
    setView(next)
  }, [])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (!width || !height) return
      if (measured.current) { setSize({ width, height }); return }
      // Install the measured viewBox before using its CTM for initial placement.
      flushSync(() => setSize({ width, height }))
      const placement = placementRef.current
      const matrix = svg.getScreenCTM()
      if (!placement || !matrix) return
      const rect = placement.getBoundingClientRect()
      const center = svg.createSVGPoint()
      center.x = rect.x + rect.width / 2; center.y = rect.y + rect.height / 2
      const local = center.matrixTransform(matrix.inverse())
      const area = { width: placement.clientWidth, height: placement.clientHeight }
      const initial = initialGraphView(boundsRef.current, area, initialCenterRef.current)
      updateView({ ...initial, x: initial.x + local.x - area.width / 2, y: initial.y + local.y - area.height / 2 })
      measured.current = true
    })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [updateView])

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
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (pointers.current.size) return
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? svg.clientHeight : 1
      const delta = Math.max(-240, Math.min(240, event.deltaY * unit))
      const factor = Math.exp(-delta * (event.ctrlKey ? 0.008 : 0.002))
      updateView(zoomGraphAt(viewRef.current, factor, toViewPoint(event.clientX, event.clientY)))
    }
    svg.addEventListener('wheel', handleWheel, { passive: false })
    return () => svg.removeEventListener('wheel', handleWheel)
  }, [toViewPoint, updateView])

  const handlePointerDown = useCallback((event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || pointers.current.size >= 2) return
    // A second finger from a paper/control gesture must not start graph drag.
    if (event.pointerType === 'touch' && !event.isPrimary && !pointers.current.size) return
    if (!pointers.current.size) suppressClick.current = false
    else suppressClick.current = true
    // Retain client samples; map BOTH ends through the current camera on move.
    const point = { x: event.clientX, y: event.clientY }
    // Capturing on the node preserves its ordinary tap/click selection target.
    const capture = (event.target as Element).closest('.graph-node') ?? event.currentTarget
    pointers.current.set(event.pointerId, { point, start: point, capture })
    capture.setPointerCapture(event.pointerId)
  }, [])

  const handlePointerMove = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const pointer = pointers.current.get(event.pointerId)
    if (!pointer) return
    const point = toViewPoint(event.clientX, event.clientY)
    const before = [...pointers.current.values()].map(value => toViewPoint(value.point.x, value.point.y))
    const start = toViewPoint(pointer.start.x, pointer.start.y)
    if (Math.hypot(point.x - start.x, point.y - start.y) > 6) suppressClick.current = true
    // Ignore tap jitter until drag intent is clear; multi-touch starts immediately.
    if (!suppressClick.current) return
    pointer.point = { x: event.clientX, y: event.clientY }
    const after = [...pointers.current.values()].map(value => toViewPoint(value.point.x, value.point.y))
    updateView(transformGraphGesture(viewRef.current, before, after))
  }, [toViewPoint, updateView])

  const handlePointerUp = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const pointer = pointers.current.get(event.pointerId)
    if (!pointer) return
    if (event.type === 'pointercancel' || event.type === 'lostpointercapture') suppressClick.current = true
    pointers.current.delete(event.pointerId)
    if (pointer.capture.hasPointerCapture(event.pointerId)) pointer.capture.releasePointerCapture(event.pointerId)
    // The remaining finger continues from the current transform with no reset.
    for (const remaining of pointers.current.values()) remaining.start = remaining.point
  }, [])

  const handleClickCapture = useCallback((event: MouseEvent<SVGSVGElement>) => {
    if (suppressClick.current && event.detail !== 0) {
      event.preventDefault()
      event.stopPropagation()
    }
  }, [])

  return { svgRef, placementRef, size, view, handlePointerDown, handlePointerMove, handlePointerUp, handleClickCapture }
}
