import test from 'node:test'
import assert from 'node:assert/strict'
import Matter from 'matter-js'
import { cameraFrame, DeviceRollTracker, interpolateSheet, localToScreen, naturalSheet, normalizeAngle, NotebookOrientationModel, rebasePoint, rotateVector, screenToLocal, unwrapAngle } from '../src/components/notebook/notebookOrientation.ts'
import { PaperPhysicsWorld, BALL_RADIUS } from '../src/components/notebook/paperPhysics.ts'
import { orientationGravity, PaperGravitySensor, screenGravity } from '../src/components/notebook/paperGravity.ts'
const near = (a: number, b: number, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`)
const nearPoint = (a: { x: number; y: number }, b: { x: number; y: number }) => { near(a.x, b.x); near(a.y, b.y) }
const portrait = { width: 393, height: 852 }
const landscape = { width: 852, height: 393 }

test('angle normalization and unwrapping retain the short continuous path in both directions', () => {
  assert.equal(normalizeAngle(360), 0); assert.equal(normalizeAngle(-450), -90)
  assert.equal(unwrapAngle(179, -179), 181)
  assert.equal(unwrapAngle(-179, 179), -181)
  assert.equal(unwrapAngle(359, 1), 361)
  assert.equal(unwrapAngle(1, 359), -1)
})

test('portrait and landscape geometry interpolate continuously, reverse, and support a landscape-natural device', () => {
  assert.deepEqual(interpolateSheet(portrait, 0), portrait)
  near(interpolateSheet(portrait, 45).width, 622.5); near(interpolateSheet(portrait, 45).height, 622.5)
  assert.deepEqual(interpolateSheet(portrait, 90), landscape)
  for (const angle of [0, 15, 30, 60, 90]) {
    const forward = interpolateSheet(portrait, angle), reverse = interpolateSheet(landscape, 90 - angle)
    near(forward.width, reverse.width); near(forward.height, reverse.height)
  }
  assert.deepEqual(naturalSheet(landscape, 90), portrait)
  assert.deepEqual(naturalSheet(landscape, 0), landscape)
})

test('orientation matrix twist follows screen-plane rotation upright and flat, including wraparound', () => {
  const upright = new DeviceRollTracker()
  near(upright.update(0, 90, 0, 0)!, 0)
  for (const angle of [20, 45, 90, 60, 0, -45, 0]) near(upright.update(90, 90 - angle, -90, 0)!, angle)
  const flat = new DeviceRollTracker()
  near(flat.update(350, 0, 0, 0)!, 0)
  near(flat.update(5, 0, 0, 0)!, 15)
  near(flat.update(350, 0, 0, 0)!, 0)
  assert.equal(flat.update(null, 0, 0, 0), 0)
})

test('flat orientation rotation stays available without inventing in-plane gravity', () => {
  const target = Object.assign(new EventTarget(), { isSecureContext: true, DeviceOrientationEvent: {} })
  const sensors = new PaperGravitySensor(target)
  const send = (alpha: number) => target.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha, beta: 0, gamma: 0 }))
  send(350); send(5)
  near(sensors.rotation()!, 15)
  nearPoint(sensors.current(), { x: 0, y: 0 })
  sensors.dispose()
})

test('camera coordinate inverse works at intermediate rotations and camera scale', () => {
  for (const rotation of [-170, -45, 0, 27, 90, 181]) {
    const frame = cameraFrame(interpolateSheet(portrait, rotation), portrait, rotation, 0, { x: 0, y: 1 })
    for (const point of [{ x: 0, y: 0 }, { x: 100, y: 300 }, { x: frame.size.width, y: frame.size.height }]) nearPoint(screenToLocal(localToScreen(point, frame), frame), point)
  }
})

test('inverse camera gravity reproduces the real screen gravity, including flat and sideways directions', () => {
  for (const rotation of [-45, 0, 45, 90]) {
    for (const gravity of [{ x: 0.4, y: 0.7 }, { x: -0.6, y: 0.2 }, { x: 0, y: 0 }]) {
      const frame = cameraFrame(interpolateSheet(portrait, rotation), portrait, rotation, 0, gravity)
      nearPoint(rotateVector({ x: frame.gravity.x * frame.scale, y: frame.gravity.y * frame.scale }, frame.angle), gravity)
    }
  }
})

test('screen-angle regression: an upright landscape phone never turns gravity toward the TOP', () => {
  // Actual 90-degree counterclockwise device rotation: natural-axis gravity is
  // left; displayed landscape gravity must be DOWN, not up.
  nearPoint(screenGravity(orientationGravity(0, -90)!, 90), { x: 0, y: 1 })
  nearPoint(screenGravity({ x: 1, y: 0 }, 270), { x: 0, y: 1 })
})

test('OS viewport rebase changes the screen basis and preserves physical camera locations and gravity', () => {
  for (const [angle, fromViewport, fromScreen, toViewport, toScreen] of [
    [45, portrait, 0, landscape, 90], [45, landscape, 90, portrait, 0],
    [-45, portrait, 0, landscape, 270], [-45, landscape, 270, portrait, 0],
  ] as const) {
    const size = interpolateSheet(portrait, angle)
    const rawGravity = { x: -Math.sin(angle * Math.PI / 180), y: Math.cos(angle * Math.PI / 180) }
    const before = cameraFrame(size, fromViewport, angle, fromScreen, screenGravity(rawGravity, fromScreen))
    const after = cameraFrame(size, toViewport, angle, toScreen, screenGravity(rawGravity, toScreen))
    near(before.scale, after.scale)
    nearPoint(before.gravity, after.gravity)
    const point = { x: 70, y: size.height - 20 }
    const p = localToScreen(point, before)
    const changedBasis = rotateVector({ x: p.x - fromViewport.width / 2, y: p.y - fromViewport.height / 2 }, fromScreen - toScreen)
    nearPoint(localToScreen(point, after), { x: changedBasis.x + toViewport.width / 2, y: changedBasis.y + toViewport.height / 2 })
  }
})

test('camera retains geometry at a discrete viewport event; reversal has no snap or full-spin wrap', () => {
  const model = new NotebookOrientationModel(portrait, 0)
  let frame = model.frame
  for (let i = 0; i < 50; i++) frame = model.update(portrait, 0, 45, { x: -0.7, y: 0.7 }, 16)
  assert.ok(frame.rotation > 44 && frame.rotation < 46)
  const before = frame
  frame = model.update(landscape, 90, 45, { x: 0.7, y: 0.7 }, 0)
  assert.deepEqual(frame.size, before.size)
  near(frame.rotation, before.rotation)
  const angle = frame.rotation
  frame = model.update(landscape, 90, 0, { x: 1, y: 0 }, 16)
  assert.ok(frame.rotation < angle && frame.rotation > 0)
  const wrapped = new NotebookOrientationModel(portrait, 0)
  for (let i = 0; i < 100; i++) wrapped.update(portrait, 0, 179, { x: 0, y: -1 }, 16)
  assert.ok(wrapped.update(portrait, 0, -179, { x: 0, y: -1 }, 16).rotation > 179)
})

test('normalized ball centres and velocity rebase preserve bottom clearance, identity and spin', () => {
  const world = new PaperPhysicsWorld(portrait, { x: 0, y: 0 })
  world.add({ note: { id: 'bottom', text: 'Keep', x: 0, y: 0, width: 156, height: 108 }, phase: 'ball', origin: { x: 90, y: portrait.height - BALL_RADIUS } }, { x: 0, y: 0 })
  const body = world.balls.get('bottom')!
  const walls = Matter.Composite.allBodies(world.engine.world).filter(body => body.isStatic).map(body => body.id)
  const id = body.id
  Matter.Body.setVelocity(body, { x: 2, y: -3 }); Matter.Body.setAngularVelocity(body, 0.07)
  for (const angle of [15, 30, 45, 60, 75, 90, 75, 60, 45, 30, 15, 0]) {
    world.resize(interpolateSheet(portrait, angle))
    near(body.position.y, interpolateSheet(portrait, angle).height - BALL_RADIUS)
    assert.equal(body.id, id)
    near(body.angularVelocity, 0.07)
    assert.deepEqual(Matter.Composite.allBodies(world.engine.world).filter(body => body.isStatic).map(body => body.id), walls)
  }
  near(body.position.x, 90); near(body.velocity.x, 2); near(body.velocity.y, -3)
  nearPoint(rebasePoint(rebasePoint({ x: 90, y: 800 }, portrait, landscape, 19), landscape, portrait, 19), { x: 90, y: 800 })
  world.dispose()
})

test('portrait -> intermediate -> landscape viewport -> portrait never rebases a bottom ball to the top', () => {
  const model = new NotebookOrientationModel(portrait, 0)
  const world = new PaperPhysicsWorld(portrait, { x: 0, y: 1 })
  world.add({ note: { id: 'regression', text: 'Keep', x: 0, y: 0, width: 156, height: 108 }, phase: 'ball', origin: { x: 200, y: 830 } }, { x: 0, y: 1 })
  const body = world.balls.get('regression')!, id = body.id
  for (const [viewport, screen, target] of [[portrait, 0, 45], [landscape, 90, 45], [landscape, 90, 90], [landscape, 90, 45], [portrait, 0, 45], [portrait, 0, 0]] as const) {
    const deviceGravity = { x: -Math.sin(target * Math.PI / 180), y: Math.cos(target * Math.PI / 180) }
    for (let i = 0; i < 30; i++) {
      const frame = model.update(viewport, screen, target, screenGravity(deviceGravity, screen), 16)
      world.resize(frame.size)
      assert.ok(body.position.y > frame.size.height * 0.8)
      assert.ok(frame.gravity.y > 0, 'gravity never flips to the top during rebase')
      assert.equal(body.id, id)
    }
  }
  world.dispose()
})

test('sensor-free fallback uses a finite smooth reframe and reaches the new viewport in both directions', () => {
  const model = new NotebookOrientationModel(portrait, 0)
  const first = model.update(landscape, 90, null, { x: 0, y: 1 }, 0)
  assert.deepEqual(first.size, portrait, 'inverse frame rebase precedes morphing')
  const middle = model.update(landscape, 90, null, { x: 0, y: 1 }, 90)
  near(middle.rotation, 45)
  assert.deepEqual(model.update(landscape, 90, null, { x: 0, y: 1 }, 90).size, landscape)
  assert.equal(model.moving, false)
  model.update(portrait, 0, null, { x: 0, y: 1 }, 0)
  near(model.update(portrait, 0, null, { x: 0, y: 1 }, 90).rotation, 45)
  assert.deepEqual(model.update(portrait, 0, null, { x: 0, y: 1 }, 90).size, portrait)
  assert.deepEqual(model.update(landscape, 90, null, { x: 0, y: 1 }, 0, true).size, landscape)
})

test('sensor-free resize-first fallback keeps its displayed shape when the OS angle arrives late', () => {
  const model = new NotebookOrientationModel(portrait, 0)
  model.update(landscape, 0, null, { x: 0, y: 1 }, 0)
  const before = model.update(landscape, 0, null, { x: 0, y: 1 }, 60)
  const rebased = model.update(landscape, 90, null, { x: 0, y: 1 }, 0)
  assert.deepEqual(rebased.size, before.size)
  near(rebased.rotation, before.rotation)
  const done = model.update(landscape, 90, null, { x: 0, y: 1 }, 180)
  assert.deepEqual(done.size, landscape)
  near(done.rotation, 90)
  assert.equal(model.moving, false)
})

test('an Android chrome inset change preserves scale at rebase and keeps gravity consistent while fitting', () => {
  const model = new NotebookOrientationModel(portrait, 0)
  for (let i = 0; i < 40; i++) model.update(portrait, 0, 45, { x: -0.7, y: 0.7 }, 16)
  const before = model.frame
  const viewport = { width: 852, height: 340 }
  const gravity = { x: 0.7, y: 0.7 }
  const rebased = model.update(viewport, 90, 45, gravity, 0)
  near(rebased.scale, before.scale)
  assert.deepEqual(rebased.size, before.size)
  const first = model.update(viewport, 90, 45, gravity, 16)
  assert.ok(first.scale < before.scale && first.scale > 0.35)
  for (let i = 0; i < 100; i++) {
    const frame = model.update(viewport, 90, 45, gravity, 16)
    nearPoint(rotateVector({ x: frame.gravity.x * frame.scale, y: frame.gravity.y * frame.scale }, frame.angle), gravity)
  }
  const fitted = cameraFrame(model.frame.size, viewport, model.frame.rotation, 90, gravity)
  near(model.frame.scale, fitted.scale, 0.001)
  assert.equal(model.moving, false)
})
