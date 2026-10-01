import test from 'node:test'
import assert from 'node:assert/strict'
import { pairedScreenFrame, reframeScreenPoint, rotateScreenVector } from '../src/components/notebook/paperScreen.ts'
import { screenGravity } from '../src/components/notebook/paperGravity.ts'
const portrait = { width: 393, height: 852, angle: 0 }
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`)

test('clockwise and counterclockwise physical frame rotations agree with screen gravity conventions', () => {
  const bottom = { x: 393 / 2, y: 852 - 19 }
  for (const angle of [90, 270, -90]) {
    const next = { width: 852, height: 393, angle }
    const point = reframeScreenPoint(bottom, portrait, next)
    near(point.x, angle === 90 ? 833 : 19); near(point.y, 393 / 2)
    const back = reframeScreenPoint(point, next, portrait)
    near(back.x, bottom.x); near(back.y, bottom.y)
    const vector = rotateScreenVector({ x: 2, y: 3 }, 0, angle)
    const gravity = screenGravity({ x: 2, y: 3 }, angle)
    near(vector.x, gravity.x); near(vector.y, gravity.y)
    near(Math.hypot(vector.x, vector.y), Math.hypot(2, 3))
  }
})

test('asymmetric points/distances survive all frame changes and round trips without normalization or mirroring', () => {
  for (const oldAngle of [0, 90, 180, 270]) {
    for (const angle of [0, 90, 180, 270]) {
      const from = { width: 393, height: 852, angle: oldAngle }
      const to = { width: 852, height: 393, angle }
      const a = { x: 71, y: 220 }, b = { x: 151, y: 280 }
      const mapped = reframeScreenPoint(a, from, to), mappedB = reframeScreenPoint(b, from, to)
      const back = reframeScreenPoint(mapped, to, from)
      near(back.x, a.x); near(back.y, a.y)
      near(Math.hypot(mapped.x - mappedB.x, mapped.y - mappedB.y), 100)
    }
  }
})

test('same-angle viewport resizing translates centres while preserving pixel distances', () => {
  const next = { width: 400, height: 800, angle: 0 }
  const point = reframeScreenPoint({ x: 100, y: 300 }, portrait, next)
  near(point.x, 103.5); near(point.y, 274)
})

test('angle-first and resize-first callbacks wait for one coherent frame; 180 degrees and fallback resize remain valid', () => {
  const next = { width: 852, height: 393, angle: 90 }
  assert.equal(pairedScreenFrame(portrait, { ...portrait, angle: 90 }, true), false)
  assert.equal(pairedScreenFrame(portrait, { ...next, angle: 0 }, true), false)
  assert.equal(pairedScreenFrame(portrait, next, true), true)
  assert.equal(pairedScreenFrame(next, { ...next, angle: 0 }, true), false)
  assert.equal(pairedScreenFrame(next, { ...portrait, angle: 90 }, true), false)
  assert.equal(pairedScreenFrame(next, portrait, true), true)
  assert.equal(pairedScreenFrame(portrait, { ...portrait, angle: 180 }, true), true)
  assert.equal(pairedScreenFrame(portrait, { ...next, angle: 0 }, false), true)
})
