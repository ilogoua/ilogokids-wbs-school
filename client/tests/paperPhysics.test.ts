import test from 'node:test'
import assert from 'node:assert/strict'
import Matter from 'matter-js'
import { PaperPhysicsWorld, BALL_RADIUS } from '../src/components/notebook/paperPhysics.ts'
import { PaperGravitySensor } from '../src/components/notebook/paperGravity.ts'
import type { CrumpledNote } from '../src/components/notebook/paperState.ts'

const paper = (id: string, x = 100, y = 100): CrumpledNote => ({
  note: { id, text: `Saved ${id}`, x: x - 78, y: y - 54, width: 156, height: 108 }, phase: 'ball', origin: { x, y },
})
const down = { x: 0, y: 1 }
const zero = { x: 0, y: 0 }
const run = (world: PaperPhysicsWorld, gravity = down, frames = 180) => {
  for (let i = 0; i < frames; i++) world.step(1000 / 60, gravity)
}

test('four physical sheet walls and separate mutually colliding bodies; no bodies during crumpling', () => {
  const world = new PaperPhysicsWorld({ width: 400, height: 500 }, down)
  world.add({ ...paper('a'), phase: 'crumpling' }, down)
  assert.equal(world.balls.size, 0)
  world.add(paper('a'), down); world.add(paper('b', 140), down); world.add(paper('a'), down)
  const bodies = Matter.Composite.allBodies(world.engine.world)
  assert.equal(bodies.length, 6)
  assert.deepEqual(bodies.filter(body => body.isStatic).map(body => body.label).sort(), ['sheet:bottom', 'sheet:left', 'sheet:right', 'sheet:top'])
  const [a, b] = [...world.balls.values()]
  assert.notEqual(a.id, b.id)
  assert.equal(a.collisionFilter.group, 0)
  assert.ok(a.collisionFilter.mask & b.collisionFilter.category)
  assert.ok(b.collisionFilter.mask & a.collisionFilter.category)
  assert.deepEqual(a.position, { x: 100, y: 100 })
  assert.deepEqual(a.velocity, zero, 'no artificial launch')
  world.dispose()
})

test('already tilted sensor gravity is installed on insertion and the VERY FIRST step moves diagonally', () => {
  const target = Object.assign(new EventTarget(), { isSecureContext: true, DeviceMotionEvent: {} })
  const sensors = new PaperGravitySensor(target)
  target.dispatchEvent(Object.assign(new Event('devicemotion'), { accelerationIncludingGravity: { x: -4.905, y: 4.905, z: 6.936 }, acceleration: null }))
  const world = new PaperPhysicsWorld({ width: 400, height: 500 }, sensors.current())
  world.add(paper('tilted'), sensors.current())
  assert.equal(world.engine.gravity.x, 0.5); assert.equal(world.engine.gravity.y, 0.5)
  world.step(1000 / 60, sensors.current())
  const body = world.balls.get('tilted')!
  assert.ok(body.position.x > 100); assert.ok(body.position.y > 100)
  assert.ok(Math.abs(body.velocity.x - body.velocity.y) < 1e-6)
  world.dispose(); sensors.dispose()
})

test('flat screen has no artificial downward acceleration; normal fall bounces lightly and settles', () => {
  const world = new PaperPhysicsWorld({ width: 400, height: 500 }, zero)
  world.add(paper('a'), zero)
  run(world, zero, 60)
  const body = world.balls.get('a')!
  assert.deepEqual(body.position, { x: 100, y: 100 })
  let bounced = false
  for (let i = 0; i < 600; i++) {
    world.step(1000 / 60, down)
    if (body.velocity.y < -0.1) bounced = true
  }
  assert.equal(bounced, true)
  assert.ok(Math.abs(body.position.x - 100) < 2, 'no decorative wandering')
  assert.ok(body.position.y > 500 - BALL_RADIUS - 2)
  assert.ok(body.speed < 0.1, 'paper settles')
  world.dispose()
})

test('actual collision transfers motion between balls', () => {
  const world = new PaperPhysicsWorld({ width: 400, height: 500 }, zero)
  world.add(paper('a'), zero); world.add(paper('b', 150), zero)
  const a = world.balls.get('a')!, b = world.balls.get('b')!
  Matter.Body.setVelocity(a, { x: 4, y: 0 })
  run(world, zero, 30)
  assert.ok(b.position.x > 150, 'second ball is pushed')
  assert.ok(a.position.x < b.position.x - 30, 'balls do not pass through one another')
  world.dispose()
})

test('multiple balls collect, wake on changed gravity, stay behind all four edges and survive resize', () => {
  const world = new PaperPhysicsWorld({ width: 400, height: 500 }, down)
  for (let i = 0; i < 3; i++) world.add(paper(String(i), 80 + i * 50), down)
  run(world, down, 600)
  const before = [...world.balls.values()].map(body => body.position.x)
  run(world, { x: 0.7, y: 0.7 }, 300)
  assert.ok([...world.balls.values()].every((body, i) => body.position.x > before[i] + 30))
  const ids = [...world.balls.values()].map(body => body.id)
  world.resize({ width: 500, height: 240 })
  assert.deepEqual([...world.balls.values()].map(body => body.id), ids)
  for (const gravity of [{ x: -1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 0 }, down]) {
    run(world, gravity, 360)
    for (const body of world.balls.values()) {
      assert.ok(body.position.x >= BALL_RADIUS - 2 && body.position.x <= 500 - BALL_RADIUS + 2)
      assert.ok(body.position.y >= BALL_RADIUS - 2 && body.position.y <= 240 - BALL_RADIUS + 2)
    }
  }
  assert.equal(Matter.Composite.allBodies(world.engine.world).length, 7)
  world.dispose()
})

