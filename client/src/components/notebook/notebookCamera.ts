import { currentScreenAngle, deadZone, PaperGravitySensor, screenGravity, SCREEN_DOWN } from './paperGravity.ts'
import type { SensorWindow } from './paperGravity.ts'
import { localToScreen, normalizeAngle, NotebookOrientationModel, screenToLocal } from './notebookOrientation.ts'
import type { NotebookFrame } from './notebookOrientation.ts'
import type { SheetSize } from './sheetGeometry.ts'
import type { Point } from './paperState.ts'

type FrameListener = (frame: NotebookFrame, elapsed: number) => void

// One RAF owns camera sampling, CSS geometry and physics subscribers. React
// only rerenders for user actions and real viewport changes, never raw sensors.
export class NotebookCamera {
  private model: NotebookOrientationModel
  private target: SensorWindow
  private viewport: SheetSize
  private angle: number
  private sensors: PaperGravitySensor | null = null
  private listeners = new Set<FrameListener>()
  private frameId = 0
  private previous = 0
  private physicsActive = false
  private paint: ((frame: NotebookFrame) => void) | null = null
  private reducedMotion = false
  private unpairedResize = false

  constructor(viewport: SheetSize, target: SensorWindow) {
    this.target = target
    this.viewport = viewport
    this.angle = normalizeAngle(currentScreenAngle(target))
    this.model = new NotebookOrientationModel(viewport, this.angle)
  }

  get frame() { return this.model.frame }
  toLocal(point: Point) { return screenToLocal(point, this.frame) }
  toScreen(point: Point) { return localToScreen(point, this.frame) }

  connect(element: HTMLElement, deck: HTMLElement) {
    this.sensors = new PaperGravitySensor(this.target)
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.paint = frame => {
      const { size, viewport, scale, angle } = frame
      element.style.width = deck.style.width = `${size.width}px`
      element.style.height = deck.style.height = `${size.height}px`
      element.style.transform = `translate(${viewport.width / 2}px, ${viewport.height / 2}px) rotate(${angle}deg) scale(${scale}) translate(${-size.width / 2}px, ${-size.height / 2}px)`
      element.dataset.rotation = String(frame.rotation)
      element.dataset.angle = String(angle)
      element.dataset.scale = String(scale)
      element.dataset.screenAngle = String(frame.screenAngle)
    }
    const unsubscribe = this.sensors.subscribe(this.schedule)
    const visibility = () => {
      cancelAnimationFrame(this.frameId)
      this.frameId = 0; this.previous = 0
      if (!document.hidden) this.schedule()
    }
    const orientation = () => { this.setViewport(this.viewport, currentScreenAngle(this.target)); this.schedule() }
    document.addEventListener('visibilitychange', visibility)
    window.screen.orientation?.addEventListener('change', orientation)
    window.addEventListener('orientationchange', orientation)
    this.refresh()
    this.schedule()
    return () => {
      cancelAnimationFrame(this.frameId)
      this.frameId = 0; this.previous = 0
      document.removeEventListener('visibilitychange', visibility)
      window.screen.orientation?.removeEventListener('change', orientation)
      window.removeEventListener('orientationchange', orientation)
      unsubscribe()
      this.sensors?.dispose()
      this.sensors = null
      this.paint = null
    }
  }

  setViewport(viewport: SheetSize, angle = currentScreenAngle(this.target)) {
    angle = normalizeAngle(angle)
    if (viewport.width === this.viewport.width && viewport.height === this.viewport.height && angle === this.angle) return
    // Some Android events arrive before the layout viewport has changed. Do
    // not combine a new quarter-turn basis with the previous viewport shape.
    let quarterTurn = Math.abs(Math.sin((angle - this.angle) * Math.PI / 180)) > 0.5
    const aspectChanged = (viewport.width > viewport.height) !== (this.viewport.width > this.viewport.height)
    const rotation = this.sensors?.rotation() ?? null
    if (!quarterTurn && angle === this.angle && aspectChanged && rotation !== null && this.target.screen?.orientation) {
      // resize can precede ScreenOrientation.change. The actual viewport swap
      // plus measured continuous roll identifies its new basis immediately.
      angle = normalizeAngle(this.angle + (normalizeAngle(rotation - this.angle) >= 0 ? 90 : -90))
      quarterTurn = true
    }
    if (quarterTurn && !aspectChanged && !this.unpairedResize) return
    // Without continuous pose, a resize-first fallback may already have
    // reframed. Still accept the matching late OS basis instead of rejecting it
    // forever because the viewport aspect has already changed.
    this.unpairedResize = angle === this.angle ? this.unpairedResize || aspectChanged : false
    this.viewport = viewport
    this.angle = angle
    this.refresh()
    this.schedule()
  }

  refresh(elapsed = 0) {
    const device = this.sensors?.deviceGravity()
    const gravity = device ? deadZone(screenGravity(device, this.angle)) : SCREEN_DOWN
    const frame = this.model.update(this.viewport, this.angle, this.sensors?.rotation() ?? null, gravity, elapsed, this.reducedMotion)
    this.paint?.(frame)
    // Paint dimensions BEFORE subscribers rebase bodies and advance physics.
    for (const listener of this.listeners) listener(frame, elapsed)
    return frame
  }

  subscribe(listener: FrameListener) {
    this.listeners.add(listener)
    listener(this.frame, 0)
    return () => { this.listeners.delete(listener) }
  }

  setPhysicsActive(active: boolean) {
    this.physicsActive = active
    if (active) this.schedule()
  }

  requestPermission() { return this.sensors?.requestPermission() ?? Promise.resolve() }

  private schedule = () => {
    if (this.paint && !this.frameId && !document.hidden) this.frameId = requestAnimationFrame(this.tick)
  }

  private tick = (time: number) => {
    this.frameId = 0
    if (document.hidden || !this.paint) { this.previous = 0; return }
    // Refresh the complete screen basis in one transaction. Geometry freezes
    // height-only keyboard changes in useSheetGeometry before reaching here.
    this.setViewport(this.viewport)
    const elapsed = this.previous ? Math.min(50, time - this.previous) : 1000 / 60
    this.previous = time
    this.refresh(elapsed)
    if (this.physicsActive || this.model.moving) this.schedule()
    else this.previous = 0
  }
}
