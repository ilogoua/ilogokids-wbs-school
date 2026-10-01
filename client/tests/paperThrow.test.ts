import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_THROW_SPEED, samplePointer, throwVelocity } from '../src/components/notebook/paperThrow.ts'

test('throw follows the recent flick, not the displacement since initial grab; speed scales with motion', () => {
  const initial = { x: 900, y: 700, time: 0 }
  const slow = throwVelocity([initial, { x: 100, y: 100, time: 300 }, { x: 112, y: 94, time: 360 }])
  const fast = throwVelocity([initial, { x: 100, y: 100, time: 300 }, { x: 148, y: 76, time: 360 }])
  assert.ok(slow.x > 0 && slow.y < 0)
  assert.ok(Math.abs(fast.x / slow.x - 4) < 1e-6)
  assert.ok(Math.abs(fast.y / slow.y - 4) < 1e-6)
})

test('stationary release expires earlier travel, and extreme flick is clamped as a vector', () => {
  let samples = samplePointer([], { x: 0, y: 0, time: 0 })
  samples = samplePointer(samples, { x: 100, y: 100, time: 50 })
  samples = samplePointer(samples, { x: 100, y: 100, time: 200 })
  assert.deepEqual(throwVelocity(samples), { x: 0, y: 0 })
  const velocity = throwVelocity([{ x: 0, y: 0, time: 0 }, { x: 3000, y: -4000, time: 10 }])
  assert.ok(Math.abs(Math.hypot(velocity.x, velocity.y) - MAX_THROW_SPEED) < 1e-6)
  assert.ok(Math.abs(velocity.y / velocity.x + 4 / 3) < 1e-6)
})

test('coalesced/duplicate timestamps are safe; malformed or out-of-order events cannot spike a throw', () => {
  let samples = samplePointer([], { x: 1, y: 1, time: 10 })
  samples = samplePointer(samples, { x: 2, y: 2, time: 10 })
  assert.equal(samples.length, 1)
  const valid = samples
  assert.equal(samplePointer(samples, { x: NaN, y: 2, time: 11 }), valid)
  assert.equal(samplePointer(samples, { x: 100, y: 2, time: 9 }), valid)
  assert.deepEqual(throwVelocity(samples), { x: 0, y: 0 })
  samples = samplePointer(samples, { x: 20, y: 20, time: 12 })
  assert.deepEqual(throwVelocity(samples), { x: 0, y: 0 })
})
