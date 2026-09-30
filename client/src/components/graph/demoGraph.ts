import type { GraphTopologyNode, NodePresentation } from './graphTypes'

// Local-only sample topology. No invitation or member is saved or sent.
export const demoTopology: GraphTopologyNode[] = [
  { id: 'root', parentId: null, kind: 'root' },
  { id: 'node-1', parentId: 'root', kind: 'member' },
  { id: 'node-2', parentId: 'node-1', kind: 'member' },
  { id: 'node-3', parentId: 'node-2', kind: 'member' },
  { id: 'node-4', parentId: 'root', kind: 'anonymous' },
  { id: 'node-5', parentId: 'root', kind: 'invitation' },
]

// Names belong to a separate presentation map, never to graph topology.
export const demoPresentation: Record<string, NodePresentation> = {
  'node-1': { label: 'Mia' },
  'node-2': { label: 'Leo' },
  'node-3': { label: 'Lina' },
}
