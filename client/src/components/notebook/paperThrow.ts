import type { ScreenPoint } from './paperScreen.ts'

export type PointerSample = ScreenPoint & { time: number }
export const THROW_WINDOW_MS = 100
export const MAX_THROW_SPEED = 24 // Matter velocity: CSS pixels per 60 Hz step.
const STEP_MS = 1000 / 60

export function samplePointer(samples: PointerSample[], sample: PointerSample): PointerSample[] {
  if (![sample.x, sample.y, sample.time].every(Number.isFinite)) return samples
  const last = samples.at(-1)
  if (last && sample.time < last.time) return samples
  const recent = samples.filter(point => point.time >= sample.time - THROW_WINDOW_MS && point.time !== sample.time)
  return [...recent, sample].slice(-32)
}

// Fit the recent trajectory, including the release sample. A pause before
// release expires the swipe; total distance since pointerdown is irrelevant.
export function throwVelocity(samples: readonly PointerSample[]): ScreenPoint {
  const end = samples.at(-1)
  if (!end) return { x: 0, y: 0 }
  const recent = samples.filter(point => point.time >= end.time - THROW_WINDOW_MS)
  if (recent.length < 2 || end.time - recent[0].time < 4) return { x: 0, y: 0 }
  const mean = recent.reduce((sum, point) => ({ x: sum.x + point.x / recent.length, y: sum.y + point.y / recent.length, time: sum.time + point.time / recent.length }), { x: 0, y: 0, time: 0 })
  let denominator = 0, x = 0, y = 0
  for (const point of recent) {
    const dt = point.time - mean.time
    denominator += dt * dt
    x += dt * (point.x - mean.x); y += dt * (point.y - mean.y)
  }
  if (!denominator) return { x: 0, y: 0 }
  x = x / denominator * STEP_MS; y = y / denominator * STEP_MS
  if (![x, y].every(Number.isFinite)) return { x: 0, y: 0 }
  const scale = Math.min(1, MAX_THROW_SPEED / Math.hypot(x, y))
  return { x: x * scale, y: y * scale }
}
