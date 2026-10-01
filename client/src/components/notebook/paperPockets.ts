import type { GraphNodeKind } from '../graph/graphTypes.ts'
import type { ScreenPoint } from './paperScreen.ts'

export type PaperPocket = ScreenPoint & { id: string; radius: number }
export type PocketClass = 'pass' | 'wedge-capable' | 'sink-capable'
export const POCKET_WEDGE_RATIO = 0.85
export const POCKET_SINK_RATIO = 1.35
export const POCKET_WEDGE_MAX_SPEED = 2.2 // CSS pixels per 60 Hz step.
export const POCKET_WEDGE_OVERLAP = 0.45 // Maximum center distance / sum of radii.
export const POCKET_WEDGE_SEAT_RATIO = 0.4 // Minimum visible offset / ball radius.
export const POCKET_FEEDBACK_DISTANCE = 16

// Fail closed when self is unknown; invitations and anonymous dots are not
// recipient-like targets. This is visual/local eligibility, never delivery.
export function isPocketTarget(id: string, kind: GraphNodeKind, selfId: string | null): boolean {
  return !!selfId && id !== selfId && (kind === 'root' || kind === 'member')
}

export function classifyPocket(ballRadius: number, pocketRadius: number): PocketClass {
  const ratio = pocketRadius / ballRadius
  if (!Number.isFinite(ratio) || ballRadius <= 0 || ratio < POCKET_WEDGE_RATIO) return 'pass'
  return ratio >= POCKET_SINK_RATIO ? 'sink-capable' : 'wedge-capable'
}

type ScreenMatrix = { a: number; b: number; c: number; d: number; e: number; f: number }
// getScreenCTM includes SVG viewBox, node placement, graph pan/zoom/rotation,
// and DOM placement. Subtract the fixed ball-layer origin to enter physics.
export function pocketInScreen(id: string, center: ScreenPoint, radius: number, matrix: ScreenMatrix, origin: ScreenPoint): PaperPocket {
  return { id, x: matrix.a * center.x + matrix.c * center.y + matrix.e - origin.x,
    y: matrix.b * center.x + matrix.d * center.y + matrix.f - origin.y,
    radius: radius * Math.min(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d)) }
}

function segmentDistance(point: ScreenPoint, from: ScreenPoint, to: ScreenPoint): number {
  const dx = to.x - from.x, dy = to.y - from.y
  const length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / length)) : 0
  return Math.hypot(point.x - from.x - t * dx, point.y - from.y - t * dy)
}

export function pocketArrival(ballRadius: number, pocket: PaperPocket, from: ScreenPoint, to: ScreenPoint, speed: number): 'sunk' | 'wedged' | null {
  const kind = classifyPocket(ballRadius, pocket.radius)
  // Sweep a large opening to avoid tunnelling at flick speed. A close fit
  // requires deep overlap AND low current speed, never a mere swept touch.
  if (kind === 'sink-capable' && segmentDistance(pocket, from, to) <= pocket.radius - ballRadius) return 'sunk'
  if (kind === 'wedge-capable' && speed <= POCKET_WEDGE_MAX_SPEED && Math.hypot(to.x - pocket.x, to.y - pocket.y) <= (ballRadius + pocket.radius) * POCKET_WEDGE_OVERLAP) return 'wedged'
  return null
}

export function readPaperPockets(deck: HTMLElement, surface: HTMLElement): PaperPocket[] {
  const origin = surface.getBoundingClientRect()
  const pockets: PaperPocket[] = []
  for (const node of deck.querySelectorAll<SVGGElement>('.graph-node[data-pocket-eligible="true"]')) {
    const circle = node.querySelector<SVGCircleElement>('.node-body')
    const matrix = circle?.getScreenCTM()
    const svg = circle?.ownerSVGElement
    if (!circle || !matrix || !svg) continue
    const pocket = pocketInScreen(node.dataset.pocketId!, { x: circle.cx.baseVal.value, y: circle.cy.baseVal.value }, circle.r.baseVal.value, matrix, origin)
    const clip = svg.getBoundingClientRect()
    const x = pocket.x + origin.x, y = pocket.y + origin.y
    if (pocket.radius > 0 && x >= Math.max(clip.left, origin.left) && x <= Math.min(clip.right, origin.right) && y >= Math.max(clip.top, origin.top) && y <= Math.min(clip.bottom, origin.bottom)) pockets.push(pocket)
  }
  return pockets
}
