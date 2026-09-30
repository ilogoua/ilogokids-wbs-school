import { NODE_RADII } from './graphTypes.ts'
import type { GraphBounds, GraphLayout, GraphPoint, GraphTopologyNode, SubtreeMetrics } from './graphTypes'

const TAU = Math.PI * 2
const ROOT_ARC = TAU * 0.72
const BRANCH_GAP = 0.14

/** Two passes: measure subtrees, then place children on parent-local orbits. */
export function layoutGraph(nodes: readonly GraphTopologyNode[]): GraphLayout {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const children = new Map<string, string[]>()
  const positions = new Map<string, GraphPoint>()
  const metrics = new Map<string, SubtreeMetrics>()
  const orbits = new Map<string, number>()
  const bounds: GraphBounds = { minX: -100, minY: -100, maxX: 100, maxY: 100 }
  const result = { positions, children, metrics, orbits, bounds }

  for (const node of nodes) {
    if (node.parentId && byId.has(node.parentId)) {
      const siblings = children.get(node.parentId) ?? []
      siblings.push(node.id)
      children.set(node.parentId, siblings)
    }
  }
  // IDs provide stable sibling ordering, including when an API reorders its results.
  for (const siblings of children.values()) siblings.sort()
  const root = nodes.filter((node) => node.parentId === null).sort((a, b) => a.id < b.id ? -1 : 1)[0]
  if (!root) return result

  // Pass 1: size and depth measure how much room each branch needs.
  function measure(id: string): SubtreeMetrics {
    const branches = (children.get(id) ?? []).map(measure)
    const size = 1 + branches.reduce((sum, branch) => sum + branch.size, 0)
    const maxDepth = branches.reduce((depth, branch) => Math.max(depth, branch.maxDepth + 1), 0)
    const metric = { size, maxDepth, weight: Math.sqrt(size) * (1 + maxDepth * 0.25) }
    metrics.set(id, metric)
    return metric
  }
  measure(root.id)

  // Pass 2: weighted sectors stay inside the parent's sector. All descendant
  // vectors point outward, so branches expand without collapsing onto the root.
  function place(id: string, point: GraphPoint, bearing: number, arc: number): void {
    positions.set(id, point)
    const childIds = children.get(id) ?? []
    if (childIds.length === 0) return
    const parentMetric = metrics.get(id)!
    const totalWeight = childIds.reduce((sum, childId) => sum + metrics.get(childId)!.weight, 0)
    const sectors = childIds.map((childId) => arc * metrics.get(childId)!.weight / totalWeight)
    const baseRadius = point.depth === 0 ? 160 : 115
    const growthRadius = baseRadius + 12 * Math.sqrt(parentMetric.size - 1) + 16 * parentMetric.maxDepth
    // A narrow sector needs a longer radius to leave room for nodes and labels.
    const spacingRadius = childIds.length < 2 ? 0 : Math.max(...sectors.map((sector) =>
      70 / Math.sin(Math.min(Math.PI / 2, sector * (1 - BRANCH_GAP) / 2)),
    ))
    const radius = Math.max(growthRadius, spacingRadius)
    orbits.set(id, radius)
    let edge = bearing - arc / 2

    childIds.forEach((childId, index) => {
      const sector = sectors[index]
      const angle = edge + sector / 2
      // Restrict descendant offsets to the forward half-plane and leave a gutter
      // between sibling sectors. Single-child chains retain their direction.
      const childArc = Math.min(Math.PI * 0.72, sector * (1 - BRANCH_GAP))
      place(childId, {
        x: point.x + Math.cos(angle) * radius,
        y: point.y + Math.sin(angle) * radius,
        depth: point.depth + 1,
      }, angle, childArc)
      edge += sector
    })
  }
  place(root.id, { x: 0, y: 0, depth: 0 }, 0, ROOT_ARC)

  // Include full orbit rings, count markers and label room for center/fit-to-view.
  for (const [id, point] of positions) {
    const radius = NODE_RADII[byId.get(id)!.kind]
    const orbit = orbits.get(id) ?? 0
    const halfWidth = Math.max(orbit, radius + 24, byId.get(id)!.kind === 'anonymous' ? 24 : 92)
    bounds.minX = Math.min(bounds.minX, point.x - halfWidth)
    bounds.maxX = Math.max(bounds.maxX, point.x + halfWidth)
    bounds.minY = Math.min(bounds.minY, point.y - Math.max(orbit, radius + 24))
    bounds.maxY = Math.max(bounds.maxY, point.y + Math.max(orbit, radius + 56))
  }
  return result
}