test('inactive page pauses the same world; dispose clears bodies and further work', () => {
  const world = new PaperPhysicsWorld({ width: 400, height: 500 }, down)
  world.add(paper('a'), down)
  const body = world.balls.get('a')!, position = { ...body.position }
  world.setActive(false); run(world)
  assert.deepEqual(body.position, position)
  world.setActive(true); world.add(paper('a'), down); run(world, down, 1)
  assert.equal(world.balls.size, 1)
  assert.ok(body.position.y > position.y)
  world.dispose(); world.add(paper('late'), down); run(world)
  assert.equal(world.balls.size, 0)
  assert.equal(Matter.Composite.allBodies(world.engine.world).length, 0)
})

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`)
const portrait = { width: 393, height: 852 }, landscape = { width: 852, height: 393 }

test('discrete portrait/landscape rebase preserves body identity, normalized location, velocity, angle and spin', () => {
  const world = new PaperPhysicsWorld(portrait, zero)
  world.add(paper('bottom', 100, portrait.height - BALL_RADIUS), zero)
  const body = world.balls.get('bottom')!
  const walls = Matter.Composite.allBodies(world.engine.world).filter(body => body.isStatic)
  const wallIds = walls.map(body => body.id)
  const id = body.id
  Matter.Body.setVelocity(body, { x: 2, y: -3 })
  Matter.Body.setAngle(body, 0.6)
  Matter.Body.setAngularVelocity(body, 0.07)
  world.resize(landscape)
  assert.equal(world.balls.get('bottom'), body)
  assert.equal(body.id, id)
  near(body.position.x, BALL_RADIUS + (100 - BALL_RADIUS) * (landscape.width - BALL_RADIUS * 2) / (portrait.width - BALL_RADIUS * 2))
  near(body.position.y, landscape.height - BALL_RADIUS)
  near(body.velocity.x, 2 * (landscape.width - BALL_RADIUS * 2) / (portrait.width - BALL_RADIUS * 2))
  near(body.velocity.y, -3 * (landscape.height - BALL_RADIUS * 2) / (portrait.height - BALL_RADIUS * 2))
  near(body.angle, 0.6); near(body.angularVelocity, 0.07)
  assert.deepEqual(Matter.Composite.allBodies(world.engine.world).filter(body => body.isStatic).map(body => body.id), wallIds)
  // Wall inner edges remain exactly at the new sheet bounds.
  near(walls[0].bounds.max.x, 0); near(walls[1].bounds.min.x, landscape.width)
  near(walls[2].bounds.max.y, 0); near(walls[3].bounds.min.y, landscape.height)
  world.resize(portrait)
  near(body.position.x, 100); near(body.position.y, portrait.height - BALL_RADIUS)
  near(body.velocity.x, 2); near(body.velocity.y, -3)
  near(body.angle, 0.6); near(body.angularVelocity, 0.07)
  assert.equal(Matter.Composite.allBodies(world.engine.world).length, 5)
  assert.deepEqual(Matter.Composite.allBodies(world.engine.world).filter(body => body.isStatic).map(body => body.id), wallIds)
  world.dispose()
})

test('real gravity and bottom balls remain below through both discrete screen orientations and reversal', () => {
  for (const angle of [90, 270]) {
    let time = 0
    const target = Object.assign(new EventTarget(), { isSecureContext: true, DeviceMotionEvent: {}, screen: { orientation: { angle: 0 } } })
    const sensors = new PaperGravitySensor(target, () => time)
    const send = (x: number, y: number) => {
      time += 3000
      target.dispatchEvent(Object.assign(new Event('devicemotion'), { accelerationIncludingGravity: { x: -x * 9.81, y: y * 9.81, z: 0 }, acceleration: null }))
    }
    send(0, 1)
    const world = new PaperPhysicsWorld(portrait, sensors.current())
    for (let i = 0; i < 3; i++) world.add(paper(`bottom-${i}`, 80 + i * 60, portrait.height - BALL_RADIUS), sensors.current())
    const bodies = [...world.balls.values()], ids = bodies.map(body => body.id)
    const wallIds = Matter.Composite.allBodies(world.engine.world).filter(body => body.isStatic).map(body => body.id)
    target.screen.orientation.angle = angle
    send(angle === 90 ? -1 : 1, 0)
    world.resize(landscape)
    assert.ok(sensors.current().y > 0.99, 'gravity points to the displayed bottom')
    run(world, sensors.current(), 180)
    assert.ok(bodies.every(body => body.position.y > landscape.height * 0.85))
    target.screen.orientation.angle = 0
    send(0, 1)
    world.resize(portrait)
    assert.ok(sensors.current().y > 0.99)
    run(world, sensors.current(), 180)
    assert.ok(bodies.every(body => body.position.y > portrait.height * 0.85))
    assert.deepEqual(bodies.map(body => body.id), ids)
    assert.deepEqual(Matter.Composite.allBodies(world.engine.world).filter(body => body.isStatic).map(body => body.id), wallIds)
    assert.equal(Matter.Composite.allBodies(world.engine.world).length, 7)
    world.dispose(); sensors.dispose()
  }
})
