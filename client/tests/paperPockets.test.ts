import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyPocket, isPocketTarget, pocketArrival, pocketInScreen } from '../src/components/notebook/paperPockets.ts'

test('tiny opening passes, close fit can wedge, and clearly larger opening can sink', () => {
  assert.equal(classifyPocket(19, 6), 'pass')
  assert.equal(classifyPocket(19, 19), 'wedge-capable')
  assert.equal(classifyPocket(19, 34), 'sink-capable')
  assert.equal(classifyPocket(19, 0), 'pass')
  assert.equal(classifyPocket(0, 19), 'pass')
})

test('capture requires physical clearance; wedging requires deep overlap and slow arrival', () => {
  const pocket = { id: 'other', x: 100, y: 100, radius: 19 }
  assert.equal(pocketArrival(19, pocket, { x: 90, y: 100 }, { x: 100, y: 100 }, 1), 'wedged')
  assert.equal(pocketArrival(19, pocket, { x: 90, y: 100 }, { x: 100, y: 100 }, 8), null)
  assert.equal(pocketArrival(19, pocket, { x: 80, y: 100 }, { x: 80, y: 100 }, 0), null)
  assert.equal(pocketArrival(19, { ...pocket, radius: 6 }, pocket, pocket, 0), null)
  assert.equal(pocketArrival(19, { ...pocket, radius: 34 }, { x: 90, y: 100 }, { x: 110, y: 100 }, 24), 'sunk')
  assert.equal(pocketArrival(19, { ...pocket, radius: 34 }, { x: 80, y: 80 }, { x: 120, y: 80 }, 24), null)
  assert.equal(pocketArrival(19, { ...pocket, radius: 34 }, { x: 80, y: 100 }, { x: 120, y: 100 }, 24), 'sunk', 'swept capture catches fast crossing')
})

test('screen matrix maps graph translation, rotation, scale and DOM origin into physical center/radius', () => {
  // Translate (140, 240), rotate 90 degrees, zoom 2; ball layer at (10, 20).
  const mapped = pocketInScreen('other', { x: 5, y: 10 }, 34, { a: 0, b: 2, c: -2, d: 0, e: 140, f: 240 }, { x: 10, y: 20 })
  assert.deepEqual(mapped, { id: 'other', x: 110, y: 230, radius: 68 })
  const small = pocketInScreen('other', { x: 5, y: 10 }, 34, { a: 0, b: 0.5, c: -0.5, d: 0, e: 140, f: 240 }, { x: 10, y: 20 })
  assert.equal(small.radius, 17)
})

test('self is excluded at any graph depth; unknown self and non-user-like nodes fail closed', () => {
  assert.equal(isPocketTarget('self', 'root', 'self'), false)
  assert.equal(isPocketTarget('self', 'member', 'self'), false)
  assert.equal(isPocketTarget('other', 'member', 'self'), true)
  assert.equal(isPocketTarget('other', 'root', 'self'), true)
  assert.equal(isPocketTarget('other', 'member', null), false)
  assert.equal(isPocketTarget('other', 'invitation', 'self'), false)
  assert.equal(isPocketTarget('other', 'anonymous', 'self'), false)
})
