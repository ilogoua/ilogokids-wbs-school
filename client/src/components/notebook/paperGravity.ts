export type Gravity = { x: number; y: number }
import { DeviceRollTracker, unwrapAngle } from './notebookOrientation.ts'
type Axes = { x: number | null; y: number | null; z: number | null }
export const SCREEN_DOWN: Gravity = { x: 0, y: 1 }
const G = 9.81
const radians = (degrees: number) => degrees * Math.PI / 180
const finite = (value: number | null): value is number => value !== null && Number.isFinite(value)

// Device axes: X right, Y up, Z out of the glass, in the natural orientation.
// CSS Y points down. Rotate the projected vector into the displayed screen.
export function screenGravity(device: Gravity, angle: number): Gravity {
  // ScreenOrientation is physical CCW rotation; CSS uses clockwise rotation.
  const a = radians(-angle)
  return { x: device.x * Math.cos(a) - device.y * Math.sin(a),
    y: device.x * Math.sin(a) + device.y * Math.cos(a) }
}

export function motionGravity(including: Axes | null, linear: Axes | null): Gravity | null {
  if (!including || !finite(including.x) || !finite(including.y)) return null
  // accelerationIncludingGravity is proper acceleration, opposite gravity.
  // Subtract linear acceleration when supplied to reject phone translation.
  return { x: -(including.x - (linear && finite(linear.x) ? linear.x : 0)) / G,
    y: (including.y - (linear && finite(linear.y) ? linear.y : 0)) / G }
}

export function orientationGravity(beta: number | null, gamma: number | null): Gravity | null {
  if (!finite(beta) || !finite(gamma)) return null
  // Project world (0,0,-g) with the transpose of the Z-X'-Y'' matrix.
  // Heading alpha cancels; never calibrate the current pose as neutral.
  return { x: Math.cos(radians(beta)) * Math.sin(radians(gamma)), y: Math.sin(radians(beta)) }
}

export function smoothGravity(previous: Gravity | null, next: Gravity, elapsedMs: number): Gravity {
  const magnitude = Math.hypot(next.x, next.y)
  const scale = magnitude > 1 ? 1 / magnitude : 1
  const clamped = { x: next.x * scale, y: next.y * scale }
  if (!previous) return clamped // First sensor reading has no screen-down bias.
  const mix = 1 - Math.exp(-Math.max(0, elapsedMs) / 140)
  return { x: previous.x + (clamped.x - previous.x) * mix, y: previous.y + (clamped.y - previous.y) * mix }
}

export function deadZone(gravity: Gravity): Gravity {
  return { x: Math.abs(gravity.x) < 0.035 ? 0 : gravity.x, y: Math.abs(gravity.y) < 0.035 ? 0 : gravity.y }
}

type PermissionSensor = { requestPermission?: () => Promise<PermissionState> }
export type SensorWindow = EventTarget & {
  isSecureContext: boolean
  DeviceMotionEvent?: PermissionSensor
  DeviceOrientationEvent?: PermissionSensor
  screen?: { orientation?: { angle: number } }
  orientation?: number
}

export function needsSensorPermission(target: SensorWindow): boolean {
  return target.isSecureContext && !!(target.DeviceMotionEvent?.requestPermission || target.DeviceOrientationEvent?.requestPermission)
}

export const currentScreenAngle = (target: SensorWindow): number => target.screen?.orientation?.angle ?? target.orientation ?? 0

export class PaperGravitySensor {
  private motion: Gravity | null = null
  private orientationVector: Gravity | null = null
  private motionTime = 0
  private orientationTime = 0
  private disposed = false
  private listening = new Set<string>()
  private target: SensorWindow
  private now: () => number
  private rollTracker = new DeviceRollTracker()
  private orientationRoll: number | null = null
  private orientationBearing: number | null = null
  private subscribers = new Set<() => void>()

  constructor(target: SensorWindow, now = () => performance.now()) {
    this.target = target
    this.now = now
    if (!target.isSecureContext) return
    if (target.DeviceMotionEvent && !target.DeviceMotionEvent.requestPermission) this.listen('devicemotion')
    if (target.DeviceOrientationEvent && !target.DeviceOrientationEvent.requestPermission) this.listen('deviceorientation')
  }

  private onMotion = (event: Event) => {
    const motion = event as DeviceMotionEvent
    const vector = motionGravity(motion.accelerationIncludingGravity, motion.acceleration)
    if (!vector) return
    const time = this.now()
    this.motion = smoothGravity(this.motion, vector, time - this.motionTime)
    this.motionTime = time
    for (const callback of this.subscribers) callback()
  }

  private onOrientation = (event: Event) => {
    const orientation = event as DeviceOrientationEvent
    const vector = orientationGravity(orientation.beta, orientation.gamma)
    if (!vector) return
    const time = this.now()
    this.orientationVector = smoothGravity(this.orientationVector, vector, time - this.orientationTime)
    this.orientationTime = time
    const initialRoll = Math.hypot(vector.x, vector.y) > 0.2 ? -Math.atan2(vector.x, vector.y) * 180 / Math.PI : currentScreenAngle(this.target)
    this.orientationRoll = this.rollTracker.update(orientation.alpha, orientation.beta, orientation.gamma, initialRoll)
    // Some browsers provide beta/gamma but no alpha; gravity still reveals roll
    // away from flat. Near flat, hold the last reliable camera roll.
    if (this.orientationRoll === null && Math.hypot(vector.x, vector.y) > 0.2) this.orientationBearing = this.orientationBearing === null ? initialRoll : unwrapAngle(this.orientationBearing, initialRoll)
    for (const callback of this.subscribers) callback()
  }

  private listen(name: string) {
    if (this.disposed || this.listening.has(name)) return
    this.target.addEventListener(name, name === 'devicemotion' ? this.onMotion : this.onOrientation)
    this.listening.add(name)
  }

  async requestPermission(): Promise<void> {
    // Invoke both APIs synchronously inside the user's click activation.
    await Promise.allSettled((['devicemotion', 'deviceorientation'] as const).map(async name => {
      const api = name === 'devicemotion' ? this.target.DeviceMotionEvent : this.target.DeviceOrientationEvent
      if (api && (!api.requestPermission || await api.requestPermission() === 'granted')) this.listen(name)
    }))
  }

  deviceGravity(): Gravity | null {
    // Prefer motion; if its stream stops, an orientation stream can take over.
    const vector = this.motion && (this.now() - this.motionTime < 1000 || !this.orientationVector)
      ? this.motion : this.orientationVector
    return vector
  }

  rotation(): number | null { return this.orientationRoll ?? this.orientationBearing }

  subscribe(callback: () => void) { this.subscribers.add(callback); return () => { this.subscribers.delete(callback) } }

  current(): Gravity {
    const vector = this.deviceGravity()
    return vector ? deadZone(screenGravity(vector, currentScreenAngle(this.target))) : { ...SCREEN_DOWN }
  }

  dispose() {
    this.disposed = true
    for (const name of this.listening) this.target.removeEventListener(name, name === 'devicemotion' ? this.onMotion : this.onOrientation)
    this.listening.clear()
    this.subscribers.clear()
  }
}
