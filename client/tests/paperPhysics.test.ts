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


test('portrait bottom maps to either landscape SIDE and reverses, with rotated velocity and unchanged identity/spin', () => {
  for (const angle of [90, 270]) {
    const world = new PaperPhysicsWorld(portrait, zero, 0)
    world.add(paper('bottom', portrait.width / 2, portrait.height - BALL_RADIUS), zero)
    const body = world.balls.get('bottom')!, id = body.id
    const walls = Matter.Composite.allBodies(world.engine.world).filter(body => body.isStatic), wallIds = walls.map(body => body.id)
    Matter.Body.setVelocity(body, { x: 2, y: -3 })
    Matter.Body.setAngle(body, 0.6); Matter.Body.setAngularVelocity(body, 0.07)
    world.resize(landscape, angle)
    assert.equal(world.balls.get('bottom'), body)
    near(body.position.x, angle === 90 ? landscape.width - BALL_RADIUS : BALL_RADIUS)
    near(body.position.y, landscape.height / 2)
    near(body.velocity.x, angle === 90 ? -3 : 3)
    near(body.velocity.y, angle === 90 ? -2 : 2)
    near(body.speed, Math.hypot(2, 3))
    near(body.angle, 0.6); near(body.angularVelocity, 0.07)
    assert.deepEqual(Matter.Composite.allBodies(world.engine.world).filter(body => body.isStatic).map(body => body.id), wallIds)
    near(walls[0].bounds.max.x, 0); near(walls[1].bounds.min.x, landscape.width)
    near(walls[2].bounds.max.y, 0); near(walls[3].bounds.min.y, landscape.height)
    world.resize(portrait, 0)
    near(body.position.x, portrait.width / 2); near(body.position.y, portrait.height - BALL_RADIUS)
    near(body.velocity.x, 2); near(body.velocity.y, -3)
    near(body.angle, 0.6); near(body.angularVelocity, 0.07)
    assert.equal(body.id, id)
    assert.equal(Matter.Composite.allBodies(world.engine.world).length, 5)
    world.dispose()
  }
})

test('physical 180-degree frame change rotates position and velocity even with unchanged viewport dimensions', () => {
  const world = new PaperPhysicsWorld(portrait, zero)
  world.add(paper('bottom', 100, portrait.height - BALL_RADIUS), zero)
  const body = world.balls.get('bottom')!
  Matter.Body.setVelocity(body, { x: 2, y: 3 }); Matter.Body.setAngularVelocity(body, -0.07)
  world.resize(portrait, 180)
  near(body.position.x, portrait.width - 100); near(body.position.y, BALL_RADIUS)
  near(body.velocity.x, -2); near(body.velocity.y, -3); near(body.angularVelocity, -0.07)
  world.resize(portrait, 360)
  near(body.position.x, 100); near(body.position.y, portrait.height - BALL_RADIUS)
  near(body.velocity.x, 2); near(body.velocity.y, 3)
  assert.equal(Matter.Composite.allBodies(world.engine.world).length, 5)
  world.dispose()
})

test('multiple balls rotate rigidly without collapse/duplication, then real gravity pulls them down from the physical side', () => {
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
    for (let i = 0; i < 3; i++) world.add(paper(`side-${i}`, 130 + i * 60, portrait.height - BALL_RADIUS), sensors.current())
    const bodies = [...world.balls.values()], ids = bodies.map(body => body.id)
    const wallIds = Matter.Composite.allBodies(world.engine.world).filter(body => body.isStatic).map(body => body.id)
    target.screen.orientation.angle = angle
    send(angle === 90 ? -1 : 1, 0)
    world.resize(landscape, angle)
    assert.ok(sensors.current().y > 0.99)
    for (let i = 0; i < bodies.length; i++) {
      near(bodies[i].position.x, angle === 90 ? landscape.width - BALL_RADIUS : BALL_RADIUS)
      if (i) near(Math.hypot(bodies[i].position.x - bodies[i - 1].position.x, bodies[i].position.y - bodies[i - 1].position.y), 60)
    }
    const before = bodies.map(body => body.position.y)
    run(world, sensors.current(), 1)
    assert.ok(bodies.every((body, i) => body.position.y > before[i]), 'gravity acts from preserved side positions')
    run(world, sensors.current(), 240)
    assert.ok(bodies.every(body => body.position.y > landscape.height * 0.7))
    assert.deepEqual(bodies.map(body => body.id), ids)
    assert.deepEqual(Matter.Composite.allBodies(world.engine.world).filter(body => body.isStatic).map(body => body.id), wallIds)
    assert.equal(Matter.Composite.allBodies(world.engine.world).length, 7)
    world.dispose(); sensors.dispose()
  }
})

test('chrome size changes clamp only to the nearest valid point, retaining rotated speed and angular state', () => {
  const world = new PaperPhysicsWorld(portrait, zero)
  world.add(paper('edge', portrait.width - BALL_RADIUS, portrait.height - BALL_RADIUS), zero)
  world.add(paper('inside', portrait.width / 2, portrait.height / 2), zero)
  const body = world.balls.get('edge')!, inside = world.balls.get('inside')!
  Matter.Body.setVelocity(body, { x: 3, y: 4 }); Matter.Body.setAngularVelocity(body, 0.2)
  world.resize({ width: 820, height: 360 }, 90)
  near(body.position.x, 820 - BALL_RADIUS); near(body.position.y, BALL_RADIUS)
  near(inside.position.x, 410); near(inside.position.y, 180)
  near(body.velocity.x, 4); near(body.velocity.y, -3); near(body.speed, 5)
  near(body.angularVelocity, 0.2)
  assert.equal(Matter.Composite.allBodies(world.engine.world).length, 6)
  world.dispose()
})
