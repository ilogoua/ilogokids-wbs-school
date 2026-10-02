import test from 'node:test'
import assert from 'node:assert/strict'
import { rotateGraphAt, transformGraphGesture, translateGraphBy, zoomGraphAt } from '../src/components/graph/graphTransform.ts'
import type { GraphPointer, GraphView } from '../src/components/graph/graphTransform.ts'

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} differs from ${b}`)
const project = (view: GraphView, point: GraphPointer) => {
  const angle = view.rotation * Math.PI / 180
  return { x: view.x + view.zoom * (Math.cos(angle) * point.x - Math.sin(angle) * point.y),
    y: view.y + view.zoom * (Math.sin(angle) * point.x + Math.cos(angle) * point.y) }
}
const start: GraphView = { x: 100, y: 200, zoom: 0.8, rotation: 32 }

test('rotation around an anchor preserves its world position and translation is independent of zoom/rotation', () => {
  const world = { x: 120, y: -50 }
  const anchor = project(start, world)
  for (const degrees of [-5, 5]) {
    const next = rotateGraphAt(start, degrees, anchor)
    near(next.rotation, start.rotation + degrees)
    near(next.zoom, start.zoom)
    const at = project(next, world)
    near(at.x, anchor.x); near(at.y, anchor.y)
  }
  assert.deepEqual(translateGraphBy(start, { x: -32, y: 32 }), { ...start, x: 68, y: 232 })
})

test('one pointer translates without bounds, changing neither scale nor rotation', () => {
  assert.deepEqual(transformGraphGesture(start, [{ x: 20, y: 30 }], [{ x: -2000, y: 4000 }]),
    { ...start, x: -1920, y: 4170 })
})

test('two pointers pan, pinch and rotate around their moving midpoint in the same gesture', () => {
  const worldA = { x: -40, y: 0 }, worldB = { x: 40, y: 0 }
  const before = [project(start, worldA), project(start, worldB)]
  const expected = { x: 320, y: -25, zoom: 1.6, rotation: 112 }
  const after = [project(expected, worldA), project(expected, worldB)]
  const next = transformGraphGesture(start, before, after)
  near(next.x, expected.x); near(next.y, expected.y)
  near(next.zoom, expected.zoom); near(next.rotation, expected.rotation)
})

test('scale clamps preserve the world anchor even when graph is already rotated', () => {
  const anchor = { x: 250, y: 170 }
  for (const factor of [10000, 0.00001]) {
    const next = zoomGraphAt(start, factor, anchor)
    near((anchor.x - next.x) / next.zoom, (anchor.x - start.x) / start.zoom)
    near((anchor.y - next.y) / next.zoom, (anchor.y - start.y) / start.zoom)
    assert.ok(next.zoom >= 0.12 && next.zoom <= 2.6)
    assert.equal(next.rotation, start.rotation)
  }
})

test('angle crossing the 180 degree boundary takes the short continuous path', () => {
  const pair = (degrees: number) => [{ x: 0, y: 0 }, { x: 100 * Math.cos(degrees * Math.PI / 180), y: 100 * Math.sin(degrees * Math.PI / 180) }]
  const next = transformGraphGesture(start, pair(179), pair(-179))
  near(next.rotation, start.rotation + 2)
})

test('incremental rotation supports a full turn without resetting translation or scale', () => {
  const pair = (degrees: number) => [{ x: 50 - 30 * Math.cos(degrees * Math.PI / 180), y: 50 - 30 * Math.sin(degrees * Math.PI / 180) },
    { x: 50 + 30 * Math.cos(degrees * Math.PI / 180), y: 50 + 30 * Math.sin(degrees * Math.PI / 180) }]
  let view = start
  for (let angle = 0; angle < 360; angle += 10) view = transformGraphGesture(view, pair(angle), pair(angle + 10))
  near(view.rotation, start.rotation + 360); near(view.zoom, start.zoom)
  near(view.x, start.x); near(view.y, start.y)
})

test('coincident fingers stay finite and dropping to one finger preserves the current view', () => {
  const pinched = transformGraphGesture(start, [{ x: 10, y: 20 }, { x: 10, y: 20 }], [{ x: 30, y: 50 }, { x: 30, y: 50 }])
  assert.deepEqual(pinched, { ...start, x: 120, y: 230 })
  assert.deepEqual(transformGraphGesture(pinched, [{ x: 30, y: 50 }], [{ x: 30, y: 50 }]), pinched)
  assert.deepEqual(transformGraphGesture(pinched, [], []), pinched)
})
