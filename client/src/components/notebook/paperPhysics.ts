import Matter from 'matter-js'
import type { CrumpledNote } from './paperState.ts'
import type { Gravity } from './paperGravity.ts'
import { reframeScreenPoint, rotateScreenVector, screenAngle } from './paperScreen.ts'
import type { PaperScreenFrame } from './paperScreen.ts'
import { classifyPocket, pocketArrival, POCKET_WEDGE_SEAT_RATIO } from './paperPockets.ts'
import type { PaperPocket } from './paperPockets.ts'

export const BALL_RADIUS = 19
type SheetSize = { width: number; height: number }
export type BallState = { phase: 'free' | 'held' | 'wedged' | 'sunk'; pocketId?: string; offset?: { x: number; y: number } }
const { Engine, Bodies, Body, Composite, Sleeping } = Matter

export class PaperPhysicsWorld {
  readonly engine = Engine.create({ enableSleeping: true })
  readonly balls = new Map<string, Matter.Body>()
  readonly states = new Map<string, BallState>()
  private held: { id: string; pointerId: number; offset: { x: number; y: number }; mask: number } | null = null
  private pockets: PaperPocket[] = []
  private boundaries: Matter.Body[] = []
  private size: SheetSize = { width: 0, height: 0 }
  private angle = 0
  private wakeGravity: Gravity = { x: 0, y: 0 }
  private active = true
  private disposed = false

  constructor(size: SheetSize, gravity: Gravity, angle = 0) {
    this.resize(size, angle)
    this.setGravity(gravity)
  }

  setGravity(gravity: Gravity) {
    if (Math.hypot(gravity.x - this.wakeGravity.x, gravity.y - this.wakeGravity.y) > 0.025) {
      for (const body of this.balls.values()) Sleeping.set(body, false)
      this.wakeGravity = { ...gravity }
    }
    Object.assign(this.engine.gravity, gravity, { scale: 0.001 })
  }

  add(paper: CrumpledNote, gravity: Gravity) {
    if (this.disposed || paper.phase !== 'ball' || this.balls.has(paper.note.id)) return
    // Install CURRENT gravity before insertion, as well as before every step.
    this.setGravity(gravity)
    const body = Bodies.circle(paper.origin.x, paper.origin.y, BALL_RADIUS, {
      label: `paper:${paper.note.id}`, restitution: 0.18, friction: 0.5,
      frictionStatic: 0.9, frictionAir: 0.025, density: 0.0006, sleepThreshold: 45,
    })
    this.contain(body)
    this.balls.set(paper.note.id, body)
    this.states.set(paper.note.id, { phase: 'free' })
    Composite.add(this.engine.world, body)
  }

  get frame(): PaperScreenFrame { return { ...this.size, angle: this.angle } }

  grab(id: string, pointerId: number, point: { x: number; y: number }): boolean {
    const body = this.balls.get(id)
    if (!this.active || this.disposed || this.held || !body || this.states.get(id)?.phase === 'sunk') return false
    // Controlled static body: no gravity drift, no spring jitter, and no
    // collision impulses fighting the finger. Restore the original material.
    Body.setStatic(body, false)
    this.held = { id, pointerId, offset: { x: body.position.x - point.x, y: body.position.y - point.y }, mask: body.collisionFilter.mask ?? 0xFFFFFFFF }
    Body.setStatic(body, true)
    body.collisionFilter.mask = 0
    Body.setVelocity(body, { x: 0, y: 0 })
    this.states.set(id, { phase: 'held' })
    return true
  }

  moveGrab(pointerId: number, point: { x: number; y: number }) {
    if (!this.held || this.held.pointerId !== pointerId) return
    const body = this.balls.get(this.held.id)!
    Body.setPosition(body, { x: point.x + this.held.offset.x, y: point.y + this.held.offset.y })
    this.contain(body, false)
    Body.setVelocity(body, { x: 0, y: 0 })
  }

  releaseGrab(pointerId: number, velocity = { x: 0, y: 0 }) {
    if (!this.held || this.held.pointerId !== pointerId) return
    const { id, mask } = this.held
    const body = this.balls.get(id)!
    this.held = null
    Body.setStatic(body, false)
    body.collisionFilter.mask = mask
    Body.setVelocity(body, velocity)
    Sleeping.set(body, false)
    this.states.set(id, { phase: 'free' })
  }

  setPockets(pockets: PaperPocket[]) {
    this.pockets = pockets
    for (const [id, state] of this.states) {
      if (state.phase !== 'wedged') continue
      const body = this.balls.get(id)!
      const pocket = pockets.find(pocket => pocket.id === state.pocketId)
      if (!pocket || classifyPocket(BALL_RADIUS, pocket.radius) === 'pass') {
        Body.setStatic(body, false)
        Body.setVelocity(body, { x: 0, y: 0 })
        Sleeping.set(body, false)
        this.states.set(id, { phase: 'free' })
      } else {
        Body.setPosition(body, { x: pocket.x + state.offset!.x * pocket.radius, y: pocket.y + state.offset!.y * pocket.radius })
        this.contain(body, false)
        if (pocketArrival(BALL_RADIUS, pocket, body.position, body.position, 0) === 'sunk') this.capture(id, pocket, 'sunk')
      }
    }
  }

