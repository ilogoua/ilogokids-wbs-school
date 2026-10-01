import type { Gravity } from './paperGravity.ts'
import type { Point } from './paperState.ts'
import type { SheetSize } from './sheetGeometry.ts'

const rad = (degrees: number) => degrees * Math.PI / 180
export const normalizeAngle = (angle: number) => ((angle + 180) % 360 + 360) % 360 - 180
export const unwrapAngle = (previous: number, angle: number) => previous + normalizeAngle(angle - previous)
export const rotateVector = (v: Point, degrees: number): Point => ({
  x: v.x * Math.cos(rad(degrees)) - v.y * Math.sin(rad(degrees)),
  y: v.x * Math.sin(rad(degrees)) + v.y * Math.cos(rad(degrees)),
})

export function interpolateSheet(natural: SheetSize, rotation: number): SheetSize {
  const progress = Math.sin(rad(rotation)) ** 2
  return { width: natural.width + (natural.height - natural.width) * progress,
    height: natural.height + (natural.width - natural.height) * progress }
}

export function naturalSheet(viewport: SheetSize, angle: number): SheetSize {
  return Math.abs(Math.sin(rad(angle))) > 0.5 ? { width: viewport.height, height: viewport.width } : { ...viewport }
}

export type NotebookFrame = {
  size: SheetSize; viewport: SheetSize; rotation: number; screenAngle: number; angle: number; scale: number; gravity: Gravity
}

export function cameraFrame(size: SheetSize, viewport: SheetSize, rotation: number, screenAngle: number, screenGravity: Gravity): NotebookFrame {
  const angle = normalizeAngle(rotation - screenAngle)
  const c = Math.abs(Math.cos(rad(angle))), s = Math.abs(Math.sin(rad(angle)))
  const scale = Math.min(viewport.width / (size.width * c + size.height * s), viewport.height / (size.width * s + size.height * c))
  const local = rotateVector(screenGravity, -angle)
  return { size, viewport, rotation, screenAngle, angle, scale, gravity: { x: local.x / scale, y: local.y / scale } }
}

export function localToScreen(point: Point, frame: NotebookFrame): Point {
  const v = rotateVector({ x: (point.x - frame.size.width / 2) * frame.scale, y: (point.y - frame.size.height / 2) * frame.scale }, frame.angle)
  return { x: v.x + frame.viewport.width / 2, y: v.y + frame.viewport.height / 2 }
}

export function screenToLocal(point: Point, frame: NotebookFrame): Point {
  const v = rotateVector({ x: point.x - frame.viewport.width / 2, y: point.y - frame.viewport.height / 2 }, -frame.angle)
  return { x: v.x / frame.scale + frame.size.width / 2, y: v.y / frame.scale + frame.size.height / 2 }
}

// Map centres within the usable rectangle, retaining clearance at both edges.
export function rebasePoint(point: Point, from: SheetSize, to: SheetSize, radius = 0): Point {
  const remap = (value: number, old: number, next: number) => radius + (value - radius) / Math.max(1, old - radius * 2) * Math.max(1, next - radius * 2)
  return { x: remap(point.x, from.width, to.width), y: remap(point.y, from.height, to.height) }
}

function orientationMatrix(alpha: number, beta: number, gamma: number) {
  const a = rad(alpha), b = rad(beta), g = rad(gamma)
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g)
  return [ca * cg - sa * sb * sg, -cb * sa, cg * sa * sb + ca * sg,
    cg * sa + ca * sb * sg, ca * cb, sa * sg - ca * cg * sb,
    -cb * sg, sb, cb * cg]
}

// Incremental twist about the glass normal stays observable when gravity is
// perpendicular to the screen. It also avoids beta/gamma Euler singularities.
export class DeviceRollTracker {
  private previous: number[] | null = null
  private angle: number | null = null

  update(alpha: number | null, beta: number | null, gamma: number | null, initial: number): number | null {
    if (alpha === null || beta === null || gamma === null || ![alpha, beta, gamma].every(Number.isFinite)) return this.angle
    const matrix = orientationMatrix(alpha, beta, gamma)
    if (this.previous) {
      const dot = (oldColumn: number, newColumn: number) => [0, 3, 6].reduce((sum, row) => sum + this.previous![row + oldColumn] * matrix[row + newColumn], 0)
      const delta = Math.atan2(dot(1, 0) - dot(0, 1), dot(0, 0) + dot(1, 1)) * 180 / Math.PI
      this.angle = (this.angle ?? initial) + delta
    } else this.angle = initial
    this.previous = matrix
    return this.angle
  }
}

