import test from 'node:test'
import assert from 'node:assert/strict'
import { layoutGraph } from '../src/components/graph/graphLayout.ts'
import { demoTopology } from '../src/components/graph/demoGraph.ts'
import { NODE_RADII } from '../src/components/graph/graphTypes.ts'
import type { GraphTopologyNode } from '../src/components/graph/graphTypes.ts'
import { fitGraphView, initialGraphView, zoomGraphAt } from '../src/components/graph/useGraphViewport.ts'
import { getNodeLabel, translations } from '../src/i18n/translations.ts'

const root: GraphTopologyNode = { id: 'root', parentId: null, kind: 'root' }
const child = (id: string, parentId = 'root'): GraphTopologyNode => ({ id, parentId, kind: 'member' })
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} differs from ${b}`)

test('initial centering changes the view without rerooting the global layout', () => {
  const layout = layoutGraph(demoTopology)
  const size = { width: 850, height: 650 }
  const point = layout.positions.get('node-3')!
  const view = initialGraphView(layout.bounds, size, point)
  near(view.x + point.x * view.zoom, size.width / 2)
  near(view.y + point.y * view.zoom, size.height / 2)
  near(view.zoom, fitGraphView(layout.bounds, size).zoom)
  assert.deepEqual(initialGraphView(layout.bounds, size), fitGraphView(layout.bounds, size))
})

test('all roots and dangling-parent nodes render without changing a single-tree layout', () => {
  const single = layoutGraph([root, child('a')])
  const forest = layoutGraph([root, child('a'), { id: 'z-other', parentId: null, kind: 'anonymous' }, child('z-orphan', 'missing')])
  assert.equal(forest.positions.size, 4)
  assert.deepEqual(forest.positions.get('root'), single.positions.get('root'))
  assert.deepEqual(forest.positions.get('a'), single.positions.get('a'))
  assert.ok(forest.positions.get('z-other')!.x > 0)
  assert.ok(Math.abs(forest.positions.get('z-orphan')!.x - forest.positions.get('z-other')!.x) > 160)
  assert.equal(layoutGraph([]).positions.size, 0)
})

test('layout is deterministic across input order and does not modify topology', () => {
  const input = Object.freeze(demoTopology.map((node) => Object.freeze({ ...node })))
  const original = JSON.stringify(input)
  const first = layoutGraph(input)
  const reordered = layoutGraph([...input].reverse())
  assert.deepEqual([...first.positions], [...reordered.positions])
  assert.deepEqual([...first.orbits], [...reordered.orbits])
  assert.equal(JSON.stringify(input), original)
})

test('descendants use their own parent orbit and continue outward', () => {
  const layout = layoutGraph(demoTopology)
  for (const node of demoTopology) {
    if (!node.parentId) continue
    const point = layout.positions.get(node.id)!
    const parent = layout.positions.get(node.parentId)!
    near(Math.hypot(point.x - parent.x, point.y - parent.y), layout.orbits.get(node.parentId)!)
    assert.equal(point.depth, parent.depth + 1)
    assert.ok(Math.hypot(point.x, point.y) > Math.hypot(parent.x, parent.y))
  }
  assert.equal(layout.positions.get('node-3')?.depth, 3)
  assert.ok(layout.positions.has('node-4'), 'anonymous node stays in the graph')
})

test('branch growth expands ancestor orbits and allocates more angular room', () => {
  const small = [root, child('a'), child('b'), child('c')]
  const large = [...small, child('a1', 'a'), child('a2', 'a1'), child('a3', 'a2')]
  const before = layoutGraph(small)
  const after = layoutGraph(large)
  assert.ok(after.orbits.get('root')! > before.orbits.get('root')!)
  assert.ok(after.metrics.get('a')!.weight > after.metrics.get('b')!.weight)
  const angle = (id: string) => {
    const point = after.positions.get(id)!
    return Math.atan2(point.y, point.x)
  }
  assert.ok(angle('b') - angle('a') > angle('c') - angle('b'))
  const diagonal = (bounds: typeof after.bounds) => Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY)
  assert.ok(diagonal(after.bounds) > diagonal(before.bounds))
})

test('branching siblings keep their node bodies apart', () => {
  const nodes = [root]
  for (let i = 0; i < 4; i += 1) {
    const parent = `branch-${i}`
    nodes.push(child(parent))
    for (let j = 0; j < 3; j += 1) nodes.push(child(`${parent}-${j}`, parent))
  }
  const { positions } = layoutGraph(nodes)
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = positions.get(nodes[i].id)!
      const b = positions.get(nodes[j].id)!
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > NODE_RADII[nodes[i].kind] + NODE_RADII[nodes[j].kind] + 10)
    }
  }
})

test('zoom keeps the same world point under the pointer, including scale limits', () => {
  const current = { zoom: 0.8, x: 150, y: 210 }
  const anchor = { x: 380, y: 115 }
  for (const factor of [0.6, 1.4, 1000, 0.0001]) {
    const next = zoomGraphAt(current, factor, anchor)
    near((anchor.x - current.x) / current.zoom, (anchor.x - next.x) / next.zoom)
    near((anchor.y - current.y) / current.zoom, (anchor.y - next.y) / next.zoom)
    assert.ok(next.zoom > 0 && Number.isFinite(next.zoom))
  }
})

test('center fits the graph on desktop and narrow viewports', () => {
  const { bounds } = layoutGraph(demoTopology)
  for (const size of [{ width: 850, height: 650 }, { width: 284, height: 420 }]) {
    const view = fitGraphView(bounds, size)
    assert.ok(view.x + bounds.minX * view.zoom >= 0)
    assert.ok(view.y + bounds.minY * view.zoom >= 0)
    assert.ok(view.x + bounds.maxX * view.zoom <= size.width)
    assert.ok(view.y + bounds.maxY * view.zoom <= size.height)
  }
})

test('language switching preserves public names and never exposes an anonymous label', () => {
  for (const copy of Object.values(translations)) {
    assert.equal(getNodeLabel('member', 'Mia', copy), 'Mia')
    assert.equal(getNodeLabel('anonymous', 'hidden former name', copy), undefined)
    assert.equal(getNodeLabel('invitation', undefined, copy), copy.pending)
  }
  assert.equal(getNodeLabel('root', undefined, translations.de), 'Direx')
  assert.equal(getNodeLabel('root', undefined, translations.en), 'Principal')
})