  private capture(id: string, pocket: PaperPocket, phase: 'sunk' | 'wedged') {
    const body = this.balls.get(id)!
    Body.setVelocity(body, { x: 0, y: 0 })
    Body.setAngularVelocity(body, 0)
    if (phase === 'sunk') {
      Composite.remove(this.engine.world, body)
      Body.setPosition(body, pocket)
      this.states.set(id, { phase, pocketId: pocket.id })
    } else {
      let dx = body.position.x - pocket.x, dy = body.position.y - pocket.y
      const distance = Math.hypot(dx, dy)
      // Seat visibly on the opening rather than disappear at its center.
      const seat = Math.max(distance, BALL_RADIUS * POCKET_WEDGE_SEAT_RATIO)
      dx = distance ? dx / distance * seat : 0
      dy = distance ? dy / distance * seat : seat
      Body.setStatic(body, true)
      Body.setPosition(body, { x: pocket.x + dx, y: pocket.y + dy })
      this.contain(body, false)
      this.states.set(id, { phase, pocketId: pocket.id, offset: { x: dx / pocket.radius, y: dy / pocket.radius } })
    }
  }

  resize(size: SheetSize, angle = this.angle) {
    if (this.disposed) return
    angle = screenAngle(angle)
    if (size.width === this.size.width && size.height === this.size.height && angle === this.angle) return
    const previous = this.frame
    this.size = size
    this.angle = angle
    // Transform every body before resolving it against the resized walls.
    // Angular state and identity stay intact; linear speed is never scaled.
    for (const [id, body] of this.balls) {
      if (this.states.get(id)?.phase === 'sunk') continue
      const position = reframeScreenPoint(body.position, previous, this.frame)
      const velocity = rotateScreenVector(body.velocity, previous.angle, angle)
      Body.setPosition(body, position)
      Body.setVelocity(body, velocity)
      this.contain(body, false)
      Sleeping.set(body, false)
    }
    const { width: w, height: h } = size
    const options = { isStatic: true, friction: 0.5, restitution: 0.05 }
    if (!this.boundaries.length) {
      this.boundaries = [
      Bodies.rectangle(-40, h / 2, 80, h + 160, { ...options, label: 'sheet:left' }),
      Bodies.rectangle(w + 40, h / 2, 80, h + 160, { ...options, label: 'sheet:right' }),
      Bodies.rectangle(w / 2, -40, w + 160, 80, { ...options, label: 'sheet:top' }),
      Bodies.rectangle(w / 2, h + 40, w + 160, 80, { ...options, label: 'sheet:bottom' }),
      ]
      Composite.add(this.engine.world, this.boundaries)
    } else {
      // Reuse all four wall identities; resizing is atomic between engine steps.
      const positions = [{ x: -40, y: h / 2 }, { x: w + 40, y: h / 2 }, { x: w / 2, y: -40 }, { x: w / 2, y: h + 40 }]
      this.boundaries.forEach((wall, i) => {
        Body.scale(wall, i < 2 ? 1 : (w + 160) / (previous.width + 160), i < 2 ? (h + 160) / (previous.height + 160) : 1)
        Body.setPosition(wall, positions[i])
      })
    }
  }

  private contain(body: Matter.Body, stop = true) {
    const x = Math.max(BALL_RADIUS, Math.min(this.size.width - BALL_RADIUS, body.position.x))
    const y = Math.max(BALL_RADIUS, Math.min(this.size.height - BALL_RADIUS, body.position.y))
    if (x !== body.position.x || y !== body.position.y) {
      Body.setPosition(body, { x, y })
      if (stop) Body.setVelocity(body, { x: 0, y: 0 })
    }
  }

  setActive(active: boolean) {
    if (!active && this.held) this.releaseGrab(this.held.pointerId)
    this.active = active
  }

  step(milliseconds: number, gravity: Gravity) {
    if (this.disposed || !this.active) return
    this.setGravity(gravity)
    const before = new Map([...this.balls].filter(([id]) => this.states.get(id)?.phase === 'free').map(([id, body]) => [id, { ...body.position }]))
    Engine.update(this.engine, milliseconds)
    // Also keep bodies inside after an extreme collision/viewport change.
    for (const [id, body] of this.balls) {
      if (this.states.get(id)?.phase !== 'free') continue
      if (body.position.x < 0 || body.position.x > this.size.width || body.position.y < 0 || body.position.y > this.size.height) this.contain(body)
      for (const pocket of this.pockets) {
        const arrival = pocketArrival(BALL_RADIUS, pocket, before.get(id)!, body.position, Body.getSpeed(body))
        if (arrival) { this.capture(id, pocket, arrival); break }
      }
    }
  }

  dispose() {
    this.disposed = true
    Composite.clear(this.engine.world, false)
    Engine.clear(this.engine)
    this.balls.clear()
    this.states.clear()
    this.held = null
    this.pockets = []
    this.boundaries = []
  }
}