export class NotebookOrientationModel {
  private natural: SheetSize
  private naturalTarget: SheetSize
  private rotation: number
  private target = 0
  private fallbackStart = 0
  private fallbackTime = 180
  private fallbackSize: SheetSize
  private previousViewport: SheetSize
  private previousAngle: number
  private resizeScale: number | null = null
  private resizeTime = 180
  frame: NotebookFrame

  constructor(viewport: SheetSize, screenAngle: number) {
    this.natural = naturalSheet(viewport, screenAngle)
    this.naturalTarget = this.natural
    this.rotation = screenAngle
    this.fallbackStart = screenAngle
    this.target = screenAngle
    this.previousAngle = screenAngle
    this.previousViewport = { ...viewport }
    this.fallbackSize = { ...viewport }
    this.frame = cameraFrame(viewport, viewport, screenAngle, screenAngle, { x: 0, y: 1 })
  }

  update(viewport: SheetSize, screenAngle: number, sensorRotation: number | null, screenGravity: Gravity, elapsed: number, reducedMotion = false): NotebookFrame {
    const changed = viewport.width !== this.previousViewport.width || viewport.height !== this.previousViewport.height || screenAngle !== this.previousAngle
    if (changed) {
      this.resizeScale = this.frame.scale
      this.resizeTime = 0
      this.naturalTarget = naturalSheet(viewport, screenAngle)
      this.fallbackStart = this.rotation
      this.fallbackSize = this.frame.size
      this.fallbackTime = 0
      this.previousViewport = { ...viewport }
      this.previousAngle = screenAngle
    }
    if (sensorRotation !== null) {
      this.fallbackTime = 180
      const mix = 1 - Math.exp(-Math.max(0, elapsed) / 65)
      this.natural = { width: this.natural.width + (this.naturalTarget.width - this.natural.width) * mix,
        height: this.natural.height + (this.naturalTarget.height - this.natural.height) * mix }
      this.target = unwrapAngle(this.rotation, sensorRotation)
      const delta = this.target - this.rotation
      if (Math.abs(delta) > 0.4) this.rotation += delta * (1 - Math.exp(-Math.max(0, elapsed) / 65))
      const size = interpolateSheet(this.natural, this.rotation)
      this.frame = cameraFrame(size, viewport, this.rotation, screenAngle, screenGravity)
    } else {
      this.natural = this.naturalTarget
      this.target = unwrapAngle(this.fallbackStart, screenAngle)
      this.fallbackTime = Math.min(180, this.fallbackTime + Math.max(0, elapsed))
      const progress = reducedMotion ? 1 : this.fallbackTime / 180
      const mix = progress * progress * (3 - 2 * progress)
      this.rotation = this.fallbackStart + (this.target - this.fallbackStart) * mix
      // Start at the currently displayed shape, including a resize-first
      // fallback whose OS angle arrives after reframing has already begun.
      const size = { width: this.fallbackSize.width + (viewport.width - this.fallbackSize.width) * mix,
        height: this.fallbackSize.height + (viewport.height - this.fallbackSize.height) * mix }
      this.frame = cameraFrame(size, viewport, this.rotation, screenAngle, screenGravity)
    }
    if (this.resizeScale !== null) {
      const fitted = this.frame.scale
      this.resizeTime = Math.min(180, this.resizeTime + Math.max(0, elapsed))
      const progress = reducedMotion && sensorRotation === null ? 1 : this.resizeTime / 180
      const mix = progress * progress * (3 - 2 * progress)
      const scale = this.resizeScale + (fitted - this.resizeScale) * mix
      // Android's chrome/safe area need not swap exactly with the viewport.
      // Preserve the displayed scale at the basis switch, then reframe smoothly.
      this.frame = { ...this.frame, scale, gravity: { x: this.frame.gravity.x * fitted / scale, y: this.frame.gravity.y * fitted / scale } }
      if (progress === 1 || Math.abs(scale - fitted) < 0.0001) this.resizeScale = null
    }
    return this.frame
  }

  get moving() { return this.resizeScale !== null || Math.abs(this.target - this.rotation) > 0.4 || this.fallbackTime < 180 || Math.abs(this.natural.width - this.naturalTarget.width) + Math.abs(this.natural.height - this.naturalTarget.height) > 0.1 }
}
