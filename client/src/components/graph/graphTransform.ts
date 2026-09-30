import type { GraphBounds } from './graphTypes'

const MIN_ZOOM = 0.12
const MAX_ZOOM = 2.6
export type GraphView = { zoom: number; x: number; y: number; rotation: number }
export type GraphPointer = { x: number; y: number }
type ViewportSize = { width: number; height: number }

export function fitGraphView(bounds: GraphBounds, size: ViewportSize): GraphView {
  const padding = Math.min(44, size.width * 0.06)
  const zoom = Math.max(MIN_ZOOM, Math.min(1.2,
    (size.width - padding * 2) / Math.max(1, bounds.maxX - bounds.minX),
    (size.height - padding * 2) / Math.max(1, bounds.maxY - bounds.minY),
  ))
  return { zoom, rotation: 0,
    x: size.width / 2 - (bounds.minX + bounds.maxX) / 2 * zoom,
    y: size.height / 2 - (bounds.minY + bounds.maxY) / 2 * zoom }
}

export function initialGraphView(bounds: GraphBounds, size: ViewportSize, center?: GraphPointer): GraphView {
  const view = fitGraphView(bounds, size)
  return center ? { ...view, x: size.width / 2 - center.x * view.zoom, y: size.height / 2 - center.y * view.zoom } : view
}

function transformAt(current: GraphView, factor: number, angle: number, from: GraphPointer, to: GraphPointer): GraphView {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current.zoom * factor))
  const ratio = zoom / current.zoom
  const dx = from.x - current.x
  const dy = from.y - current.y
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return { zoom, rotation: current.rotation + angle * 180 / Math.PI,
    x: to.x - ratio * (cos * dx - sin * dy),
    y: to.y - ratio * (sin * dx + cos * dy) }
}

export function zoomGraphAt(current: GraphView, factor: number, anchor: GraphPointer): GraphView {
  return transformAt(current, factor, 0, anchor, anchor)
}

// Incremental similarity transform: one pointer translates; two translate,
// scale and rotate together while keeping their world anchor under the midpoint.
export function transformGraphGesture(current: GraphView, before: GraphPointer[], after: GraphPointer[]): GraphView {
  if (!before.length || before.length !== after.length) return current
  if (before.length === 1) return { ...current, x: current.x + after[0].x - before[0].x, y: current.y + after[0].y - before[0].y }
  const midpoint = (points: GraphPointer[]) => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 })
  const oldDx = before[1].x - before[0].x
  const oldDy = before[1].y - before[0].y
  const dx = after[1].x - after[0].x
  const dy = after[1].y - after[0].y
  const oldDistance = Math.hypot(oldDx, oldDy)
  const distance = Math.hypot(dx, dy)
  // Coincident pointers have no meaningful scale or angle.
  if (oldDistance < 1 || distance < 1) return transformAt(current, 1, 0, midpoint(before), midpoint(after))
  const delta = Math.atan2(dy, dx) - Math.atan2(oldDy, oldDx)
  const angle = Math.atan2(Math.sin(delta), Math.cos(delta))
  return transformAt(current, distance / oldDistance, angle, midpoint(before), midpoint(after))
}
