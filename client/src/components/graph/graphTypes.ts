export type GraphNodeKind = 'root' | 'member' | 'invitation' | 'anonymous'

// Topology stays independent from display names and any personal profile fields.
export type GraphTopologyNode = {
  id: string
  parentId: string | null
  kind: GraphNodeKind
}

export type NodePresentation = {
  label: string
}

export type GraphPoint = {
  x: number
  y: number
  depth: number
}

export type GraphLayout = {
  positions: Map<string, GraphPoint>
  children: Map<string, string[]>
  metrics: Map<string, SubtreeMetrics>
  orbits: Map<string, number>
  bounds: GraphBounds
}

export type SubtreeMetrics = {
  size: number
  maxDepth: number
  weight: number
}

export type GraphBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export const NODE_RADII: Record<GraphNodeKind, number> = {
  root: 58,
  member: 34,
  invitation: 32,
  anonymous: 16,
}
