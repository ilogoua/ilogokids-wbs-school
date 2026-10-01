import test from 'node:test'
import assert from 'node:assert/strict'
import { motionGravity, orientationGravity, screenGravity, smoothGravity, deadZone, PaperGravitySensor, needsSensorPermission } from '../src/components/notebook/paperGravity.ts'
import type { SensorWindow } from '../src/components/notebook/paperGravity.ts'
const near = (value: number, expected: number) => assert.ok(Math.abs(value - expected) < 1e-6, `${value} != ${expected}`)

function fixture() {
  const target = Object.assign(new EventTarget(), { isSecureContext: true, DeviceMotionEvent: {}, DeviceOrientationEvent: {}, screen: { orientation: { angle: 0 } } }) as SensorWindow
  const send = (name: string, values: object) => target.dispatchEvent(Object.assign(new Event(name), values))
  return { target, send }
}

test('motion proper acceleration projects actual gravity, subtracting linear motion', () => {
  assert.deepEqual(motionGravity({ x: 0, y: 9.81, z: 0 }, null), { x: -0, y: 1 })
  assert.deepEqual(motionGravity({ x: 0, y: 0, z: 9.81 }, null), { x: -0, y: 0 })
  const diagonal = motionGravity({ x: -4.905, y: 4.905, z: 6.936 }, null)!
  near(diagonal.x, 0.5); near(diagonal.y, 0.5)
  assert.deepEqual(motionGravity({ x: 2, y: 12.81, z: 0 }, { x: 2, y: 3, z: 0 }), { x: -0, y: 1 })
  assert.equal(motionGravity(null, null), null)
  assert.equal(motionGravity({ x: null, y: 0, z: 0 }, null), null)
  assert.equal(motionGravity({ x: NaN, y: 0, z: 0 }, null), null)
})

test('orientation projection is flat zero, upright down, upside-down up, and tilted sideways', () => {
  assert.deepEqual(orientationGravity(0, 0), { x: 0, y: 0 })
  const upright = orientationGravity(90, 0)!
  near(upright.x, 0); near(upright.y, 1)
  near(orientationGravity(-90, 0)!.y, -1)
  near(orientationGravity(0, 30)!.x, 0.5)
  near(orientationGravity(0, -30)!.x, -0.5)
  const foldedBack = orientationGravity(150, 30)!
  near(foldedBack.x, -Math.sqrt(3) / 4); near(foldedBack.y, 0.5)
  assert.equal(orientationGravity(null, 0), null)
  assert.equal(orientationGravity(0, Infinity), null)
})

test('screen rotation compensates 0, 90, 180 and 270 degrees', () => {
  for (const [angle, expected] of [[0, [0, 1]], [90, [1, 0]], [180, [0, -1]], [270, [-1, 0]]] as const) {
    const vector = screenGravity({ x: 0, y: 1 }, angle)
    near(vector.x, expected[0]); near(vector.y, expected[1])
  }
  // Natural top points left in landscape, so gravity along natural left
  // maps to the displayed bottom.
  near(screenGravity({ x: -1, y: 0 }, 90).y, 1)
})

test('first reading is unbiased; smoothing is time-based, extreme inputs clamp, tremor has dead zone', () => {
  assert.deepEqual(smoothGravity(null, { x: 0.6, y: 0.8 }, 0), { x: 0.6, y: 0.8 })
  const clamped = smoothGravity(null, { x: 10, y: 10 }, 100)
  near(Math.hypot(clamped.x, clamped.y), 1)
  const half = smoothGravity({ x: 0, y: 1 }, { x: 1, y: 0 }, 70)
  const twice = smoothGravity(half, { x: 1, y: 0 }, 70)
  const once = smoothGravity({ x: 0, y: 1 }, { x: 1, y: 0 }, 140)
  near(twice.x, once.x); near(twice.y, once.y)
  assert.deepEqual(deadZone({ x: 0.02, y: -0.03 }), { x: 0, y: 0 })
  assert.deepEqual(deadZone({ x: 0.3, y: 0.01 }), { x: 0.3, y: 0 })
})

test('sensor fallback handles absent, null or insecure APIs; orientation works without motion', () => {
  const { target, send } = fixture()
  const sensor = new PaperGravitySensor(target)
  assert.deepEqual(sensor.current(), { x: 0, y: 1 })
  send('devicemotion', { accelerationIncludingGravity: null, acceleration: null })
  assert.deepEqual(sensor.current(), { x: 0, y: 1 })
  send('deviceorientation', { beta: 0, gamma: 30 })
  near(sensor.current().x, 0.5); near(sensor.current().y, 0)
  sensor.dispose()
  const insecure = new PaperGravitySensor(Object.assign(target, { isSecureContext: false }))
  send('deviceorientation', { beta: 0, gamma: 30 })
  assert.deepEqual(insecure.current(), { x: 0, y: 1 })
  insecure.dispose()
  const absent = new PaperGravitySensor(Object.assign(new EventTarget(), { isSecureContext: true }))
  assert.deepEqual(absent.current(), { x: 0, y: 1 }); absent.dispose()
})

test('latest motion is ready before any body exists; orientation compensates even without new motion', () => {
  const { target, send } = fixture()
  const sensor = new PaperGravitySensor(target)
  send('devicemotion', { accelerationIncludingGravity: { x: -4.905, y: 4.905, z: 6.936 }, acceleration: null })
  near(sensor.current().x, 0.5); near(sensor.current().y, 0.5)
  target.screen!.orientation!.angle = 90
  near(sensor.current().x, 0.5); near(sensor.current().y, -0.5)
  sensor.dispose()
})

test('stopped motion stream yields to orientation and screen.orientation has a legacy fallback', () => {
  const { target, send } = fixture()
  let clock = 10
  const sensor = new PaperGravitySensor(target, () => clock)
  send('devicemotion', { accelerationIncludingGravity: { x: 0, y: 9.81, z: 0 }, acceleration: null })
  send('deviceorientation', { beta: 0, gamma: 0 })
  assert.equal(sensor.current().y, 1)
  clock = 1100
  assert.deepEqual(sensor.current(), { x: 0, y: 0 })
  target.screen = undefined; target.orientation = 90
  send('devicemotion', { accelerationIncludingGravity: { x: 0, y: 9.81, z: 0 }, acceleration: null })
  near(sensor.current().x, 1); near(sensor.current().y, 0)
  sensor.dispose()
})

test('permission is user-triggered; denial is safe, disposal removes listeners and blocks late grants', async () => {
  const { target, send } = fixture()
  let requests = 0
  target.DeviceMotionEvent = { requestPermission: async () => { requests++; return 'denied' } }
  target.DeviceOrientationEvent = { requestPermission: async () => { requests++; return 'granted' } }
  assert.equal(needsSensorPermission(target), true)
  const sensor = new PaperGravitySensor(target)
  assert.equal(requests, 0)
  await sensor.requestPermission()
  assert.equal(requests, 2)
  send('devicemotion', { accelerationIncludingGravity: { x: -9.81, y: 0, z: 0 } })
  assert.deepEqual(sensor.current(), { x: 0, y: 1 })
  send('deviceorientation', { beta: 0, gamma: 30 })
  near(sensor.current().x, 0.5)
  sensor.dispose()
  send('deviceorientation', { beta: 90, gamma: 0 })
  near(sensor.current().x, 0.5)
  const disposed = new PaperGravitySensor(target)
  const pending = disposed.requestPermission()
  disposed.dispose(); await pending
  send('deviceorientation', { beta: 0, gamma: 30 })
  assert.deepEqual(disposed.current(), { x: 0, y: 1 })
})
