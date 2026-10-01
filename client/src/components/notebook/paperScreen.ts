import type { SheetSize } from './sheetGeometry.ts'

export type ScreenPoint = { x: number; y: number }
export type PaperScreenFrame = SheetSize & { angle: number }
export const screenAngle = (angle: number) => ((angle % 360) + 360) % 360

// ScreenOrientation angles increase counterclockwise; CSS/Matter Y is down.
// Change coordinate basis by oldAngle - newAngle, without scaling distances.
export function rotateScreenVector(vector: ScreenPoint, oldAngle: number, newAngle: number): ScreenPoint {
  const radians = (oldAngle - newAngle) * Math.PI / 180
  const c = Math.cos(radians), s = Math.sin(radians)
  return { x: vector.x * c - vector.y * s, y: vector.x * s + vector.y * c }
}

export function reframeScreenPoint(point: ScreenPoint, from: PaperScreenFrame, to: PaperScreenFrame): ScreenPoint {
  const relative = rotateScreenVector({ x: point.x - from.width / 2, y: point.y - from.height / 2 }, from.angle, to.angle)
  return { x: to.width / 2 + relative.x, y: to.height / 2 + relative.y }
}

// Android can publish angle and layout in separate callbacks. Do not clamp or
// step bodies in a mismatched quarter-turn frame; keep the last complete pair.
// Desktop resizes and browsers without an angle API can resize independently.
export function pairedScreenFrame(previous: PaperScreenFrame, next: PaperScreenFrame, mobileAngleAPI: boolean): boolean {
  const swapped = (previous.width > previous.height) !== (next.width > next.height)
  const quarterTurn = Math.abs(Math.sin((next.angle - previous.angle) * Math.PI / 180)) > 0.5
  if (quarterTurn && !swapped) return false
  if (mobileAngleAPI && swapped && screenAngle(previous.angle) === screenAngle(next.angle)) return false
  return true
}
